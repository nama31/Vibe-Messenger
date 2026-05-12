import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, HttpUrl


# ---------------------------------------------------------------------------
# User schemas
# ---------------------------------------------------------------------------

class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=30, pattern=r"^[a-z0-9_]+$")
    email: EmailStr
    password: str = Field(..., min_length=8)
    display_name: str = Field(..., min_length=1, max_length=80)


class UserRead(BaseModel):
    id: uuid.UUID
    username: str
    display_name: str
    avatar_url: Optional[str] = None
    is_online: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UserPublic(BaseModel):
    """Minimal public profile (e.g. inside message/conversation payloads)."""
    id: uuid.UUID
    username: str
    display_name: str
    avatar_url: Optional[str] = None
    is_online: bool
    last_seen: Optional[datetime] = None

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    display_name: Optional[str] = Field(None, min_length=1, max_length=80)
    avatar_url: Optional[str] = None


# ---------------------------------------------------------------------------
# Auth schemas
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str


class AuthResponse(BaseModel):
    user: UserRead
    access_token: str
    refresh_token: str


# ---------------------------------------------------------------------------
# Conversation schemas
# ---------------------------------------------------------------------------

class ConversationCreate(BaseModel):
    is_group: bool = False
    name: Optional[str] = Field(None, min_length=1, max_length=80)
    participant_ids: list[uuid.UUID]


class ConversationRead(BaseModel):
    id: uuid.UUID
    name: Optional[str]
    is_group: bool
    participants: list[UserPublic]
    last_message: Optional["MessageSummary"] = None
    unread_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Participant schemas
# ---------------------------------------------------------------------------

class AddParticipantsRequest(BaseModel):
    user_ids: list[uuid.UUID]


class AddParticipantsResponse(BaseModel):
    added: list[uuid.UUID]


# ---------------------------------------------------------------------------
# Message schemas
# ---------------------------------------------------------------------------

class MessageCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=4000)
    message_type: str = "text"


class MessageUpdate(BaseModel):
    content: str = Field(..., min_length=1, max_length=4000)


class MessageSummary(BaseModel):
    id: uuid.UUID
    sender: UserPublic
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class MessageRead(BaseModel):
    id: uuid.UUID
    conversation_id: uuid.UUID
    sender: UserPublic
    content: str
    message_type: str
    is_deleted: bool
    is_edited: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Paginated response schemas
# ---------------------------------------------------------------------------

class UserSearchResponse(BaseModel):
    total: int
    users: list[UserPublic]


class ConversationListResponse(BaseModel):
    conversations: list[ConversationRead]


class MessageHistoryResponse(BaseModel):
    has_more: bool
    messages: list[MessageRead]


class MessageSearchResult(BaseModel):
    message: dict
    conversation: dict
    sender: UserPublic


class MessageSearchResponse(BaseModel):
    total: int
    results: list[MessageSearchResult]


# Forward reference resolution
ConversationRead.model_rebuild()
