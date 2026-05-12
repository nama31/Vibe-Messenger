# Messenger — Full Project Architecture

## Table of Contents

1. Project Overview
2. System Architecture Diagram
3. Tech Stack
4. Database Schema (4 tables)
5. Backend API — Endpoint Index (19 REST + 1 WebSocket)
6. Auth Endpoints
7. User Endpoints
8. Conversation Endpoints
9. Message Endpoints
10. WebSocket — Event & Payload Map
11. Real-time Flow Diagrams
12. Frontend (Next.js) — Page Map
13. Error Response Format
14. Enums and Constants
15. Docker Deployment Structure
16. Implementation Notes

---

## 1. Project Overview

**Messenger** is a real-time full-stack chat application where users can register, find each other, open direct or group conversations, and exchange messages with live delivery — no page refresh required.

**Two actors in the system:**

| Actor | Interface | Role |
|---|---|---|
| **Registered User** | Next.js Web App | Registers, searches users, sends/receives messages in real time |
| **System / API** | FastAPI Backend | Persists messages, manages auth tokens, broadcasts WebSocket events, tracks presence via Redis |

**Core problem solved:** A self-hosted, deployable-in-one-command chat platform that covers the full required feature set (user management, real-time messaging, chat history, message search, dark mode, typing indicators, online/offline presence) while remaining simple enough to build at speed.

**Real-time delivery model:**
```
Every connected client holds a WebSocket to the backend.
Messages are persisted to PostgreSQL first, then broadcast to room subscribers.
Redis holds ephemeral state: typing indicators, presence, and unread counts.
```

---

