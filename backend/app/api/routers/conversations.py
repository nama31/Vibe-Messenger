import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import and_, exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import get_current_user
from app.models import Conversation, ConversationParticipant, Message, User
from app.schemas import (
    AddParticipantsRequest,
    AddParticipantsResponse,
    ConversationCreate,
    ConversationListResponse,
    ConversationRead,
    MessageCreate,
    MessageHistoryResponse,
    MessageRead,
    MessageSummary,
    UserPublic,
)
from app.ws.manager import manager

router = APIRouter()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

MAX_GROUP_PARTICIPANTS = 50


async def _get_participant_row(
    db: AsyncSession, conversation_id: uuid.UUID, user_id: uuid.UUID
) -> ConversationParticipant | None:
    result = await db.execute(
        select(ConversationParticipant).where(
            ConversationParticipant.conversation_id == conversation_id,
            ConversationParticipant.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def _require_participant(
    db: AsyncSession, conversation_id: uuid.UUID, user_id: uuid.UUID
) -> ConversationParticipant:
    row = await _get_participant_row(db, conversation_id, user_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a participant of this conversation",
        )
    return row


async def _load_conversation(
    db: AsyncSession, conversation_id: uuid.UUID
) -> Conversation:
    """Load a conversation with participants and their users eagerly."""
    result = await db.execute(
        select(Conversation)
        .where(Conversation.id == conversation_id)
        .options(
            selectinload(Conversation.participants).selectinload(
                ConversationParticipant.user
            )
        )
    )
    conv = result.scalar_one_or_none()
    if conv is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )
    return conv


async def _build_conversation_read(
    db: AsyncSession,
    conv: Conversation,
    current_user_id: uuid.UUID,
) -> ConversationRead:
    """Assemble a ConversationRead including last_message and unread_count."""

    # Last message
    last_msg_result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conv.id, Message.is_deleted == False)
        .options(selectinload(Message.sender))
        .order_by(Message.created_at.desc())
        .limit(1)
    )
    last_msg_row = last_msg_result.scalar_one_or_none()
    last_message = None
    if last_msg_row:
        last_message = MessageSummary(
            id=last_msg_row.id,
            sender=UserPublic.model_validate(last_msg_row.sender),
            content=last_msg_row.content,
            created_at=last_msg_row.created_at,
        )

    # Unread count — messages after caller's last_read_at
    participant_row = next(
        (p for p in conv.participants if p.user_id == current_user_id), None
    )
    unread_count = 0
    if participant_row is not None:
        unread_q = select(func.count()).select_from(Message).where(
            Message.conversation_id == conv.id,
            Message.is_deleted == False,
        )
        if participant_row.last_read_at is not None:
            unread_q = unread_q.where(
                Message.created_at > participant_row.last_read_at
            )
        unread_result = await db.execute(unread_q)
        unread_count = unread_result.scalar_one()

    return ConversationRead(
        id=conv.id,
        name=conv.name,
        is_group=conv.is_group,
        participants=[UserPublic.model_validate(p.user) for p in conv.participants],
        last_message=last_message,
        unread_count=unread_count,
        created_at=conv.created_at,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=ConversationListResponse)
