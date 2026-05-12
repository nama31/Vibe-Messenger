import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
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
    """
    Trigram/ILIKE search on username and display_name.
    The calling user is excluded from results.
    """
    pattern = f"%{q}%"

    # Base filter: match either field, exclude self
    where_clause = (
        or_(
            User.username.ilike(pattern),
            User.display_name.ilike(pattern),
        )
        & (User.id != current_user.id)
    )

    # Total count (for pagination metadata)
    count_result = await db.execute(
        select(func.count()).select_from(User).where(where_clause)
    )
    total = count_result.scalar_one()

    # Paginated rows — order by username for stable results
    rows_result = await db.execute(
        select(User)
        .where(where_clause)
        .order_by(User.username)
        .limit(limit)
        .offset(offset)
    )
    users = rows_result.scalars().all()

    return UserSearchResponse(
        total=total,
        users=[UserPublic.model_validate(u) for u in users],
    )


@router.get("/me", response_model=UserRead)
async def get_my_profile(current_user: User = Depends(get_current_user)):
    """Return the authenticated caller's full profile."""
    return current_user


@router.patch("/me", response_model=UserRead)
async def update_my_profile(
    body: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Update display_name and/or avatar_url.
    Only fields explicitly provided in the request body are changed.
    Pass avatar_url=null to remove the avatar.
    """
    updated = False

    if body.display_name is not None:
        current_user.display_name = body.display_name
        updated = True

    # avatar_url is special: the client can send null to clear it,
    # so we check whether the key was present rather than just truthy.
    if "avatar_url" in body.model_fields_set:
        current_user.avatar_url = body.avatar_url
        updated = True

    if updated:
        db.add(current_user)
        await db.commit()
        await db.refresh(current_user)

    return current_user


@router.get("/{user_id}", response_model=UserPublic)
async def get_user(
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch a single user's public profile by UUID."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return user
