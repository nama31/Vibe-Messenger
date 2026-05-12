import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models import User
from app.schemas import UserPublic, UserRead, UserSearchResponse, UserUpdate

router = APIRouter()


@router.get("", response_model=UserSearchResponse)
async def search_users(
    q: str = Query(..., min_length=2),
    limit: int = Query(20, le=50),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Trigram search on username and display_name. Caller excluded."""
    pass


@router.get("/me", response_model=UserRead)
async def get_my_profile(current_user: User = Depends(get_current_user)):
    """Return the authenticated caller's full profile."""
    pass


@router.patch("/me", response_model=UserRead)
async def update_my_profile(
    body: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update display_name or avatar_url."""
    pass


@router.get("/{user_id}", response_model=UserPublic)
async def get_user(
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch a single user's public profile."""
    pass
