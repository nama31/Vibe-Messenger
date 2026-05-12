import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models import User
from app.schemas import (
    AddParticipantsRequest,
    AddParticipantsResponse,
    ConversationCreate,
    ConversationListResponse,
    ConversationRead,
    MessageCreate,
    MessageHistoryResponse,
    MessageRead,
)

router = APIRouter()


@router.get("", response_model=ConversationListResponse)
async def list_conversations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all conversations the caller participates in, ordered by most recent message."""
    pass


@router.post("", response_model=ConversationRead, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    body: ConversationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a DM or group conversation. Returns 200 if DM already exists."""
    pass


@router.get("/{conversation_id}", response_model=ConversationRead)
async def get_conversation(
    conversation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get conversation metadata + participant list. Caller must be a participant."""
    pass


@router.post("/{conversation_id}/participants", response_model=AddParticipantsResponse)
async def add_participants(
    conversation_id: uuid.UUID,
    body: AddParticipantsRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add one or more users to a group conversation."""
    pass


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
    """Remove a participant (self-leave or creator removes member)."""
    pass


@router.get("/{conversation_id}/messages", response_model=MessageHistoryResponse)
async def get_messages(
    conversation_id: uuid.UUID,
    limit: int = Query(50, le=100),
    before: uuid.UUID | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Paginated message history (cursor-based, newest first). Updates last_read_at."""
    pass


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
    """REST fallback to send a message and broadcast via WebSocket."""
    pass
