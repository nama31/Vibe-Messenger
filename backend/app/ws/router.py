import uuid

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.ws.manager import manager

router = APIRouter()


@router.websocket("/ws/{conversation_id}")
async def websocket_endpoint(
    ws: WebSocket,
    conversation_id: uuid.UUID,
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Bidirectional real-time channel for a conversation room.
    Client actions: send_message | typing | mark_read
    Server events:  chat_message | message_edited | message_deleted |
                    typing_status | user_presence | participant_added |
                    participant_removed | conversation_created
    """
    pass
