# Backend Implementation Plan: Phase by Phase

**Strategy for smaller AI models:** Never ask the model to "build the chat app." Ask it to "fill in the implementation for `app/api/routers/auth.py` using this schema and database model." Always paste your generated empty file into the prompt so the AI knows exactly what variables and imports it has to work with.

---

## Phase 0: Database Initialization
Before writing logic, the database must be prepared.

1. **Start the infrastructure:** `docker-compose up -d`
2. **Generate the first migration:** Run this inside your backend container (or locally if you have the env mapped):
   `alembic revision --autogenerate -m "initial_schema"`
3. **Apply the migration:**
   `alembic upgrade head`
4. **Test:** Check your Postgres GUI (DBeaver, DataGrip, or pgAdmin) to ensure the 4 tables (`users`, `conversations`, `conversation_participants`, `messages`) exist.

---

## Phase 1: Security & Auth (`app/api/routers/auth.py`)
**Goal:** Users can register, passwords get hashed, and JWTs are issued.

**AI Prompt:**
> "You are an expert FastAPI developer. I need to implement the endpoints in my `app/api/routers/auth.py` file. 
> 
> Here is my `models.py` (for the `User` model): [Paste User model here]
> Here is my `schemas.py` (for Auth schemas): [Paste Auth schemas here]
> Here is my empty `auth.py`: [Paste auth.py here]
>
> **Task:** Fill in the `pass` blocks for `/register`, `/login`, `/me`, and `/logout`. 
> - Use `passlib` for bcrypt password hashing.
> - Use `python-jose` for generating the HS256 JWT access and refresh tokens.
> - Ensure `/register` returns a 409 if the username or email already exists.
> - Ensure all database calls use `AsyncSession`. Return the completed `auth.py` code."

**How to Test:**
1. Go to `http://localhost:8000/docs`
2. Use `POST /auth/register` to create a user.
3. Use `POST /auth/login` to get your JWT.
4. Click the "Authorize" padlock at the top of Swagger UI and paste your `access_token`.
5. Call `GET /auth/me` to verify it recognizes you.

---

## Phase 2: Users & Search (`app/api/routers/users.py`)
**Goal:** Users can update their profile and search for other users to start chats.

**AI Prompt:**
> "I need to implement the endpoints in `app/api/routers/users.py`. 
>
> Here is my `models.py` (User model): [Paste User model here]
> Here is my `schemas.py` (User schemas): [Paste User schemas here]
> Here is my empty `users.py`: [Paste users.py here]
>
> **Task:** Fill in the `pass` blocks.
> - `GET /users`: Implement a trigram/ILIKE search on `username` and `display_name` using SQLAlchemy 2.x async syntax. Exclude the current user from the results. Add pagination (limit/offset).
> - `GET /users/{id}`: Fetch user by ID, return 404 if not found.
> - `PATCH /users/me`: Update `display_name` and `avatar_url`. Ignore fields that are not provided.
> Return the completed `users.py` code."

**How to Test:**
1. Register a second user via `/docs`.
2. Authenticate as User 1.
3. Call `GET /users?q=` with part of User 2's name to ensure the search works.

---

## Phase 3: Conversations & REST Messages (`conversations.py` & `messages.py`)
**Goal:** Create DMs/Groups and fetch message history. 

**AI Prompt:**
> "I need to implement the core messaging REST endpoints in `conversations.py` and `messages.py`. 
> 
> Here are my DB models: [Paste models.py]
> Here are my empty routers: [Paste conversations.py and messages.py]
>
> **Task:** Fill in the `pass` blocks.
> - `POST /conversations`: If `is_group` is false, check if a DM between the two users already exists. If yes, return it. If no, create it and add both users to `conversation_participants`.
> - `GET /conversations/{id}/messages`: Fetch messages ordered by `created_at DESC`. Implement simple cursor pagination using the `before` parameter (message UUID). Update `last_read_at` for the current user in `conversation_participants`.
> - `PATCH /messages/{id}` and `DELETE /messages/{id}`: Ensure the caller is the `sender_id` before allowing edits or soft-deletes (`is_deleted=True`).
> Return the completed code for both routers."

**How to Test:**
1. Use `/docs` to `POST /conversations` with User 1 and User 2.
2. Use `POST /conversations/{id}/messages` to insert a test message.
3. Call `GET /conversations/{id}/messages` to retrieve it.

---

## Phase 4: The Real-Time Engine (`app/ws/manager.py` & `ws/router.py`)
**Goal:** Live WebSockets and Redis presence.

**AI Prompt:**
> "I need to implement the real-time WebSocket engine. We are using native FastAPI WebSockets and `redis.asyncio`.
>
> Here is my `manager.py`: [Paste manager.py stub]
> Here is my `router.py`: [Paste ws router.py stub]
>
> **Task:**
> 1. In `manager.py`, implement `connect()`, `disconnect()`, and `broadcast()`. Keep track of active `WebSocket` connections in memory mapped by `conversation_id`.
> 2. In `router.py` (`/ws/{conversation_id}`):
>    - Authenticate the user via the `token` query param.
>    - Reject connection if the user is not a participant in the conversation.
>    - On connect: Set a Redis key `presence:{user_id}` to 'online'. Broadcast a `user_presence` event.
>    - Enter a `while True:` loop to receive JSON payloads.
>    - Handle `send_message` action: Insert into the database, then `broadcast()` the message.
>    - Handle `typing` action: Set a Redis key `typing:{conv_id}:{user_id}` with `EX 3` (3 seconds), and `broadcast()` the typing status.
>    - On `WebSocketDisconnect`: Delete the presence Redis key, update `users.last_seen` in the DB, and broadcast offline status.
> Return the completed code."

**How to Test:**
1. Open a tool like Postman or Hoppscotch that supports WebSockets.
2. Connect to `ws://localhost:8000/ws/{conversation_id}?token={your_jwt}`.
3. Send a JSON payload: `{"action": "typing", "is_typing": true}`.
4. Send a message: `{"action": "send_message", "content": "Hello via WS!", "message_type": "text"}`.
5. Verify the backend echoes the broadcast back to you.