## 2. System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                            │
│                                                                  │
│          ┌─────────────────────────────────────────┐            │
│          │     Next.js 14 Web App (TypeScript)      │            │
│          │  (Any authenticated user — browser/PWA)  │            │
│          └───────────────┬─────────────────┬────────┘            │
└──────────────────────────┼─────────────────┼────────────────────┘
                           │ REST (JSON/JWT)  │ WebSocket (ws://)
                           ▼                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                         BACKEND LAYER                            │
│                                                                  │
│                  FastAPI Application (Python 3.11)               │
│      ┌───────────┬──────────────┬───────────┬───────────┐        │
│      │  Auth     │    Users     │  Convers. │  Messages │        │
│      │  Router   │    Router    │  Router   │  Router   │        │
│      └───────────┴──────────────┴───────────┴───────────┘        │
│                              │                                   │
│                 ┌────────────┴────────────┐                      │
│                 │  WebSocket Manager      │                      │
│                 │  (ConnectionManager)    │                      │
│                 └────────────┬────────────┘                      │
│                              │                                   │
│              SQLAlchemy 2.x ORM (async) + Alembic                │
└──────────────────────────────┬───────────────────────────────────┘
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
┌──────────────────────────┐   ┌───────────────────────────────────┐
│       DATA LAYER         │   │         CACHE LAYER               │
│                          │   │                                   │
│   PostgreSQL Database    │   │   Redis                           │
│  users │ conversations   │   │  presence  │ typing  │ pub/sub    │
│  conversation_partici-   │   │  (online)  │ (ttl)   │ (rooms)   │
│  pants │ messages        │   │                                   │
└──────────────────────────┘   └───────────────────────────────────┘
```

---

## 3. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| **Backend** | Python 3.11 + FastAPI | Async, auto-generates Swagger docs at `/docs` |
| **ORM** | SQLAlchemy 2.x (async) | Declarative models with `AsyncSession` |
| **Migrations** | Alembic | Version-controlled schema changes |
| **Database** | PostgreSQL 15 | Primary persistence for users, conversations, messages |
| **Cache / Pub-Sub** | Redis 7 | Typing indicators (TTL keys), presence flags, WS room pub/sub |
| **Real-time** | WebSockets (FastAPI native) | Per-conversation rooms; `ConnectionManager` in-process |
| **Auth** | JWT (HS256) + bcrypt | Access token (15 min) + Refresh token (7 days); HttpOnly cookie for refresh |
| **Frontend** | Next.js 14 (App Router) | TypeScript; SSR for initial page, CSR for chat pane |
| **UI Components** | shadcn/ui + TailwindCSS | Radix primitives; dark mode via `next-themes` |
| **Real-time Client** | Native browser WebSocket API | Wrapped in a custom React hook `useChat` |
| **Containerization** | Docker + Docker Compose | One command: `docker-compose up` |
| **Env config** | python-dotenv + `.env` | Never committed to git |

---

## 4. Database Schema

### Table: `users`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | |
| `username` | TEXT | NOT NULL, UNIQUE | 3–30 chars, lowercase, alphanumeric + underscores |
| `email` | TEXT | NOT NULL, UNIQUE | Used for registration and login |
| `password_hash` | TEXT | NOT NULL | bcrypt, cost factor 12 |
| `display_name` | TEXT | NOT NULL | 1–80 chars; shown in UI |
| `avatar_url` | TEXT | NULLABLE | URL to profile picture; NULL shows initials avatar |
| `is_online` | BOOLEAN | NOT NULL, DEFAULT FALSE | Updated by WebSocket connect/disconnect events |
| `last_seen` | TIMESTAMP | NULLABLE | Set on WebSocket disconnect |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | |

**Indexes:**
- `UNIQUE` on `username`
- `UNIQUE` on `email`
- `GIN` index on `username` and `display_name` via `pg_trgm` for fast `ILIKE` search

---

### Table: `conversations`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | |
| `name` | TEXT | NULLABLE | NULL for direct (DM) conversations; required for group chats |
| `is_group` | BOOLEAN | NOT NULL, DEFAULT FALSE | DM = false; group = true |
| `created_by` | UUID | NOT NULL, FK → users(id) | User who created the conversation |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | |

**Indexes:**
- `(created_by, created_at DESC)` — conversations started by a user
- No CASCADE on `created_by`; creator can leave a group without deleting it

---

### Table: `conversation_participants`

Join table — tracks who is a member of which conversation.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | |
| `conversation_id` | UUID | NOT NULL, FK → conversations(id) ON DELETE CASCADE | Removing a conversation removes all participant rows |
| `user_id` | UUID | NOT NULL, FK → users(id) | |
| `joined_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | |
| `last_read_at` | TIMESTAMP | NULLABLE | Timestamp of last message the user has read; used for unread counts |

**Constraints:**
- `UNIQUE (conversation_id, user_id)` — a user cannot be in the same conversation twice

**Indexes:**
- `(user_id, conversation_id)` — fetch all conversations for a user (primary access pattern)
- `(conversation_id)` — fetch all members of a conversation

---

### Table: `messages`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | |
| `conversation_id` | UUID | NOT NULL, FK → conversations(id) ON DELETE CASCADE | |
| `sender_id` | UUID | NOT NULL, FK → users(id) | |
| `content` | TEXT | NOT NULL | Raw text; max 4000 chars |
| `message_type` | TEXT | NOT NULL, DEFAULT `'text'` | See MessageType enum |
| `is_deleted` | BOOLEAN | NOT NULL, DEFAULT FALSE | Soft delete; content replaced with `'[deleted]'` on read |
| `is_edited` | BOOLEAN | NOT NULL, DEFAULT FALSE | Set to TRUE when content is updated |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Immutable after insert |
| `updated_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Auto-updated on edit |

**Indexes:**
- `(conversation_id, created_at DESC)` — chat history pagination (primary read path)
- `(sender_id, created_at DESC)` — messages by a specific user
- `GIN` on `content` via `to_tsvector('english', content)` — full-text message search

---

### Schema Diagram

```
users
  ├─< conversation_participants >─ conversations
  │                                     └─< messages
  └─< messages (as sender_id)

conversations
  └─< conversation_participants
  └─< messages
```

**Cascade rule:** Deleting a `conversation` cascades to `conversation_participants` and `messages`. Users and messages are never hard-deleted; use `is_deleted = true` for messages and remove the participant row for leaving a group.

---

## 5. Backend API — Endpoint Index

### Public (no auth)
| # | Method | Path | Description |
|---|---|---|---|
| 1 | POST | `/auth/register` | Create a new user account |
| 2 | POST | `/auth/login` | Authenticate; receive JWT pair |

### Protected — Authenticated users (JWT required)
| # | Method | Path | Description |
|---|---|---|---|
| 3 | GET | `/auth/me` | Return current user object |
| 4 | POST | `/auth/logout` | Invalidate refresh token |
| 5 | GET | `/users` | Search/list users by username or display_name |
| 6 | GET | `/users/:id` | Get a user's public profile |
| 7 | PATCH | `/users/me` | Update own display_name or avatar_url |
| 8 | GET | `/conversations` | List all conversations the caller is a member of |
| 9 | POST | `/conversations` | Create a DM or group conversation |
| 10 | GET | `/conversations/:id` | Get conversation metadata + participant list |
| 11 | POST | `/conversations/:id/participants` | Add a user to a group conversation |
| 12 | DELETE | `/conversations/:id/participants/:user_id` | Remove a user (or self-leave) from a group |
| 13 | GET | `/conversations/:id/messages` | Paginated message history |
| 14 | POST | `/conversations/:id/messages` | Send a message (REST fallback) |
| 15 | PATCH | `/messages/:id` | Edit own message content |
| 16 | DELETE | `/messages/:id` | Soft-delete own message |
| 17 | GET | `/messages/search` | Full-text search across the caller's conversations |

### Real-time (WebSocket, token in query param)
| # | Protocol | Path | Description |
|---|---|---|---|
| 18 | WS | `/ws/{conversation_id}?token=<access_token>` | Bidirectional real-time channel for a conversation room |

> **Note:** Sending a message via `POST /conversations/:id/messages` (endpoint 14) is the REST fallback for non-WS clients and automated tests. In normal UI operation, messages are sent over the WebSocket and the backend persists + broadcasts in one step.

---

## 6. Auth Endpoints

### 6.1 `POST /auth/register`

Register a new user account.

**Auth:** None

**Request:**
```json
{
  "username": "aizat_k",
  "email": "aizat@example.com",
  "password": "SecurePass123",
  "display_name": "Айзат"
}
```

**Validation:**
- `username`: 3–30 chars, regex `^[a-z0-9_]+$`, unique
- `email`: valid email format, unique
- `password`: min 8 chars
- `display_name`: 1–80 chars

**Response 201:**
```json
{
  "user": {
    "id": "uuid",
    "username": "aizat_k",
    "display_name": "Айзат",
    "created_at": "2026-05-12T10:00:00Z"
  },
  "access_token": "eyJhbGci...",
  "refresh_token": "eyJhbGci..."
}
```

**Errors:**
- `409` username or email already registered

---

### 6.2 `POST /auth/login`

Authenticate an existing user. Returns a JWT pair.

**Auth:** None

**Request:**
```json
{
  "email": "aizat@example.com",
  "password": "SecurePass123"
}
```

**Response 200:**
```json
{
  "user": {
    "id": "uuid",
    "username": "aizat_k",
    "display_name": "Айзат"
  },
  "access_token": "eyJhbGci...",
  "refresh_token": "eyJhbGci..."
}
```

**Errors:**
- `401` invalid credentials
- `404` no account for that email

---

### 6.3 `GET /auth/me`

Validate current session; return the caller's full user object.

**Auth:** Required (JWT)

**Response 200:**
```json
{
  "id": "uuid",
  "username": "aizat_k",
  "display_name": "Айзат",
  "avatar_url": null,
  "is_online": true,
  "created_at": "2026-05-12T10:00:00Z"
}
```

---

### 6.4 `POST /auth/logout`

Mark the refresh token as revoked. Access tokens remain valid until they naturally expire (15 min TTL).

**Auth:** Required (JWT)

**Response 204:** No Content.

---

## 7. User Endpoints

### 7.1 `GET /users`

Search all registered users by username or display name. Used to find people to start a conversation with.

**Auth:** Required (JWT)

**Query params:**

| Param | Type | Default | Notes |
|---|---|---|---|
| `q` | string | — | Substring/trigram search on `username` and `display_name`. Min 2 chars. |
| `limit` | integer | 20 | Max 50 |
| `offset` | integer | 0 | Pagination |

**Response 200:**
```json
{
  "total": 3,
  "users": [
    {
      "id": "uuid",
      "username": "aizat_k",
      "display_name": "Айзат",
      "avatar_url": null,
      "is_online": true
    }
  ]
}
```

> Caller is excluded from their own search results.

---

### 7.2 `GET /users/:id`

Fetch a single user's public profile.

**Auth:** Required (JWT)

**Response 200:**
```json
{
  "id": "uuid",
  "username": "aizat_k",
  "display_name": "Айзат",
  "avatar_url": null,
  "is_online": false,
  "last_seen": "2026-05-12T09:45:00Z"
}
```

**Errors:**
- `404` user not found

---

### 7.3 `PATCH /users/me`

Update the caller's own profile. Cannot change `username` or `email` after registration.

**Auth:** Required (JWT)

**Request (all fields optional):**
```json
{
  "display_name": "Айзат К.",
  "avatar_url": "https://cdn.example.com/avatars/uuid.jpg"
}
```

**Validation:**
- `display_name`: 1–80 chars
- `avatar_url`: valid URL or `null` to remove avatar

**Response 200:** Updated user object (same shape as `GET /auth/me`).

---

## 8. Conversation Endpoints

### 8.1 `GET /conversations`

Return all conversations the caller participates in, ordered by most recent message.

**Auth:** Required (JWT)

**Response 200:**
```json
{
  "conversations": [
    {
      "id": "uuid",
      "name": null,
      "is_group": false,
      "participants": [
        { "id": "uuid", "username": "bekzat_d", "display_name": "Бекзат", "is_online": true }
      ],
      "last_message": {
        "id": "uuid",
        "sender": { "id": "uuid", "username": "aizat_k" },
        "content": "Салам! Келесиңби?",
        "created_at": "2026-05-12T10:05:00Z"
      },
      "unread_count": 2
    }
  ]
}
```

> `name` is NULL for DMs. The frontend derives a display name from the other participant's `display_name`.
> `unread_count` = count of messages with `created_at > conversation_participants.last_read_at` for the caller.

---

### 8.2 `POST /conversations`

Create a new conversation. For a DM, pass exactly one other `participant_id`. For a group, pass `is_group: true`, a `name`, and one or more `participant_ids`.

**Auth:** Required (JWT)

**Request (DM):**
```json
{
  "is_group": false,
  "participant_ids": ["uuid-of-other-user"]
}
```

**Request (Group):**
```json
{
  "is_group": true,
  "name": "Project Team",
  "participant_ids": ["uuid-1", "uuid-2", "uuid-3"]
}
```

**Validation:**
- DM: exactly 1 `participant_id`; backend checks if a DM between these two users already exists and returns the existing one (`200`) instead of creating a duplicate
- Group: `name` required (1–80 chars); `participant_ids` must contain ≥1 entry; max 50 participants

**Side effects:**
- Caller is automatically added as a participant
- WebSocket broadcast: `conversation_created` event to all initial participants

**Response 201:** Full conversation object (same shape as `GET /conversations` item).
**Response 200:** If DM already exists — returns the existing conversation, no duplicate created.

---

### 8.3 `GET /conversations/:id`

Fetch full conversation metadata including all participants.

**Auth:** Required (JWT); caller must be a participant.

**Response 200:** Full conversation object (same shape as list item).

**Errors:**
- `403` caller is not a participant
- `404` conversation not found

---

### 8.4 `POST /conversations/:id/participants`

Add one or more users to a group conversation. Group only — not applicable to DMs.

**Auth:** Required (JWT); caller must be a participant.

**Request:**
```json
{
  "user_ids": ["uuid-of-new-member"]
}
```

**Validation:**
- Conversation must be `is_group = true`
- Users must exist and not already be participants
- Total participant count must not exceed 50

**Side effects:**
- WebSocket broadcast: `participant_added` event to all existing participants

**Response 200:**
```json
{
  "added": ["uuid-of-new-member"]
}
```

---

### 8.5 `DELETE /conversations/:id/participants/:user_id`

Remove a participant. A user can remove themselves (leave). Group creator can remove others.

**Auth:** Required (JWT).

**Business rules:**
- Non-group (DM): not allowed, returns `400`
- Self-leave: always permitted
- Removing others: only the conversation creator can remove other members

**Side effects:**
- Participant row deleted
- WebSocket broadcast: `participant_removed` event to remaining participants

**Response 204:** No Content.

---

## 9. Message Endpoints

### 9.1 `GET /conversations/:id/messages`

Paginated message history for a conversation, newest first.

**Auth:** Required (JWT); caller must be a participant.

**Query params:**

| Param | Type | Default | Notes |
|---|---|---|---|
| `limit` | integer | 50 | Max 100 |
| `before` | UUID | — | Return messages with `created_at` before this message ID (cursor pagination) |

**Response 200:**
```json
{
  "has_more": true,
  "messages": [
    {
      "id": "uuid",
      "conversation_id": "uuid",
      "sender": {
        "id": "uuid",
        "username": "aizat_k",
        "display_name": "Айзат",
        "avatar_url": null
      },
      "content": "Салам! Келесиңби?",
      "message_type": "text",
      "is_deleted": false,
      "is_edited": false,
      "created_at": "2026-05-12T10:05:00Z",
      "updated_at": "2026-05-12T10:05:00Z"
    }
  ]
}
```

> **Side effect:** Updates `conversation_participants.last_read_at` for the caller to `NOW()`, clearing their unread count.

---

### 9.2 `POST /conversations/:id/messages`

REST fallback for sending a message. In normal UI flow, messages are sent over WebSocket. Use this endpoint for API testing via `/docs`.

**Auth:** Required (JWT); caller must be a participant.

**Request:**
```json
{
  "content": "Жок, кечинде",
  "message_type": "text"
}
```

**Validation:**
- `content`: 1–4000 chars, not blank
- `message_type`: `text` | `emoji` (default `text`)

**Side effects:**
- Message row inserted
- WebSocket broadcast: `chat_message` event to all participants in the room

**Response 201:** Full message object (same shape as history item).

---

### 9.3 `PATCH /messages/:id`

Edit the content of a message. Caller must be the original sender.

**Auth:** Required (JWT).

**Request:**
```json
{
  "content": "Жок, эртең"
}
```

**Validation:**
- `content`: 1–4000 chars
- Cannot edit a message with `is_deleted = true`

**Side effects:**
- `messages.content` updated; `is_edited` set to `true`; `updated_at` refreshed
- WebSocket broadcast: `message_edited` event to the conversation room

**Response 200:** Updated message object.

**Errors:**
- `403` caller is not the sender
- `404` message not found

---

### 9.4 `DELETE /messages/:id`

Soft-delete a message. Caller must be the original sender.

**Auth:** Required (JWT).

**Side effects:**
- `messages.is_deleted` set to `true`; `content` overwritten with `'[deleted]'`
- WebSocket broadcast: `message_deleted` event to the conversation room

**Response 204:** No Content.

**Errors:**
- `403` caller is not the sender

---

### 9.5 `GET /messages/search`

Full-text search across all messages in conversations the caller participates in.

**Auth:** Required (JWT).

**Query params:**

| Param | Type | Default | Notes |
|---|---|---|---|
| `q` | string | — | **Required.** Search term. Min 2 chars. |
| `conversation_id` | UUID | — | Scope search to one conversation |
| `limit` | integer | 20 | Max 50 |
| `offset` | integer | 0 | Pagination |

**Response 200:**
```json
{
  "total": 4,
  "results": [
    {
      "message": {
        "id": "uuid",
        "content": "...Жок, <em>эртең</em>...",
        "created_at": "2026-05-12T10:05:00Z"
      },
      "conversation": { "id": "uuid", "name": null, "is_group": false },
      "sender": { "id": "uuid", "username": "aizat_k" }
    }
  ]
}
```

> `content` in search results uses PostgreSQL `ts_headline` to wrap matched terms in `<em>` tags. The frontend renders this as highlighted text.
> Deleted messages (`is_deleted = true`) are excluded from search results.

---

## 10. WebSocket — Event & Payload Map

### Connection

```
WS /ws/{conversation_id}?token=<access_token>
```

- Backend validates the JWT from the query param on connection handshake.
- Backend verifies the caller is a participant of `conversation_id`.
- On success, the `ConnectionManager` registers the socket in the in-memory room for `conversation_id`.
- On disconnect, presence is updated and a `user_presence` event is broadcast.

```python
# ConnectionManager (simplified)
class ConnectionManager:
    rooms: dict[str, list[WebSocket]]  # conversation_id → active sockets

    async def connect(self, ws: WebSocket, conversation_id: str, user_id: str): ...
    async def disconnect(self, ws: WebSocket, conversation_id: str, user_id: str): ...
    async def broadcast(self, conversation_id: str, payload: dict): ...
```

---

### Server → Client Events

All events share a common envelope:

```json
{
  "event": "<event_type>",
  "payload": { }
}
```

#### `chat_message`

A new message has been sent to the conversation.

```json
{
  "event": "chat_message",
  "payload": {
    "id": "uuid",
    "conversation_id": "uuid",
    "sender": {
      "id": "uuid",
      "username": "aizat_k",
      "display_name": "Айзат",
      "avatar_url": null
    },
    "content": "Салам!",
    "message_type": "text",
    "is_edited": false,
    "created_at": "2026-05-12T10:05:00Z"
  }
}
```

#### `message_edited`

An existing message's content was changed.

```json
{
  "event": "message_edited",
  "payload": {
    "id": "uuid",
    "conversation_id": "uuid",
    "content": "Салам, кандайсың?",
    "is_edited": true,
    "updated_at": "2026-05-12T10:07:00Z"
  }
}
```

#### `message_deleted`

A message was soft-deleted.

```json
{
  "event": "message_deleted",
  "payload": {
    "id": "uuid",
    "conversation_id": "uuid"
  }
}
```

#### `typing_status`

A participant started or stopped typing. Powered by a Redis key with a 3-second TTL.

```json
{
  "event": "typing_status",
  "payload": {
    "conversation_id": "uuid",
    "user_id": "uuid",
    "username": "bekzat_d",
    "is_typing": true
  }
}
```

> Redis key: `typing:{conversation_id}:{user_id}` — SET with EX 3. If the key expires without a `stop_typing` event, the client-side timeout removes the indicator automatically.

#### `user_presence`

A participant's online/offline status changed (WebSocket connect or disconnect).

```json
{
  "event": "user_presence",
  "payload": {
    "user_id": "uuid",
    "username": "bekzat_d",
    "is_online": false,
    "last_seen": "2026-05-12T10:15:00Z"
  }
}
```

> Redis key: `presence:{user_id}` — SET to `"online"` on connect, deleted on disconnect. `users.is_online` and `users.last_seen` are updated in PostgreSQL on disconnect.

#### `participant_added` / `participant_removed`

Group membership changed.

```json
{
  "event": "participant_added",
  "payload": {
    "conversation_id": "uuid",
    "user": { "id": "uuid", "username": "new_member", "display_name": "..." }
  }
}
```

---

### Client → Server Events

The client sends JSON frames over the open WebSocket:

#### Send message

```json
{
  "action": "send_message",
  "content": "Салам!",
  "message_type": "text"
}
```

Backend response: persists to DB, then broadcasts `chat_message` to the whole room (including sender).

#### Typing indicator

```json
{
  "action": "typing",
  "is_typing": true
}
```

Backend response: sets/clears Redis key, broadcasts `typing_status` to others in the room (not back to sender).

#### Mark read

```json
{
  "action": "mark_read"
}
```

Backend response: updates `conversation_participants.last_read_at` to `NOW()`.

---

## 11. Real-time Flow Diagrams

### Message send flow

```
User types message → presses Enter
    │
    ▼
Client sends { action: "send_message", content: "..." } over WebSocket
    │
    ▼
Backend WebSocket handler:
  1. Validate content length and message_type
  2. INSERT into messages table (async)
  3. Broadcast chat_message event to all sockets in the room
    │
    ├──→ Sender receives chat_message (confirms delivery, renders message)
    └──→ All other participants receive chat_message (renders in their chat pane)
```

---

### Typing indicator flow

```
User starts typing
    │
    ▼
Client sends { action: "typing", is_typing: true } (debounced — at most once per second)
    │
    ▼
Backend: SET Redis key typing:{conv_id}:{user_id} EX 3
    │
    ▼
Backend broadcasts typing_status { is_typing: true } to other participants
    │
    ▼
Other clients: show "Айзат is typing..." indicator

User stops typing (no keystroke for 3 seconds)
    │
    ├─ Redis key expires automatically
    └─ Client sends { action: "typing", is_typing: false }
         │
         ▼
         Backend broadcasts typing_status { is_typing: false }
         → Other clients remove indicator
```

---

### Presence flow

```
User opens chat tab
    │
    ▼
Browser opens WS /ws/{conversation_id}?token=...
    │
    ▼
Backend: SET Redis presence:{user_id} "online"
         UPDATE users SET is_online=true WHERE id=user_id
         Broadcast user_presence { is_online: true } to all conversation rooms the user is in
    │
User closes tab / loses connection
    │
    ▼
Backend detects WS disconnect
    │
    ▼
Backend: DEL Redis presence:{user_id}
         UPDATE users SET is_online=false, last_seen=NOW() WHERE id=user_id
         Broadcast user_presence { is_online: false, last_seen: "..." } to all rooms
```

---

## 12. Frontend (Next.js) — Page Map

### Route structure

```
app/
├── (auth)/
│   ├── login/
│   │   └── page.tsx          → /login      — Login form (email + password)
│   └── register/
│       └── page.tsx          → /register   — Registration form
├── (chat)/
│   ├── layout.tsx            → Sidebar (conversation list) + main panel; auth guard
│   ├── page.tsx              → /           — Empty state: "Select a conversation"
│   └── conversations/
│       └── [id]/
│           └── page.tsx      → /conversations/:id — Active chat window
└── settings/
    └── page.tsx              → /settings   — Profile (display name, avatar)
```

### Key components

| Component | Location | Purpose |
|---|---|---|
| `<ConversationList>` | `components/sidebar/` | Scrollable list of conversations; shows avatar, last message snippet, unread badge |
| `<ConversationItem>` | `components/sidebar/` | Single conversation row; presence dot, unread count badge |
| `<ChatWindow>` | `components/chat/` | Main panel; renders message list + input bar |
| `<MessageList>` | `components/chat/` | Virtualized scroll of message bubbles; loads older messages on scroll-up |
| `<MessageBubble>` | `components/chat/` | Individual message; own messages right-aligned, others left-aligned; edit/delete menu |
| `<MessageInput>` | `components/chat/` | Textarea + send button; fires `typing` WS event on keydown |
| `<TypingIndicator>` | `components/chat/` | "X is typing..." animation; rendered from WS `typing_status` events |
| `<UserSearch>` | `components/sidebar/` | Search box → calls `GET /users?q=` → results with "Start Chat" button |
| `<NewConversationModal>` | `components/sidebar/` | Modal to start DM or create group |
| `<PresenceDot>` | `components/common/` | Green/grey dot; `is_online` prop |
| `<ThemeToggle>` | `components/common/` | Light/dark mode switch via `next-themes` |

### State management

```
WebSocket state: custom hook useChat(conversationId)
  - Opens WS on mount, closes on unmount
  - Maintains messages[] in local state
  - Dispatches incoming events to reducers (append, edit, delete)
  - Exposes sendMessage(), sendTyping() actions

Server state: React Query (TanStack Query)
  - useConversations() → GET /conversations (refetch on focus)
  - useMessages(id) → GET /conversations/:id/messages (infinite query, cursor pagination)
  - useUsers(q) → GET /users?q= (debounced search)

Auth state: Zustand store
  - { user, access_token, setUser, logout }
  - Hydrated from localStorage on app init
```

### Dark mode

- Implemented via `next-themes` (`ThemeProvider` at root layout)
- TailwindCSS `darkMode: 'class'` strategy
- shadcn/ui components respond to the `dark` class on `<html>` automatically
- Toggle persists to `localStorage`

---

## 13. Error Response Format

All errors follow this shape:

```json
{
  "error": "not_found",
  "message": "Human-readable description",
  "details": {
    "field_name": "Specific reason"
  }
}
```

**`error` code values:**

| Code | HTTP | When |
|---|---|---|
| `validation_error` | 400/422 | Field validation failed (missing field, wrong type, too short, etc.) |
| `unauthorized` | 401 | Missing, expired, or invalid JWT |
| `forbidden` | 403 | Valid auth but action not permitted (editing another user's message, etc.) |
| `not_found` | 404 | User, conversation, or message does not exist |
| `conflict` | 409 | Username/email already registered; user already a participant |
| `not_participant` | 403 | Caller is not a member of the requested conversation |
| `dm_only` | 400 | Operation requires `is_group = false` (or vice versa) |
| `ws_auth_failed` | 4001 (WS close code) | WebSocket handshake: invalid or expired token |
| `ws_not_participant` | 4003 (WS close code) | WebSocket handshake: caller not in conversation |
| `server_error` | 500 | Unexpected backend error |

> WebSocket errors are sent as a close frame with the code above before the connection is terminated.

---

## 14. Enums and Constants

### MessageType

```python
class MessageType(str, Enum):
    text  = "text"
    emoji = "emoji"   # entire message is a single emoji; frontend renders larger
```

### WebSocket action types (client → server)

```python
WS_CLIENT_ACTIONS = ["send_message", "typing", "mark_read"]
```

### WebSocket event types (server → client)

```python
WS_SERVER_EVENTS = [
    "chat_message",
    "message_edited",
    "message_deleted",
    "typing_status",
    "user_presence",
    "participant_added",
    "participant_removed",
    "conversation_created",
]
```

### Redis key conventions

```python
# Typing indicator — expires in 3 seconds
TYPING_KEY     = "typing:{conversation_id}:{user_id}"   # value: "1", EX 3

# Presence flag — deleted on disconnect
PRESENCE_KEY   = "presence:{user_id}"                   # value: "online"
```

### Token lifetimes

```python
ACCESS_TOKEN_EXPIRE_MINUTES  = 15
REFRESH_TOKEN_EXPIRE_DAYS    = 7
JWT_ALGORITHM                = "HS256"
```

### Pagination defaults

```python
DEFAULT_MESSAGE_PAGE_SIZE    = 50
MAX_MESSAGE_PAGE_SIZE        = 100
DEFAULT_USER_SEARCH_LIMIT    = 20
MAX_USER_SEARCH_LIMIT        = 50
MAX_GROUP_PARTICIPANTS       = 50
MAX_MESSAGE_LENGTH           = 4000
```

---

## 15. Docker Deployment Structure

```
project-root/
├── backend/
│   ├── Dockerfile
│   ├── main.py
│   ├── requirements.txt
│   ├── alembic/
│   └── app/
│       ├── routers/
│       ├── models/
│       ├── schemas/
│       └── ws/
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
├── docker-compose.yml
└── .env
```

### `docker-compose.yml` (outline)

```yaml
version: "3.9"
services:
  db:
    image: postgres:15
    environment:
      POSTGRES_USER: messenger
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: messenger
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U messenger"]
      interval: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data

  backend:
    build: ./backend
    ports: ["8000:8000"]
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
    environment:
      DATABASE_URL: postgresql+asyncpg://messenger:${DB_PASSWORD}@db:5432/messenger
      REDIS_URL: redis://redis:6379/0
      JWT_SECRET: ${JWT_SECRET}
      ALLOWED_ORIGINS: ${ALLOWED_ORIGINS}

  frontend:
    build: ./frontend
    ports: ["3000:3000"]
    depends_on: [backend]
    environment:
      NEXT_PUBLIC_API_URL: ${PUBLIC_API_URL}
      NEXT_PUBLIC_WS_URL: ${PUBLIC_WS_URL}

volumes:
  postgres_data:
  redis_data:
```

### `.env` variables

| Variable | Description |
|---|---|
| `DB_PASSWORD` | PostgreSQL password |
| `JWT_SECRET` | HS256 signing secret (32+ random chars) |
| `ALLOWED_ORIGINS` | CORS origins, comma-separated (e.g. `http://localhost:3000`) |
| `PUBLIC_API_URL` | Public-facing API base URL (e.g. `https://api.myapp.com`) |
| `PUBLIC_WS_URL` | Public-facing WebSocket URL (e.g. `wss://api.myapp.com`) |

### Deployment target (Render / Railway)

Both platforms support Docker deployments from a `docker-compose.yml` or individual `Dockerfile` per service:

1. Push repo to GitHub (public)
2. On Render: **New Web Service** → Docker → point to `./backend` → add env vars
3. On Render: **New Web Service** → Docker → point to `./frontend` → add `NEXT_PUBLIC_API_URL`
4. On Render: **New PostgreSQL** and **New Redis** → copy connection strings into env vars
5. Backend: set `START_COMMAND` to `alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8000`

---

## 16. Implementation Notes

### Phase 1 — Foundation (Docker + DB + Auth)

1. `docker-compose up` with `db`, `redis`, and `backend` services — confirm connections
2. Write SQLAlchemy async models for all 4 tables: `users`, `conversations`, `conversation_participants`, `messages`
3. Run `alembic init` and write the initial migration; `alembic upgrade head`
4. Implement `POST /auth/register` and `POST /auth/login` with bcrypt + JWT
5. Implement `GET /auth/me` with JWT dependency
6. Smoke test everything via FastAPI's auto-generated Swagger UI at `/docs`

### Phase 2 — REST API (Users, Conversations, Messages)

1. `GET /users`, `PATCH /users/me` — basic user operations
2. `POST /conversations` (DM logic with duplicate-check), `GET /conversations`
3. `GET /conversations/:id/messages` with cursor pagination
4. `POST /conversations/:id/messages` (REST path — used for testing)
5. `PATCH /messages/:id` and `DELETE /messages/:id` (soft delete)
6. `GET /messages/search` — wire up `ts_tsvector` search in PostgreSQL
7. Verify all endpoints via `/docs`; write at least one happy-path test per router

### Phase 3 — WebSockets + Redis

1. Implement `ConnectionManager` class: `connect`, `disconnect`, `broadcast`
2. Wire up `WS /ws/{conversation_id}` endpoint with JWT auth on handshake
3. Handle `send_message` action: persist to DB, broadcast `chat_message`
4. Handle `typing` action: SET/DEL Redis key with TTL, broadcast `typing_status`
5. Handle presence: on connect SET Redis key, on disconnect DEL + update DB + broadcast `user_presence`
6. Test with two browser tabs open to the same conversation — confirm real-time delivery

### Phase 4 — Next.js Frontend

1. Scaffold `next.js` with `shadcn/ui` init and Tailwind; enable `dark` mode class strategy
2. `(auth)/login` and `(auth)/register` pages — call REST auth endpoints, store JWT in Zustand
3. `(chat)/layout.tsx` — `<ConversationList>` sidebar with `useConversations()` React Query hook
4. `<UserSearch>` → `<NewConversationModal>` → `POST /conversations` flow
5. `(chat)/conversations/[id]` — `<ChatWindow>` with `useChat(id)` hook (WebSocket)
6. Render `<TypingIndicator>` and `<PresenceDot>` from WS events
7. `<ThemeToggle>` connected to `next-themes`
8. Responsive layout: sidebar collapses on mobile; chat window fills screen

### Vibe coding tips

When prompting an AI to generate code for this project, always share:

1. The **DB schema** from Section 4 — defines every relationship
2. The **WebSocket payload map** from Section 10 — prevents event naming inconsistencies
3. The **Redis key conventions** from Section 14 — keeps ephemeral state consistent
4. The **tech stack** from Section 3 — keeps the AI on the right libraries (SQLAlchemy async, not sync)

**Recommended first prompt:**
> "Create a FastAPI app with SQLAlchemy 2.x async models for these 4 tables: [paste schema]. Include Alembic migration setup, bcrypt password hashing, JWT auth with `GET /auth/me`, and a `ConnectionManager` class for WebSocket room management. Use `asyncpg` as the PostgreSQL driver and `aioredis` for Redis. All async."

---

## 17. Summary

| Dimension | Detail |
|---|---|
| **Tables** | 4 (users, conversations, conversation_participants, messages) |
| **REST endpoints** | 17 (2 public, 15 authenticated) |
| **WebSocket endpoint** | 1 (`/ws/{conversation_id}`) |
| **WS client actions** | 3 (send_message, typing, mark_read) |
| **WS server events** | 8 (chat_message, message_edited, message_deleted, typing_status, user_presence, participant_added, participant_removed, conversation_created) |
| **Services** | 4 (FastAPI backend, Next.js frontend, PostgreSQL, Redis) |
| **Deploy** | 1 `docker-compose up` command |
| **Real-time model** | WebSocket rooms per conversation; Redis for ephemeral state |
| **Auth** | JWT HS256; 15-min access token + 7-day refresh token |

**The system delivers all required features plus extras:**
- Required: user registration/search/list, send/receive messages, chat history, message search, filter by user/conversation, REST API, frontend UI
- Bonus: real-time WebSocket delivery, typing indicators, online/offline presence, dark mode, group chat, Docker-first deployment
