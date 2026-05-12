# Vibe Messenger

A real-time full-stack chat application. Register, find users, open direct or group conversations, and exchange messages with live delivery — no page refresh required.

![Tech Stack](https://img.shields.io/badge/FastAPI-0.111-009688?style=flat&logo=fastapi)
![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat&logo=next.js)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-336791?style=flat&logo=postgresql)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?style=flat&logo=redis)

---

## Features

- **Real-time messaging** — WebSocket connection per conversation; messages appear instantly without polling
- **Typing indicators** — "X is typing…" powered by Redis TTL keys
- **Online / offline presence** — green dot updates live when users connect or disconnect
- **Direct messages** — one-on-one conversations; duplicate DMs are never created
- **Group chats** — create named groups with up to 50 participants
- **Message editing & soft delete** — edit your own messages; deleted messages show `[deleted]`
- **Message search** — full-text search across all your conversations using PostgreSQL `tsvector`
- **Unread counts** — badge on each conversation showing messages since your last read
- **Dark mode** — system-aware, toggleable, persisted to `localStorage`
- **Responsive layout** — collapsible sidebar on mobile with back navigation
- **Profile settings** — update display name and avatar URL

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python 3.11 · FastAPI · SQLAlchemy 2.x async · Alembic |
| **Database** | PostgreSQL 15 |
| **Cache / Pub-Sub** | Redis 7 |
| **Auth** | JWT HS256 · bcrypt (passlib) |
| **Frontend** | Next.js 16 · React 19 · TypeScript |
| **Styling** | Tailwind CSS v4 · next-themes |
| **State** | Zustand (auth) · TanStack Query v5 (server state) |
| **Real-time** | Native WebSocket API (browser) · FastAPI WebSockets |
| **Containerisation** | Docker · Docker Compose |

---

## Project Structure

```
Vibe-Messenger/
├── backend/
│   ├── app/
│   │   ├── api/routers/      # auth, users, conversations, messages
│   │   ├── core/             # config, database, security, redis
│   │   ├── models.py         # SQLAlchemy ORM models
│   │   ├── schemas.py        # Pydantic request/response schemas
│   │   └── ws/               # WebSocket manager + router
│   ├── alembic/              # database migrations
│   ├── tests/
│   ├── create_superuser.py
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── app/                  # Next.js App Router pages
│   │   ├── (auth)/           # /login  /register
│   │   ├── (chat)/           # / and /conversations/[id]
│   │   └── settings/
│   ├── components/
│   │   ├── chat/             # ChatWindow, MessageBubble, MessageList, MessageInput, TypingIndicator
│   │   ├── sidebar/          # ConversationList, ConversationItem, UserSearch, NewConversationModal
│   │   └── common/           # PresenceDot, ThemeToggle, ErrorBoundary, Toast, Providers
│   ├── hooks/                # useChat (WebSocket), useQueries (React Query)
│   ├── lib/                  # apiFetch, wsUrl helpers
│   ├── store/                # Zustand auth store
│   ├── types/                # Shared TypeScript interfaces
│   └── Dockerfile
├── docker-compose.yml
├── render.yaml               # Render deployment config
└── .env.example
```

---

## Running Locally

### Prerequisites

- Docker and Docker Compose

### 1. Clone and configure

```bash
git clone https://github.com/YOUR_USERNAME/vibe-messenger.git
cd vibe-messenger
cp .env.example .env
```

Edit `.env` and set strong values for `DB_PASSWORD` and `JWT_SECRET`:

```bash
# Generate a secure JWT secret
python3 -c "import secrets; print(secrets.token_hex(32))"
```

### 2. Start all services

```bash
docker-compose up --build
```

This starts PostgreSQL, Redis, the FastAPI backend (with auto-migrations), and the Next.js frontend.

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| Swagger UI | http://localhost:8000/docs |

### 3. Create a superuser (optional)

```bash
docker-compose run --rm superuser
```

Credentials are read from `.env` (`SUPERUSER_*` variables). The script is idempotent — safe to run multiple times.

---

## Environment Variables

### Backend

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (`postgresql+asyncpg://...`) |
| `REDIS_URL` | Redis connection string (`redis://...`) |
| `JWT_SECRET` | HS256 signing secret — minimum 32 random characters |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins (e.g. `http://localhost:3000`) |

### Frontend

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend base URL (e.g. `http://localhost:8000`) |
| `NEXT_PUBLIC_WS_URL` | Backend WebSocket URL (e.g. `ws://localhost:8000`) |

### Superuser creation

| Variable | Default |
|---|---|
| `SUPERUSER_USERNAME` | `admin` |
| `SUPERUSER_EMAIL` | `admin@example.com` |
| `SUPERUSER_PASSWORD` | *(required)* |
| `SUPERUSER_DISPLAY_NAME` | `Admin` |

---

## API Overview

### REST Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | Create account |
| POST | `/auth/login` | Authenticate, receive JWT pair |
| GET | `/auth/me` | Current user |
| POST | `/auth/logout` | Invalidate session |
| GET | `/users` | Search users by name/username |
| GET | `/users/:id` | Public profile |
| PATCH | `/users/me` | Update display name / avatar |
| GET | `/conversations` | List all conversations |
| POST | `/conversations` | Create DM or group |
| GET | `/conversations/:id` | Conversation metadata |
| POST | `/conversations/:id/participants` | Add members to group |
| DELETE | `/conversations/:id/participants/:uid` | Remove / leave group |
| GET | `/conversations/:id/messages` | Paginated message history |
| POST | `/conversations/:id/messages` | Send message (REST fallback) |
| PATCH | `/messages/:id` | Edit own message |
| DELETE | `/messages/:id` | Soft-delete own message |
| GET | `/messages/search` | Full-text search |

Full interactive docs available at `/docs` when running locally.

### WebSocket

```
WS /ws/{conversation_id}?token=<access_token>
```

**Client → Server actions:** `send_message` · `typing` · `mark_read`

**Server → Client events:** `chat_message` · `message_edited` · `message_deleted` · `typing_status` · `user_presence` · `participant_added` · `participant_removed` · `conversation_created`

---

## Database Schema

```
users
  ├─< conversation_participants >─ conversations
  │                                     └─< messages
  └─< messages (as sender)
```

Four tables: `users`, `conversations`, `conversation_participants`, `messages`. Migrations are managed with Alembic and run automatically on container start.

---

## Deployment (Render)

The repo includes a `render.yaml` that defines both services. See [`render-deploy-guide.md`](./render-deploy-guide.md) for the full step-by-step guide.

Quick summary:
1. Create a managed PostgreSQL and Redis instance on Render
2. Deploy the backend as a **Docker** Web Service (`./backend`)
3. Deploy the frontend as a **Node** Web Service (`./frontend`, build: `npm ci && npm run build`, start: `npm start`)
4. Set environment variables in the Render dashboard
5. The backend runs `alembic upgrade head` automatically on every deploy

---

## Color Palette

The UI uses a four-color warm neutral palette:

| Name | Hex | Usage |
|---|---|---|
| Floral White | `#FFFBF4` | Page background (light) |
| Bone | `#D8CFBC` | Sidebar, cards, input fields |
| Olive Drab | `#565449` | Secondary text, icons |
| Smoky Black | `#11120D` | Primary text, own message bubbles, buttons |

Dark mode inverts the hierarchy — Smoky Black becomes the background, Floral White becomes the text.

---

## License

MIT
