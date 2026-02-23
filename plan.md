# ThinkDev AI — AI Coding Workspace

## Overview

A web-based AI Coding Workspace (similar to OpenCode / Claude Code) with a custom Web UI.
SPA-like behavior using **htmx** for partial updates, **WebSockets** for streaming terminals,
and **FastAPI + Jinja2** on the backend. No React/Vue/SPA frameworks.

---

## Tech Stack

| Layer       | Technology                          |
|-------------|-------------------------------------|
| Backend     | FastAPI (Python 3.11+)              |
| Templates   | Jinja2                              |
| Frontend    | HTML + htmx + vanilla JS            |
| WebSocket   | FastAPI WebSocket + pty             |
| Database    | SQLite via aiosqlite + SQLAlchemy   |
| Storage     | `/workspace/{project_id}/`          |
| Static      | `/static/css/app.css`, `/static/js/app.js` |

---

## Project Structure

```
thinkdev-ai/
├── plan.md
├── requirements.txt
├── README.md
├── main.py                          # FastAPI app entry point
├── config.py                        # Settings & paths
├── database.py                      # SQLite setup, engine, session
├── models.py                        # SQLAlchemy models (Project, TerminalSession)
├── schemas.py                       # Pydantic schemas
│
├── services/
│   ├── __init__.py
│   ├── project_service.py           # CRUD for projects
│   ├── git_service.py               # All git operations
│   ├── file_service.py              # File explorer operations
│   └── terminal_manager.py          # TerminalSessionManager (pty + WebSocket)
│
├── routes/
│   ├── __init__.py
│   ├── projects.py                  # Project CRUD routes (htmx partials)
│   ├── git.py                       # Git operation routes
│   ├── files.py                     # File explorer & editor routes
│   ├── terminal.py                  # Terminal REST + WebSocket routes
│   └── pages.py                     # Full page routes (initial load only)
│
├── templates/
│   ├── base.html                    # Main layout (loads htmx, CSS, JS)
│   ├── index.html                   # Homepage / main workspace
│   │
│   ├── partials/
│   │   ├── project_list.html        # Left panel: project list
│   │   ├── project_form.html        # Create/edit project modal
│   │   ├── file_tree.html           # Left panel: file explorer tree
│   │   ├── editor.html              # Center: code editor
│   │   ├── editor_status.html       # Save status indicator
│   │   ├── terminal_panel.html      # Bottom: terminal tabs container
│   │   ├── terminal_tab.html        # Single terminal tab
│   │   ├── git_panel.html           # Right panel: git status/operations
│   │   ├── git_history.html         # Commit history list
│   │   ├── git_branches.html        # Branch list/switcher
│   │   └── session_manager.html     # Right panel: session manager
│   │
│   └── components/
│       ├── modal.html               # Reusable modal wrapper
│       ├── toast.html               # Toast notification
│       └── confirm_dialog.html      # Confirmation dialog
│
├── static/
│   ├── css/
│   │   └── app.css                  # All styles (dark theme, layout, panels)
│   └── js/
│       └── app.js                   # WebSocket terminal client, UI logic
│
└── workspace/                       # Project files stored here
    └── {project_id}/
```

---

## Database Schema

### Table: `projects`

| Column             | Type     | Notes                    |
|--------------------|----------|--------------------------|
| id                 | TEXT PK  | UUID                     |
| name               | TEXT     | Required, unique         |
| description        | TEXT     | Optional                 |
| git_repository_url | TEXT     | Optional                 |
| created_at         | DATETIME | Auto                     |
| updated_at         | DATETIME | Auto on update           |

### Table: `terminal_sessions`

| Column     | Type     | Notes                              |
|------------|----------|------------------------------------|
| id         | TEXT PK  | UUID (session_id)                  |
| project_id | TEXT FK  | References projects.id             |
| name       | TEXT     | User-defined label                 |
| status     | TEXT     | running / stopped                  |
| created_at | DATETIME | Auto                               |

---

## Architecture Details

### 1. SPA-Like Behavior (htmx)