async def list_conversations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all conversations the caller participates in, ordered by most recent message."""

    # Find all conversation IDs the caller is in
    part_result = await db.execute(
        select(ConversationParticipant.conversation_id).where(
            ConversationParticipant.user_id == current_user.id
        )
    )
    conv_ids = [row[0] for row in part_result.all()]

    if not conv_ids:
        return ConversationListResponse(conversations=[])

    # Load those conversations with participants
    convs_result = await db.execute(
        select(Conversation)
        .where(Conversation.id.in_(conv_ids))
        .options(
            selectinload(Conversation.participants).selectinload(
                ConversationParticipant.user
            )
        )
    )
    convs = convs_result.scalars().all()

    # Build response objects (includes last_message + unread_count per conv)
    items = []
    for conv in convs:
        items.append(await _build_conversation_read(db, conv, current_user.id))

    # Sort by last_message.created_at desc, conversations with no messages last
    items.sort(
        key=lambda c: c.last_message.created_at if c.last_message else datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )

    return ConversationListResponse(conversations=items)


@router.post("", response_model=ConversationRead, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    body: ConversationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    response: Response = None,
):
    """
    Create a DM or group conversation.
    - DM: exactly 1 participant_id required. Returns existing DM if one already exists (HTTP 200).
    - Group: name required, 1–50 participant_ids.
    Caller is always added as a participant.
    """

    # ---- Validation --------------------------------------------------------
    if not body.is_group:
        if len(body.participant_ids) != 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A DM requires exactly one participant_id",
            )
        other_id = body.participant_ids[0]
        if other_id == current_user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot start a DM with yourself",
            )

        # Check for existing DM between these two users
        existing_result = await db.execute(
            select(Conversation)
            .where(Conversation.is_group == False)
            .where(
                exists(
                    select(ConversationParticipant.id).where(
                        ConversationParticipant.conversation_id == Conversation.id,
                        ConversationParticipant.user_id == current_user.id,
                    )
                )
            )
            .where(
                exists(
                    select(ConversationParticipant.id).where(
                        ConversationParticipant.conversation_id == Conversation.id,
                        ConversationParticipant.user_id == other_id,
                    )
                )
            )
            .options(
                selectinload(Conversation.participants).selectinload(
                    ConversationParticipant.user
                )
            )
        )
        existing_conv = existing_result.scalar_one_or_none()
        if existing_conv is not None:
            if response is not None:
                response.status_code = status.HTTP_200_OK
            return await _build_conversation_read(db, existing_conv, current_user.id)

    else:
        # Group validation
        if not body.name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Group conversations require a name",
            )
        if len(body.participant_ids) < 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Group requires at least one other participant",
            )
        # Deduplicate and exclude self (caller is added automatically)
        other_ids = list({pid for pid in body.participant_ids if pid != current_user.id})
        if len(other_ids) + 1 > MAX_GROUP_PARTICIPANTS:  # +1 for creator
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Group cannot exceed {MAX_GROUP_PARTICIPANTS} participants",
            )
        body.participant_ids = other_ids

    # ---- Create conversation -----------------------------------------------
    conv = Conversation(
        name=body.name,
        is_group=body.is_group,
        created_by=current_user.id,
    )
    db.add(conv)
    await db.flush()  # get conv.id without committing

    # Add caller first
    all_participant_ids = [current_user.id] + [
        pid for pid in body.participant_ids if pid != current_user.id
    ]
    for uid in all_participant_ids:
        db.add(ConversationParticipant(conversation_id=conv.id, user_id=uid))

    await db.commit()

    # Reload with relationships
    conv = await _load_conversation(db, conv.id)
    conv_read = await _build_conversation_read(db, conv, current_user.id)

    # Broadcast conversation_created to all participants
    await manager.broadcast(
        str(conv.id),
        {
            "event": "conversation_created",
            "payload": conv_read.model_dump(mode="json"),
        },
    )

    return conv_read


@router.get("/{conversation_id}", response_model=ConversationRead)
async def get_conversation(
    conversation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get conversation metadata + participant list. Caller must be a participant."""
    await _require_participant(db, conversation_id, current_user.id)
    conv = await _load_conversation(db, conversation_id)
    return await _build_conversation_read(db, conv, current_user.id)


