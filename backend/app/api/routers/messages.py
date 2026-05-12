import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import get_current_user
from app.models import Conversation, ConversationParticipant, Message, User
from app.schemas import (
    MessageRead,
    MessageSearchResponse,
    MessageSearchResult,
    MessageUpdate,
    UserPublic,
)
from app.ws.manager import manager

router = APIRouter()


@router.get("/search", response_model=MessageSearchResponse)
async def search_messages(
    q: str = Query(..., min_length=2),
    conversation_id: uuid.UUID | None = Query(None),
    limit: int = Query(20, le=50),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Full-text search across all messages in conversations the caller participates in.
    Optionally scoped to a single conversation via `conversation_id`.
    Deleted messages are excluded. Matched terms are wrapped in <em> tags.
    """

    # Sub-query: conversation IDs the caller is in
    caller_conv_ids = (
        select(ConversationParticipant.conversation_id)
        .where(ConversationParticipant.user_id == current_user.id)
        .scalar_subquery()
    )

    # Base filter
    base_filter = [
        Message.conversation_id.in_(caller_conv_ids),
        Message.is_deleted == False,
        # Full-text match using PostgreSQL tsvector
        func.to_tsvector("english", Message.content).op("@@")(
            func.plainto_tsquery("english", q)
        ),
    ]
    if conversation_id is not None:
        base_filter.append(Message.conversation_id == conversation_id)

    # Total count
    count_result = await db.execute(
        select(func.count()).select_from(Message).where(*base_filter)
    )
    total = count_result.scalar_one()

    # Paginated rows with sender loaded
    rows_result = await db.execute(
        select(Message)
        .where(*base_filter)
        .options(selectinload(Message.sender))
        .order_by(Message.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    rows = rows_result.scalars().all()

    # Build results with ts_headline for highlighted snippets
    results: list[MessageSearchResult] = []
    for msg in rows:
        # ts_headline wraps matched terms in <em>...</em>
        headline_result = await db.execute(
            select(
                func.ts_headline(
                    "english",
                    msg.content,
                    func.plainto_tsquery("english", q),
                    "StartSel=<em>, StopSel=</em>, MaxWords=20, MinWords=5",
                )
            )
        )
        highlighted = headline_result.scalar_one()

        # Load conversation metadata
        conv_result = await db.execute(
            select(Conversation).where(Conversation.id == msg.conversation_id)
        )
        conv = conv_result.scalar_one()

        results.append(
            MessageSearchResult(
                message={
                    "id": str(msg.id),
                    "content": highlighted,
                    "created_at": msg.created_at.isoformat(),
                },
                conversation={
                    "id": str(conv.id),
                    "name": conv.name,
                    "is_group": conv.is_group,
                },
                sender=UserPublic.model_validate(msg.sender),
            )
        )

    return MessageSearchResponse(total=total, results=results)


@router.patch("/{message_id}", response_model=MessageRead)
async def edit_message(
    message_id: uuid.UUID,
    body: MessageUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Edit own message content. Sets is_edited=True and updates updated_at."""
    result = await db.execute(
        select(Message)
        .where(Message.id == message_id)
        .options(selectinload(Message.sender))
    )
    msg = result.scalar_one_or_none()

    if msg is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found",
        )
    if msg.sender_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own messages",
        )
    if msg.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot edit a deleted message",
        )

    msg.content = body.content
    msg.is_edited = True
    msg.updated_at = datetime.now(timezone.utc)
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    # Reload sender after refresh
    result = await db.execute(
        select(Message)
        .where(Message.id == msg.id)
        .options(selectinload(Message.sender))
    )
    msg = result.scalar_one()
    msg_read = MessageRead.model_validate(msg)

    # Broadcast to the conversation room
    await manager.broadcast(
        str(msg.conversation_id),
        {
            "event": "message_edited",
            "payload": {
                "id": str(msg.id),
                "conversation_id": str(msg.conversation_id),
                "content": msg.content,
                "is_edited": True,
                "updated_at": msg.updated_at.isoformat(),
            },
        },
    )

    return msg_read


@router.delete("/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_message(
    message_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete own message: sets is_deleted=True and replaces content with '[deleted]'."""
    result = await db.execute(
        select(Message).where(Message.id == message_id)
    )
    msg = result.scalar_one_or_none()

    if msg is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found",
        )
    if msg.sender_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own messages",
        )

    msg.is_deleted = True
    msg.content = "[deleted]"
    msg.updated_at = datetime.now(timezone.utc)
    db.add(msg)
    await db.commit()

    # Broadcast to the conversation room
    await manager.broadcast(
        str(msg.conversation_id),
        {
            "event": "message_deleted",
            "payload": {
                "id": str(message_id),
                "conversation_id": str(msg.conversation_id),
            },
        },
    )
