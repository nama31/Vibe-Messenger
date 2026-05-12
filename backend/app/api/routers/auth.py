from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import or_

from app.core.database import get_db
from app.core.security import create_access_token, create_refresh_token, get_current_user, pwd_context
from app.models import User
from app.schemas import AuthResponse, LoginRequest, UserCreate, UserRead

router = APIRouter()


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(body: UserCreate, db: AsyncSession = Depends(get_db)) -> AuthResponse:
    """Create a new user account. Returns user object + JWT pair."""
    # 1. Duplicate check
    result = await db.execute(
        select(User).where(or_(User.username == body.username, User.email == body.email))
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=409, detail="Username or email already registered")

    # 2. Hash password
    hashed = pwd_context.hash(body.password)

    # 3. Persist new user
    user = User(
        username=body.username,
        email=body.email,
        password_hash=hashed,
        display_name=body.display_name,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    # 4. Issue tokens
    token_data = {"sub": str(user.id)}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    return AuthResponse(
        user=UserRead.model_validate(user),
        access_token=access_token,
        refresh_token=refresh_token,
    )


@router.post("/login", response_model=AuthResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)) -> AuthResponse:
    """Authenticate via email + password. Returns JWT pair."""
    # 1. Look up user by email
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="No account found with that email")

    # 2. Verify password
    if not pwd_context.verify(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect password")

    # 3. Issue tokens
    token_data = {"sub": str(user.id)}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    return AuthResponse(
        user=UserRead.model_validate(user),
        access_token=access_token,
        refresh_token=refresh_token,
    )


@router.get("/me", response_model=UserRead)
async def get_me(current_user: User = Depends(get_current_user)):
    """Return the caller's full user object."""
    return current_user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(current_user: User = Depends(get_current_user)) -> None:
    """Invalidate the refresh token. Access token expires naturally."""
    return None  # 204 No Content — no blacklist in Phase 1
