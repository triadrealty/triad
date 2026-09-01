# Triad Realty

A full-stack real estate platform. The **Python/FastAPI backend** serves both the REST API and the compiled **React frontend** as static files from a single process.

---

## Architecture

```
triad-main/
├── frontend/          # React app (source)
├── backend/           # FastAPI app
│   ├── server.py      # Main entry point — serves /api/* and static frontend
│   ├── frontend_build/# Compiled React output (generated, gitignored)
│   ├── .env           # Local secrets (gitignored — copy from .env.example)
│   └── .env.example   # Template — commit this, never the real .env
├── Dockerfile         # Multi-stage Docker build
├── build.sh           # CI/Render build script
├── render.yaml        # Render deployment config
└── Makefile           # Unified developer commands (see below)
```

The React app is compiled with `npm run build` and the output is placed in `backend/frontend_build/`. FastAPI serves it via `StaticFiles` and a catch-all route that hands all non-API paths to `index.html` so React Router works correctly.

---

## Quick Start (Local Development)

### Prerequisites
- **Node.js 18+** (`brew install node` on macOS)
- **Python 3.10+** (`brew install python` on macOS)
- **GNU Make** (pre-installed on macOS/Linux)

### 1. Configure environment

```bash
cp backend/.env.example backend/.env
# Edit backend/.env and set your credentials
```

### 2. Build and run

```bash
make dev
```

That's it. One command installs dependencies, builds the React app, copies it into the backend, and starts the server.

Open **http://localhost:8000** in your browser.

---

## Make Commands

| Command | What it does |
|---|---|
| `make dev` | Install deps → build frontend → start server at :8000 |
| `make install` | Install npm + pip dependencies (no build) |
| `make build` | Build React frontend and copy to `backend/frontend_build/` |
| `make backend` | Start backend only (no frontend rebuild, with `--reload`) |
| `make clean` | Remove `frontend/build/`, `backend/frontend_build/`, `__pycache__` |

---

## Admin Panel

Visit **http://localhost:8000/admin/login**

Default credentials are set in `backend/.env`. See `.env.example` for the variable names.

> ⚠️ **Change all default passwords before deploying to production.**

---

## Deployment

### Docker (recommended)

```bash
docker build -t triad-realty .
docker run -p 8000:8000 --env-file backend/.env triad-realty
```

The `Dockerfile` is a multi-stage build: Node builds the frontend, Python serves everything.

### Render (Production Hosting)

This project is hosted on **Render** with continuous deployment linked to `https://github.com/triadrealty/triad.git`.
Pushing to the `main` branch automatically triggers a zero-downtime deployment on Render.

Render uses [`render.yaml`](render.yaml) automatically:
- `buildCommand` — builds frontend + installs Python dependencies
- `startCommand` — `uvicorn server:app --host 0.0.0.0 --port $PORT`
- Environment variables are managed in the Render Dashboard.

See [`README-RENDER.md`](README-RENDER.md) for the complete guide to Render deployment and automatic CI/CD configuration.

---

## Environment Variables

See [`backend/.env.example`](backend/.env.example) for the full reference. Key variables:

| Variable | Description |
|---|---|
| `JWT_SECRET` | Random 64-char hex string — generate with `python3 -c "import secrets; print(secrets.token_hex(32))"` |
| `DEVELOPER_EMAIL / PASSWORD` | Platform developer account |
| `OWNER_EMAIL / PASSWORD` | Organisation owner account |
| `STAFF_EMAIL / PASSWORD` | Staff account |
| `MONGO_URL` | MongoDB connection string (leave blank to use local JSON store) |
| `REELLY_API_KEY` | External property listings API key (optional) |
| `ENVIRONMENT` | `development` or `production` (enables JWT secret enforcement) |
| `CORS_ORIGINS` | Explicit comma-separated frontend origins. Do not use `*` in production. |
| `ALLOWED_HOSTS` | Explicit comma-separated hostnames accepted by the API. |
| `FORCE_HTTPS` | Set `true` in production to redirect HTTP to HTTPS. |
| `LOG_FORMAT` | Use `json` in production for structured auth/API/security logs. |

Production notes:
- Store all secrets in the hosting provider secret manager or environment settings, not in source control.
- Use an HTTPS-only public endpoint and set `FORCE_HTTPS=true`.
- Restrict MongoDB with private networking or a strict provider IP allowlist; do not expose the database to the public internet.
- Keep `CORS_ORIGINS` and `ALLOWED_HOSTS` pinned to real deployment domains.
