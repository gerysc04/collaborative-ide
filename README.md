# Collide

A browser-based collaborative cloud IDE. Multiple developers share a URL and get a live coding environment with a real terminal, real file system, and real code execution inside an isolated Docker container — no setup required.

> Think self-hosted Replit / Gitpod.

---

## Features

| Feature | Details |
|---|---|
| **Collaborative editor** | Monaco + Yjs CRDT, per-file sync, real-time cursor & selection of all online users |
| **Real terminal** | Full PTY shell inside the container via xterm.js + WebSocket, multiple tabs |
| **Shared terminals** | Share a terminal tab so all users see the same output and can type |
| **File tree** | inotify-based live file watcher, create files/folders, drag-and-drop upload (files & folders), download project as `.tar.gz` |
| **File tabs** | Click to open, Ctrl+W to close, Ctrl+P fuzzy file finder |
| **Real-time chat** | Shared chat via Yjs, messages synced to all users |
| **AI agent** | Multi-provider (Anthropic, OpenAI, Gemini) — `@tag message` in chat; agent reads/writes files and runs commands with a session-level lock. API keys stored AES-256-GCM encrypted |
| **Branch management** | Per-branch Docker containers, switch branches with uncommitted-change prompt |
| **Run configurations** | Save named run commands, execute in a new terminal tab with one click |
| **Port forwarding** | Proxy any container port via `{sessionId}-{port}.lvh.me` subdomain |
| **Collaborative presence** | Online users shown as colored avatar circles in the toolbar |
| **Resource usage** | Live CPU% and memory displayed in the toolbar via Docker stats stream |
| **Container persistence** | Inactivity timer snapshots containers via `docker commit`, restores on rejoin |
| **Multi-container sessions** | Optional PostgreSQL/MongoDB/Redis sidecar on the same Docker network, reachable at hostname `db` |
| **GitHub integration** | OAuth login, import any repo by cloning into the container on session create |
| **Yjs persistence** | Editor state survives collab server restarts via `y-mongodb-provider` |

---

## Architecture

```
Browser (React + TypeScript, Vite)
├── Monaco Editor         — code editing
├── Yjs + y-websocket     — real-time CRDT sync (per-file rooms)
├── xterm.js              — terminal emulator
└── WebSocket connections to backend

y-websocket server (Node.js, port 1234)
└── Yjs document sync + MongoDB persistence (y-mongodb-provider)

FastAPI backend (Python, port 8000)
├── REST  — sessions, files, run configs, AI providers, port forwarding
├── WS /ws/terminal/{id}       — PTY shell in container
├── WS /ws/terminal/{id}/shared/{name} — multiplexed shared PTY
├── WS /ws/files/{id}          — inotify file system watcher
├── WS /ws/ai/{id}             — AI agent tool loop (streaming)
├── WS /ws/stats/{id}          — live Docker container stats
└── HTTP subdomain proxy       — port forwarding via Host header routing

Docker
└── One container per branch per session (collide-dev image)
    ├── Node 22 + Python 3 + Go + Rust + DB clients
    ├── Optional DB sidecar (PostgreSQL / MongoDB / Redis)
    └── Resource limits: 512MB RAM, 50% CPU

MongoDB
└── Sessions, Yjs documents, encrypted AI provider keys
```

---

## Tech Stack

**Frontend** — React 19, TypeScript, Vite, Monaco Editor, xterm.js, Yjs, y-websocket, react-resizable-panels

**Backend** — Python, FastAPI, Motor (async MongoDB), Docker SDK, `cryptography` (AES-256-GCM)

**Collab server** — Node.js, y-websocket, y-mongodb-provider

**Infrastructure** — Docker, MongoDB

---

## Running locally

### Prerequisites

- Docker running locally
- Node.js 18+
- Python 3.11+
- MongoDB running on `localhost:27017`

### Setup

```bash
git clone https://github.com/yourname/collide
cd collide

# Install root dependencies (concurrently etc.)
npm install

# Install collab server dependencies
cd collab-server && npm install && cd ..

# Install frontend dependencies
cd frontend && npm install && cd ..

# Set up Python venv
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd ..
```

### Environment

Create `backend/.env`:

```env
MONGODB_URL=mongodb://localhost:27017
SECRET_KEY=<run: python -c "import secrets; print(secrets.token_hex(32))">
GITHUB_CLIENT_ID=<your GitHub OAuth app client ID>
GITHUB_CLIENT_SECRET=<your GitHub OAuth app client secret>
GITHUB_REDIRECT_URI=http://localhost:8000/auth/github/callback
FRONTEND_URL=http://localhost:5173
```

To create a GitHub OAuth app: GitHub → Settings → Developer settings → OAuth Apps → New OAuth App. Set the callback URL to `http://localhost:8000/auth/github/callback`.

### Start

```bash
npm run dev
```

This starts all three services concurrently:
- Frontend: http://localhost:5173
- Backend: http://localhost:8000
- Collab server: ws://localhost:1234

### Port forwarding (local)

Port forwarding uses `*.lvh.me` subdomains which resolve to `127.0.0.1`. No extra DNS setup needed locally.

---

## Project structure

```
.
├── frontend/          # React app
│   └── src/
│       ├── components/   # Editor, Terminal, FileTree, Chat, AI panels, etc.
│       ├── hooks/        # useCollaboration (Yjs + cursors + presence)
│       └── pages/        # Home, Session
├── backend/           # FastAPI app
│   ├── routes/           # REST + WebSocket endpoints
│   ├── services/         # Docker, MongoDB, file I/O, crypto, agent, stats
│   ├── models/           # Pydantic models
│   └── helpers/          # Docker exec helpers
├── collab-server/     # y-websocket server with MongoDB persistence
└── container/         # Dockerfile for session containers
```
