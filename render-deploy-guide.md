# Render Deployment Guide — Vibe Messenger

## Overview

Four things get deployed on Render:

| Service | Render type | Dockerfile |
|---|---|---|
| PostgreSQL | Managed database | — (Render-managed) |
| Redis | Key-Value store | — (Render-managed) |
| Backend (FastAPI) | Web Service | `./backend/Dockerfile` |
| Frontend (Next.js) | Web Service | `./frontend/Dockerfile` |

Total estimated cost on free tier: **$0/month** (free tier covers all four).
Free tier caveat: services spin down after 15 min of inactivity and take ~30s to wake up. Upgrade to Starter ($7/mo per service) to avoid this.

---

## Step 1 — Push to GitHub

Your `.gitignore` already excludes `.env`, `node_modules`, `.next`, and `__pycache__`. Nothing sensitive will be committed.

```bash
cd /home/nama/projects/Vibe-Messenger
git init                          # skip if already a git repo
git add .
git commit -m "initial commit"
```

Create a **public** repository on GitHub (github.com → New repository), then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/vibe-messenger.git
git branch -M main
git push -u origin main
```

---

## Step 2 — Create PostgreSQL on Render

1. Go to [render.com](https://render.com) → **New** → **PostgreSQL**
2. Settings:
   - **Name:** `vibe-messenger-db`
   - **Region:** pick the one closest to your users
   - **Plan:** Free
3. Click **Create Database**
4. Once created, open the database and copy two values — you'll need them in Step 4:
   - **Internal Database URL** — used by the backend (format: `postgresql://...`)
   - Keep the page open

---

## Step 3 — Create Redis on Render

1. **New** → **Redis**
2. Settings:
   - **Name:** `vibe-messenger-redis`
   - **Region:** same as the database
   - **Plan:** Free
3. Click **Create**
4. Once created, copy the **Internal Redis URL** (format: `redis://...`)

---

## Step 4 — Deploy the Backend

1. **New** → **Web Service**
2. Connect your GitHub repo
3. Settings:
   - **Name:** `vibe-messenger-backend`
   - **Region:** same as DB and Redis
   - **Branch:** `main`
   - **Root Directory:** `backend`
   - **Runtime:** Docker
   - **Dockerfile Path:** `./Dockerfile`  *(Render auto-detects this)*
   - **Instance Type:** Free

4. Under **Environment Variables**, add all of these:

| Key | Value |
|---|---|
| `DATABASE_URL` | Paste the **Internal Database URL** from Step 2, but change `postgresql://` → `postgresql+asyncpg://` |
| `REDIS_URL` | Paste the **Internal Redis URL** from Step 3 |
| `JWT_SECRET` | Generate a random 32+ char string (see below) |
| `ALLOWED_ORIGINS` | `https://vibe-messenger-frontend.onrender.com` *(update after frontend is deployed)* |

**Generate JWT_SECRET:**
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

5. Click **Create Web Service**

Render will build the Docker image and run:
```
alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000
```
Migrations run automatically on every deploy.

6. Wait for the deploy to finish. Copy the backend URL — it looks like:
   `https://vibe-messenger-backend.onrender.com`

---

## Step 5 — Deploy the Frontend

1. **New** → **Web Service**
2. Connect the same GitHub repo
3. Settings:
   - **Name:** `vibe-messenger-frontend`
   - **Region:** same region
   - **Branch:** `main`
   - **Root Directory:** `frontend`
   - **Runtime:** Docker
   - **Dockerfile Path:** `./Dockerfile`
   - **Instance Type:** Free

4. Under **Environment Variables**, add:

| Key | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://vibe-messenger-backend.onrender.com` |
| `NEXT_PUBLIC_WS_URL` | `wss://vibe-messenger-backend.onrender.com` |

> Note: `wss://` (WebSocket Secure) not `ws://` — Render terminates TLS so the backend receives plain WS but the client connects over WSS.

5. Click **Create Web Service**

---

## Step 6 — Fix ALLOWED_ORIGINS on the Backend

Now that you have the frontend URL, go back to the backend service:

1. **vibe-messenger-backend** → **Environment**
2. Update `ALLOWED_ORIGINS`:
   ```
   https://vibe-messenger-frontend.onrender.com
   ```
3. Click **Save Changes** — Render redeploys automatically.

---

## Step 7 — Create the Superuser (optional)

Render doesn't have a `docker-compose run` equivalent, but you can run a one-off command via the **Shell** tab:

1. Open **vibe-messenger-backend** → **Shell**
2. Run:
```bash
SUPERUSER_USERNAME=admin \
SUPERUSER_EMAIL=admin@example.com \
SUPERUSER_PASSWORD=your_strong_password \
SUPERUSER_DISPLAY_NAME=Admin \
python create_superuser.py
```

---

## Step 8 — Verify

Open `https://vibe-messenger-frontend.onrender.com` in your browser.

Checklist:
- [ ] Register a new user → redirects to chat
- [ ] Open a second browser tab, register another user
- [ ] Search for the first user, start a DM
- [ ] Send a message — appears in real time in the other tab
- [ ] Typing indicator shows in the other tab
- [ ] Presence dot goes grey when you close a tab

---

## Environment Variable Reference

### Backend (Render env vars)

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | asyncpg PostgreSQL URL | `postgresql+asyncpg://user:pass@host/db` |
| `REDIS_URL` | Redis connection URL | `redis://red-xxx:6379` |
| `JWT_SECRET` | HS256 signing secret, 32+ chars | `a3f1c2d4e5b6...` |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins | `https://your-frontend.onrender.com` |

### Frontend (Render env vars)

| Variable | Description | Example |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Backend HTTPS URL | `https://your-backend.onrender.com` |
| `NEXT_PUBLIC_WS_URL` | Backend WSS URL | `wss://your-backend.onrender.com` |

---

## Redeploying After Code Changes

```bash
git add .
git commit -m "your change"
git push origin main
```

Render detects the push and automatically rebuilds both services. The backend runs `alembic upgrade head` before starting, so schema changes are applied automatically.

---

## Troubleshooting

**Backend fails to start — "could not connect to server"**
The database URL is wrong. Make sure you changed `postgresql://` to `postgresql+asyncpg://` and used the **Internal** URL (not the External one).

**WebSocket connects then immediately closes**
Check that `ALLOWED_ORIGINS` on the backend matches the exact frontend URL including `https://`. A trailing slash or wrong domain causes CORS rejection on the WS handshake.

**Frontend shows blank page / 500**
Check that `NEXT_PUBLIC_API_URL` does not have a trailing slash and uses `https://` not `http://`.

**Free tier cold start**
The first request after 15 min of inactivity takes ~30s. This is normal on the free tier. The frontend will show a loading state while the backend wakes up.