- Initial page load serves `index.html` (full HTML).
- All subsequent interactions use htmx attributes:
  - `hx-get` / `hx-post` / `hx-put` / `hx-delete` for CRUD
  - `hx-target` to swap specific DOM regions
  - `hx-swap="innerHTML"` or `"outerHTML"` for partial updates
  - `hx-trigger` for events
- Routes return **HTML partials** (not JSON) for htmx requests.
- Project switching: `hx-get="/projects/{id}/activate"` swaps file tree, editor, terminal, git panels simultaneously using `hx-swap-oob`.

### 2. Terminal Architecture (WebSocket + pty)

```
┌──────────────┐     WebSocket      ┌──────────────────────┐
│  Browser Tab  │ ◄──────────────► │  FastAPI WS Endpoint  │
│  (app.js)     │                   │  /ws/terminal/{sid}   │
└──────────────┘                   └──────────┬───────────┘
                                              │
                                   ┌──────────▼───────────┐
                                   │ TerminalSessionManager│
                                   │                       │
                                   │  sessions = {         │
                                   │    sid: {             │
                                   │      pty_fd,          │
                                   │      pid,             │
                                   │      project_id,      │
                                   │      output_buffer    │
                                   │    }                  │
                                   │  }                    │
                                   └───────────────────────┘
                                              │
                                   ┌──────────▼───────────┐
                                   │   pty.fork() / bash   │
                                   │   cwd = /workspace/X  │
                                   └───────────────────────┘
```

**TerminalSessionManager** (singleton service):
- `create_session(project_id, name) -> session_id` — forks a pty, spawns `/bin/bash`, sets cwd
- `get_session(session_id)` — returns session handle
- `write(session_id, data)` — writes to pty stdin
- `read(session_id)` — async generator yielding pty stdout chunks
- `stop_session(session_id)` — sends SIGTERM
- `kill_session(session_id)` — sends SIGKILL
- `clear_buffer(session_id)` — clears output history
- `cleanup_all()` — called on server shutdown
- Output buffer: stores last N bytes so user can reconnect and see history

**WebSocket flow:**
1. Client opens WS to `/ws/terminal/{session_id}`
2. Server starts reading pty fd in async loop, sends chunks to client
3. Client sends keystrokes/input via WS, server writes to pty fd
4. On disconnect, session keeps running in background
5. On reconnect, server replays buffer then resumes live stream

### 3. Git Service

All operations use `asyncio.create_subprocess_exec` running `git` CLI commands.
Every command is scoped to `workspace/{project_id}/` — **never** allow path escape.

Operations:
- `clone(url, project_path)`
- `init(project_path)`
- `status(project_path)` → parsed status
- `branch_list(project_path)` → branches + current
- `branch_create(project_path, name)`
- `branch_switch(project_path, name)`
- `commit(project_path, message)`
- `pull(project_path)`
- `fetch(project_path)`
- `log(project_path, limit)` → commit history

### 4. File Service

- `list_tree(project_path)` → recursive directory tree (with depth limit)
- `read_file(project_path, relative_path)` → file content
- `write_file(project_path, relative_path, content)` → save
- `create_file(project_path, relative_path)`
- `create_dir(project_path, relative_path)`
- `rename(project_path, old_path, new_path)`
- `delete(project_path, relative_path)`
- **Path traversal prevention**: resolve real path, assert it starts with project_path

