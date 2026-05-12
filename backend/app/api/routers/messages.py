import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models import User
from app.schemas import MessageRead, MessageSearchResponse, MessageUpdate

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
    """Full-text search across caller's conversations using pg ts_tsvector."""
    pass


@router.patch("/{message_id}", response_model=MessageRead)
async def edit_message(
    message_id: uuid.UUID,
    body: MessageUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Edit own message content. Broadcasts message_edited WS event."""
    pass


@router.delete("/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_message(
    message_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete own message (is_deleted=True). Broadcasts message_deleted WS event."""
    pass
