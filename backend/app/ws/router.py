import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, WebSocketException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal
from app.core.redis import get_redis
from app.core.security import decode_token
from app.models import (
    Conversation,
    ConversationParticipant,
    Message,
    User,
)
from app.schemas import MessageRead, UserPublic
from app.ws.manager import manager

router = APIRouter()

# Redis key templates (match architecture spec)
PRESENCE_KEY = "presence:{user_id}"
TYPING_KEY = "typing:{conversation_id}:{user_id}"
TYPING_TTL = 3  # seconds


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _authenticate(token: str) -> uuid.UUID:
    """
    Decode the JWT from the query param and return the user UUID.
    Raises WebSocketException(4001) on any auth failure.
    """
    try:
        payload = decode_token(token)
        user_id_str = payload.get("sub")
        if not user_id_str:
            raise ValueError("missing sub")
        return uuid.UUID(user_id_str)
    except Exception:
        raise WebSocketException(code=4001, reason="ws_auth_failed")


async def _get_user(db, user_id: uuid.UUID) -> User:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise WebSocketException(code=4001, reason="ws_auth_failed")
    return user


async def _verify_participant(db, conversation_id: uuid.UUID, user_id: uuid.UUID) -> None:
    """Raises WebSocketException(4003) if the user is not in the conversation."""
    result = await db.execute(
        select(ConversationParticipant).where(
            ConversationParticipant.conversation_id == conversation_id,
            ConversationParticipant.user_id == user_id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise WebSocketException(code=4003, reason="ws_not_participant")


async def _get_all_conversation_ids(db, user_id: uuid.UUID) -> list[str]:
    """Return all conversation IDs the user participates in (for presence broadcast)."""
    result = await db.execute(
        select(ConversationParticipant.conversation_id).where(
            ConversationParticipant.user_id == user_id
        )
    )
    return [str(row[0]) for row in result.all()]


async def _broadcast_presence(
    conv_ids: list[str],
    user: User,
    is_online: bool,
    last_seen: datetime | None = None,
) -> None:
    """Broadcast user_presence to every conversation room the user is in."""
    payload = {
        "event": "user_presence",
        "payload": {
            "user_id": str(user.id),
            "username": user.username,
            "is_online": is_online,
            "last_seen": last_seen.isoformat() if last_seen else None,
        },
    }
    for conv_id in conv_ids:
        await manager.broadcast(conv_id, payload)


# ---------------------------------------------------------------------------
# WebSocket endpoint
# ---------------------------------------------------------------------------

@router.websocket("/ws/{conversation_id}")
async def websocket_endpoint(
    ws: WebSocket,
    conversation_id: uuid.UUID,
    token: str,
) -> None:
    """
    Bidirectional real-time channel for a conversation room.

    Auth:   JWT passed as ?token=<access_token> query param.
    Close codes:
        4001 — invalid / expired token
        4003 — caller is not a participant

    Client → Server actions:
        send_message  { action, content, message_type? }
        typing        { action, is_typing: bool }
        mark_read     { action }

    Server → Client events (envelope: { event, payload }):
        chat_message, message_edited, message_deleted,
        typing_status, user_presence,
        participant_added, participant_removed, conversation_created
    """

    # ---- 1. Auth & participant check (before accepting) --------------------
    user_id = await _authenticate(token)

    # Use a fresh DB session for the lifetime of this connection
    async with AsyncSessionLocal() as db:
        user = await _get_user(db, user_id)
        await _verify_participant(db, conversation_id, user_id)

        conv_id_str = str(conversation_id)
        user_id_str = str(user_id)

        # ---- 2. Accept connection & register in room -----------------------
        await manager.connect(ws, conv_id_str, user_id_str)

        redis = await get_redis()

        # ---- 3. Mark user online in Redis + DB -----------------------------
        if redis:
            await redis.set(PRESENCE_KEY.format(user_id=user_id_str), "online")

        user.is_online = True
        db.add(user)
        await db.commit()

        # Broadcast online presence to all rooms this user is in
        all_conv_ids = await _get_all_conversation_ids(db, user_id)
        await _broadcast_presence(all_conv_ids, user, is_online=True)

        # ---- 4. Message loop -----------------------------------------------
        try:
            while True:
                raw = await ws.receive_text()

                try:
                    data = json.loads(raw)
                except json.JSONDecodeError:
                    await ws.send_text(
                        json.dumps({"error": "invalid_json", "message": "Payload must be valid JSON"})
                    )
                    continue

                action = data.get("action")

                # ---- send_message ------------------------------------------
                if action == "send_message":
                    content = (data.get("content") or "").strip()
                    if not content or len(content) > 4000:
                        await ws.send_text(
                            json.dumps({"error": "validation_error", "message": "content must be 1–4000 chars"})
                        )
                        continue

                    message_type = data.get("message_type", "text")
                    if message_type not in ("text", "emoji"):
                        message_type = "text"

                    # Persist to DB
                    msg = Message(
                        conversation_id=conversation_id,
                        sender_id=user_id,
                        content=content,
                        message_type=message_type,
                    )
                    db.add(msg)
                    await db.commit()
                    await db.refresh(msg)

                    # Reload with sender relationship for the payload
                    msg_result = await db.execute(
                        select(Message)
                        .where(Message.id == msg.id)
                        .options(selectinload(Message.sender))
                    )
                    msg = msg_result.scalar_one()
                    msg_read = MessageRead.model_validate(msg)

                    # Broadcast to the whole room (including sender — confirms delivery)
                    await manager.broadcast(
                        conv_id_str,
                        {
                            "event": "chat_message",
                            "payload": msg_read.model_dump(mode="json"),
                        },
                    )

                # ---- typing ------------------------------------------------
                elif action == "typing":
                    is_typing: bool = bool(data.get("is_typing", False))

                    if redis:
                        key = TYPING_KEY.format(
                            conversation_id=conv_id_str, user_id=user_id_str
                        )
                        if is_typing:
                            await redis.set(key, "1", ex=TYPING_TTL)
                        else:
                            await redis.delete(key)

                    # Broadcast to others only — sender doesn't need to see their own indicator
                    await manager.broadcast(
                        conv_id_str,
                        {
                            "event": "typing_status",
                            "payload": {
                                "conversation_id": conv_id_str,
                                "user_id": user_id_str,
                                "username": user.username,
                                "is_typing": is_typing,
                            },
                        },
                        exclude_user_id=user_id_str,
                    )

                # ---- mark_read ---------------------------------------------
                elif action == "mark_read":
                    part_result = await db.execute(
                        select(ConversationParticipant).where(
                            ConversationParticipant.conversation_id == conversation_id,
                            ConversationParticipant.user_id == user_id,
                        )
                    )
                    part_row = part_result.scalar_one_or_none()
                    if part_row:
                        part_row.last_read_at = datetime.now(timezone.utc)
                        db.add(part_row)
                        await db.commit()

                else:
                    await ws.send_text(
                        json.dumps({"error": "unknown_action", "message": f"Unknown action: {action!r}"})
                    )

        # ---- 5. Disconnect -------------------------------------------------
        except WebSocketDisconnect:
            pass

        finally:
            manager.disconnect(ws, conv_id_str, user_id_str)

            # Clear Redis presence key
            if redis:
                await redis.delete(PRESENCE_KEY.format(user_id=user_id_str))

            # Update DB: is_online=False, last_seen=now
            now = datetime.now(timezone.utc)
            user.is_online = False
            user.last_seen = now
            db.add(user)
            await db.commit()

            # Broadcast offline presence to all rooms
            await _broadcast_presence(all_conv_ids, user, is_online=False, last_seen=now)