### 5. UI Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Header: ThinkDev AI                        [Active Project]│
├────────────┬────────────────────────────┬───────────────────┤
│            │                            │                   │
│  Projects  │     Code Editor            │   Git Status      │
│  ────────  │     ──────────             │   ──────────      │
│  > Proj A  │     /src/main.py           │   Branch: main    │
│    Proj B  │                            │   M file1.py      │
│    Proj C  │     [editor textarea]      │   A file2.py      │
│            │                            │                   │
│  ────────  │                            │   [Commit]        │
│  File Tree │                            │   [Pull] [Push]   │
│  ────────  │                            │                   │
│  📁 src/   │                            │   ──────────      │
│    📄 main │                            │   Sessions        │
│  📁 tests/ │                            │   ──────────      │
│            │                            │   Terminal 1 🟢   │
│            │                            │   Terminal 2 🟢   │
├────────────┴────────────────────────────┴───────────────────┤
│  Terminal  [Tab1: bash] [Tab2: opencode] [+ New]            │
│  ─────────────────────────────────────────────────────────  │
│  $ opencode                                                 │
│  > Starting AI agent...                                     │
│  > Analyzing codebase...                                    │
│  █                                                          │
└─────────────────────────────────────────────────────────────┘
```

- **Left panel** (250px): project list (top), file tree (bottom) — collapsible
- **Center panel** (flex): code editor with file path header + save status
- **Right panel** (280px): git panel (top), session manager (bottom) — collapsible
- **Bottom panel** (300px): terminal with tabs — resizable
- Dark theme (VS Code inspired)

---

## API Routes

### Pages (full HTML)
| Method | Path         | Description          |
|--------|--------------|----------------------|
| GET    | `/`          | Main workspace page  |

### Projects (htmx partials)
| Method | Path                          | Description              |
|--------|-------------------------------|--------------------------|
| GET    | `/projects/list`              | Project list partial     |
| GET    | `/projects/create-form`       | Create form partial      |
| POST   | `/projects/create`            | Create project           |
| GET    | `/projects/{id}/edit-form`    | Edit form partial        |
| PUT    | `/projects/{id}/update`       | Update project           |
| DELETE | `/projects/{id}/delete`       | Delete project           |
| GET    | `/projects/{id}/activate`     | Switch active project    |

### Files (htmx partials)
| Method | Path                              | Description            |
|--------|-----------------------------------|------------------------|
| GET    | `/files/{project_id}/tree`        | File tree partial      |
| GET    | `/files/{project_id}/read`        | Read file content      |
| POST   | `/files/{project_id}/save`        | Save file              |
| POST   | `/files/{project_id}/create`      | Create file/dir        |
| POST   | `/files/{project_id}/rename`      | Rename file/dir        |
| DELETE | `/files/{project_id}/delete`      | Delete file/dir        |

### Git (htmx partials)
| Method | Path                              | Description            |
|--------|-----------------------------------|------------------------|
| GET    | `/git/{project_id}/status`        | Git status partial     |
| POST   | `/git/{project_id}/init`          | Init repo              |
| POST   | `/git/{project_id}/clone`         | Clone repo             |
| GET    | `/git/{project_id}/branches`      | Branch list            |
| POST   | `/git/{project_id}/branch/create` | Create branch          |
| POST   | `/git/{project_id}/branch/switch` | Switch branch          |
| POST   | `/git/{project_id}/commit`        | Commit changes         |
| POST   | `/git/{project_id}/pull`          | Pull                   |
| POST   | `/git/{project_id}/fetch`         | Fetch                  |
| GET    | `/git/{project_id}/log`           | Commit history         |

### Terminal (REST + WebSocket)
| Method | Path                                  | Description              |
|--------|---------------------------------------|--------------------------|
| POST   | `/terminal/create`                    | Create new session       |
| GET    | `/terminal/sessions/{project_id}`     | List sessions            |
| POST   | `/terminal/{session_id}/stop`         | Stop session (SIGTERM)   |
| POST   | `/terminal/{session_id}/kill`         | Kill session (SIGKILL)   |
| POST   | `/terminal/{session_id}/clear`        | Clear output buffer      |
| DELETE | `/terminal/{session_id}`              | Remove session           |
| WS     | `/ws/terminal/{session_id}`           | WebSocket stream         |

---

## Implementation Checklist

### Phase 0: Project Setup ✅
- [x] Create directory structure
- [x] Write `requirements.txt` (fastapi, uvicorn, jinja2, aiosqlite, sqlalchemy, python-multipart)
- [x] Write `README.md` with run instructions
- [x] Create `config.py` with paths and settings
- [x] Create `database.py` with SQLite async engine + session factory
- [x] Create `models.py` with Project and TerminalSession tables
- [x] Create `schemas.py` with Pydantic models
- [x] Create `main.py` with FastAPI app, startup/shutdown events, static mount, template config

### Phase 1: Project Management ✅
- [x] Implement `services/project_service.py` (CRUD operations)
- [x] Implement `routes/projects.py` (htmx partial routes)
- [x] Create `templates/partials/project_list.html`
- [x] Create `templates/partials/project_form.html`
- [x] Wire project creation (empty + git clone option)
- [x] Wire project edit and delete
- [x] Wire project activation (switch active project)
- [x] Create workspace directory on project creation
- [x] Delete workspace directory on project deletion

### Phase 2: File Explorer & Editor ✅
- [x] Implement `services/file_service.py` (tree, read, write, create, rename, delete)
- [x] Add path traversal prevention (resolve + startswith check)
- [x] Implement `routes/files.py` (htmx partial routes)
- [x] Create `templates/partials/file_tree.html` (recursive folder/file rendering)
- [x] Create `templates/partials/editor.html` (textarea + file path + save button)
- [x] Create `templates/partials/editor_status.html` (saved/unsaved indicator)
- [x] Wire file click → load into editor
- [x] Wire save button → POST content → show status
- [x] Wire create/rename/delete with context menu or buttons

### Phase 3: Git Management ✅
- [x] Implement `services/git_service.py` (all git CLI operations via asyncio subprocess)
- [x] Implement `routes/git.py` (htmx partial routes)
- [x] Create `templates/partials/git_panel.html` (status, branch, actions)
- [x] Create `templates/partials/git_history.html` (commit log)
- [x] Create `templates/partials/git_branches.html` (branch list + switcher)
- [x] Wire init / clone on project creation
- [x] Wire status refresh (auto on file save, manual button)
- [x] Wire branch create / switch
- [x] Wire commit (message input + commit button)
- [x] Wire pull / fetch buttons
- [x] Wire commit history view

### Phase 4: Terminal (Core — Most Complex) ✅
- [x] Implement `services/terminal_manager.py`:
  - [x] `TerminalSessionManager` singleton class
  - [x] `create_session()` — pty.fork(), spawn bash, set cwd
  - [x] `write_to_session()` — write bytes to pty fd
  - [x] `read_from_session()` — async generator reading pty fd
  - [x] `stop_session()` — SIGTERM
  - [x] `kill_session()` — SIGKILL
  - [x] `clear_buffer()` — reset output buffer
  - [x] `cleanup_all()` — shutdown hook
  - [x] Output buffer (ring buffer, ~100KB per session)
  - [x] Session registry: `dict[str, SessionInfo]`
- [x] Implement `routes/terminal.py`:
  - [x] REST endpoints for create/stop/kill/clear/delete/list
  - [x] WebSocket endpoint `/ws/terminal/{session_id}`
  - [x] WS handler: read loop (pty→client) + write loop (client→pty)
  - [x] On WS connect: replay buffer, then stream live
  - [x] On WS disconnect: session keeps running
- [x] Create `templates/partials/terminal_panel.html` (tab bar + terminal output area)
- [x] Create `templates/partials/terminal_tab.html` (integrated into terminal_panel.html)
- [x] Implement JS WebSocket client in `app.js`:
  - [x] Connect/disconnect per terminal tab
  - [x] Render streamed output (handle ANSI escape codes or strip them)
  - [x] Send keystrokes / input line
  - [x] Tab switching (disconnect old WS, connect new WS)
  - [x] Auto-scroll terminal output
  - [x] Visual indicators (running/stopped)

### Phase 5: UI Layout & Styling ✅
- [x] Create `templates/base.html` (full page shell, load htmx CDN, app.css, app.js)
- [x] Create `templates/index.html` (extends base, defines panel layout)
- [x] Write `static/css/app.css`:
  - [x] CSS Grid / Flexbox layout for panels
  - [x] Dark theme (VS Code inspired colors)
  - [x] Panel resize handles (CSS + JS)
  - [x] Terminal styling (monospace, dark bg, green/white text)
  - [x] File tree styling (indentation, icons via Unicode)
  - [x] Editor styling (monospace textarea, line numbers optional)
  - [x] Tab styling (active/inactive, running indicator)
  - [x] Modal styling
  - [x] Toast notifications
  - [x] Scrollbar styling
  - [x] Responsive considerations
- [x] Write `static/js/app.js`:
  - [x] WebSocket terminal client class
  - [x] Terminal tab management
  - [x] Panel resize logic
  - [x] Keyboard shortcuts (Ctrl+S save, etc.)
  - [x] Unsaved changes tracking
  - [x] htmx event listeners (afterSwap, etc.)
  - [x] Toast notification system
  - [x] Context menu for file tree (right-click)

### Phase 6: Integration & Polish ✅
- [x] Wire project switch → update all panels (file tree, editor, git, terminal tabs)
- [x] Use JS-based fetch for multi-panel updates on project switch (replaced OOB swaps to avoid htmx insertBefore errors)
- [x] Add loading indicators (htmx `hx-indicator` with spinner on project activate, git actions, commit, clone)
- [x] Add error handling (try/except in all routes, user-friendly messages)
- [x] Add toast notifications for success/error feedback (toast variants: default, error, success)
- [x] Ensure terminal sessions survive project switch (sessions persist in TerminalSessionManager, reloaded per project)
- [x] Ensure background processes keep running (pty sessions survive WS disconnect)
- [x] Add session manager panel (list all active sessions in right panel, auto-refresh on create/close)
- [x] Add AI CLI tool quick-launch buttons (opencode ⚙, claude ★ — creates named terminal + sends command)
- [x] Test: create project → create files → edit → git init → commit → terminal → project switch (Playwright verified, zero console errors)
- [x] Cleanup: proper shutdown hooks (cleanup_all in lifespan), resource cleanup

### Phase 7: Final Verification ✅
- [x] `pip install -r requirements.txt` works (exit code 0, all requirements satisfied)
- [x] `python main.py` starts server on port 8000 (Application startup complete)
- [x] Homepage loads with full layout (all 4 panels visible)
- [x] Create project works (empty project tested; git clone form available)
- [x] File tree renders, file click loads editor (hello.py created + opened)
- [x] File save works with status indicator (Ctrl+S → "✓ Saved")
- [x] Git operations work (init, status, commit, branch — all verified)
- [x] Terminal session creates and streams output (bash tab + WS connected)
- [x] Multiple terminal tabs work simultaneously (2 bash tabs created)
- [x] Project switch preserves terminal sessions (switched away and back — 2 tabs restored)
- [x] Long-running commands (e.g., `opencode`) stream correctly (AI CLI buttons ⚙★ create named terminals + send command)
- [x] WebSocket reconnect replays buffer (tab click reconnected WS, shell prompt replayed from pty buffer)
- [x] No full page reloads after initial load (performance.getEntriesByType('navigation').length === 1)

---

## Key Design Decisions

1. **pty over subprocess**: Using `pty.fork()` gives a real pseudo-terminal, enabling interactive CLI tools (opencode, claude), colored output, and proper shell behavior. Fallback to `asyncio.create_subprocess_exec` if pty unavailable.

2. **Output buffer**: Each terminal session stores a ring buffer (~100KB). When a user reconnects (switches back to a tab), the buffer is replayed so they see recent output without missing anything.

3. **htmx OOB swaps**: When switching projects, a single request returns multiple `hx-swap-oob` fragments to update file tree, editor, git panel, and terminal tabs simultaneously — no multiple requests needed.

4. **Session persistence**: Terminal sessions are stored in-memory (TerminalSessionManager) and in DB (for metadata). The in-memory dict holds the actual pty file descriptors. Sessions survive UI navigation but not server restarts.

5. **Security**: All file and git operations validate paths against the project workspace root. No path traversal allowed. Terminal sessions are scoped to project workspace via `cwd`.

---

## Dependencies

```
fastapi==0.115.0
uvicorn[standard]==0.30.0
jinja2==3.1.4
python-multipart==0.0.9
sqlalchemy==2.0.35
aiosqlite==0.20.0
websockets==13.0
```

## Run Instructions

```bash
cd thinkdev-ai
pip install -r requirements.txt
python main.py
# Open http://localhost:8000
```