@router.post("/{conversation_id}/participants", response_model=AddParticipantsResponse)
async def add_participants(
    conversation_id: uuid.UUID,
    body: AddParticipantsRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add one or more users to a group conversation."""
    await _require_participant(db, conversation_id, current_user.id)
    conv = await _load_conversation(db, conversation_id)

    if not conv.is_group:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot add participants to a DM conversation",
        )

    existing_ids = {p.user_id for p in conv.participants}
    current_count = len(existing_ids)

    added_ids: list[uuid.UUID] = []
    for uid in body.user_ids:
        if uid in existing_ids:
            continue  # already a member — skip silently
        if current_count >= MAX_GROUP_PARTICIPANTS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Group cannot exceed {MAX_GROUP_PARTICIPANTS} participants",
            )
        # Verify user exists
        user_result = await db.execute(select(User).where(User.id == uid))
        if user_result.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User {uid} not found",
            )
        db.add(ConversationParticipant(conversation_id=conversation_id, user_id=uid))
        added_ids.append(uid)
        current_count += 1

    if added_ids:
        await db.commit()
        # Broadcast participant_added for each new member
        for uid in added_ids:
            user_result = await db.execute(select(User).where(User.id == uid))
            new_user = user_result.scalar_one()
            await manager.broadcast(
                str(conversation_id),
                {
                    "event": "participant_added",
                    "payload": {
                        "conversation_id": str(conversation_id),
                        "user": UserPublic.model_validate(new_user).model_dump(mode="json"),
                    },
                },
            )

    return AddParticipantsResponse(added=added_ids)


@router.delete(
    "/{conversation_id}/participants/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_participant(
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a participant. Self-leave always allowed; removing others requires being creator."""
    conv = await _load_conversation(db, conversation_id)

    if not conv.is_group:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove participants from a DM conversation",
        )

    # Caller must be a participant themselves
    await _require_participant(db, conversation_id, current_user.id)

    # Only creator can remove others
    if user_id != current_user.id and conv.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the conversation creator can remove other members",
        )

    target_row = await _get_participant_row(db, conversation_id, user_id)
    if target_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not a participant of this conversation",
        )

    await db.delete(target_row)
    await db.commit()

    await manager.broadcast(
        str(conversation_id),
        {
            "event": "participant_removed",
            "payload": {
                "conversation_id": str(conversation_id),
                "user_id": str(user_id),
            },
        },
    )


@router.get("/{conversation_id}/messages", response_model=MessageHistoryResponse)
async def get_messages(
    conversation_id: uuid.UUID,
    limit: int = Query(50, le=100),
    before: uuid.UUID | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Paginated message history, newest first.
    Use `before=<message_uuid>` as a cursor to load older pages.
    Side effect: updates last_read_at for the caller.
    """
    participant_row = await _require_participant(db, conversation_id, current_user.id)

    # Build base query
    query = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .options(selectinload(Message.sender))
        .order_by(Message.created_at.desc())
    )

    # Cursor: if `before` is given, find that message's timestamp and filter
    if before is not None:
        cursor_result = await db.execute(
            select(Message.created_at).where(Message.id == before)
        )
        cursor_ts = cursor_result.scalar_one_or_none()
        if cursor_ts is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Cursor message not found",
            )
        query = query.where(Message.created_at < cursor_ts)

    # Fetch limit+1 to determine has_more
    query = query.limit(limit + 1)
    rows_result = await db.execute(query)
    rows = rows_result.scalars().all()

    has_more = len(rows) > limit
    messages = rows[:limit]

    # Update last_read_at
    participant_row.last_read_at = datetime.now(timezone.utc)
    db.add(participant_row)
    await db.commit()

    return MessageHistoryResponse(
        has_more=has_more,
        messages=[MessageRead.model_validate(m) for m in messages],
    )


@router.post(
    "/{conversation_id}/messages",
    response_model=MessageRead,
    status_code=status.HTTP_201_CREATED,
)
async def send_message(
    conversation_id: uuid.UUID,
    body: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    REST fallback to send a message.
    Persists to DB then broadcasts chat_message over WebSocket to the room.
    """
    await _require_participant(db, conversation_id, current_user.id)

    msg = Message(
        conversation_id=conversation_id,
        sender_id=current_user.id,
        content=body.content,
        message_type=body.message_type,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    # Reload with sender relationship for the response
    msg_result = await db.execute(
        select(Message)
        .where(Message.id == msg.id)
        .options(selectinload(Message.sender))
    )
    msg = msg_result.scalar_one()

    msg_read = MessageRead.model_validate(msg)

    # Broadcast to all participants in the room
    await manager.broadcast(
        str(conversation_id),
        {
            "event": "chat_message",
            "payload": msg_read.model_dump(mode="json"),
        },
    )

    return msg_read
