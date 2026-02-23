# ThinkDev AI

A web-based AI coding workspace with persistent streaming terminals, git management, file explorer, and AI CLI tool integration. Built with **FastAPI**, **Jinja2**, **htmx**, and **WebSockets** — zero JavaScript frameworks, no React, no Vue.

![Python](https://img.shields.io/badge/Python-3.11+-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/bankawishair/thinkdev-ai.git
cd thinkdev-ai

# Create virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate  # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Run the server
python main.py

# Open in browser
open http://localhost:8000
```

The server starts on `http://localhost:8000` with hot-reload enabled.

---

## Features

### Project Management
- Create, edit, and delete projects via modal forms
- Optional git repository URL on creation (auto-clones)
- Each project gets an isolated workspace directory (`workspace/{project_id}/`)
- Switch between projects instantly — all panels update without page reload

### File Explorer
- Recursive file tree with folder expand/collapse
- Create files and folders via toolbar or right-click context menu
- Rename and delete with confirmation dialogs
- File icons distinguish files (◦) from folders (▼)
- Active file highlighting in tree

### Code Editor
- Monospace textarea editor with syntax-appropriate font
- **Ctrl+S / Cmd+S** keyboard shortcut to save
- Real-time save status indicator (✓ Saved / ● Unsaved)
- Tab key inserts tab character (not focus change)
- Unsaved changes tracking on every keystroke

### Git Management
- **Init** — Initialize a new git repository
- **Clone** — Clone from a remote URL
- **Status** — View changed files with status indicators (M, A, D, ??)
- **Commit** — Stage all + commit with message
- **Branch** — List, create, and switch branches
- **Pull / Fetch** — Sync with remote
- **History** — View commit log with hash, message, author, date

### Persistent Terminal
- Real pseudo-terminal via `pty.fork()` — supports interactive CLI tools
- **WebSocket streaming** — bidirectional real-time I/O
- **Output buffer** — ~100KB ring buffer per session, replayed on reconnect
- **Multiple tabs** — Create unlimited concurrent terminal sessions per project
- Sessions survive WebSocket disconnects (tab switching, page focus loss)
- Sessions survive project switching — restored when you switch back
- Clear, Stop (SIGTERM), Kill (SIGKILL) controls per session

### AI CLI Integration
- **⚙ opencode** button — Creates a named terminal and launches `opencode`
- **★ claude** button — Creates a named terminal and launches `claude`
- Works with any interactive CLI tool (aider, cursor, etc.)
- Each AI tool runs in its own dedicated terminal tab

### Session Manager
- Right panel shows all active terminal sessions for the current project
- Running/stopped status indicators (green/gray dots)
- Click ▶ to focus any session
- Auto-refreshes when terminals are created or closed

### UI/UX
- **Dark theme** — VS Code-inspired Catppuccin Mocha color palette
- **4-panel layout** — Left (projects + files), Center (editor), Right (git + sessions), Bottom (terminal)
- **Resizable terminal** — Drag the resize handle to adjust terminal height
- **Right-click context menu** — On file tree items (Open, Rename, Delete)
- **Toast notifications** — Success/error feedback with auto-dismiss
- **Loading spinners** — On project activation, git operations
- **Custom scrollbars** — Styled to match dark theme
- **No full page reloads** — Everything is htmx/JS partial swaps

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | FastAPI 0.115, Python 3.11+ |
| **Templates** | Jinja2 3.1 |
| **Frontend** | HTML + htmx 2.0 + vanilla JS |
| **Terminal** | WebSocket + `pty.fork()` |
| **Database** | SQLite via SQLAlchemy 2.0 + aiosqlite |
| **Styling** | Custom CSS (no Tailwind/Bootstrap) |

### Dependencies

```
fastapi==0.115.0
uvicorn[standard]==0.30.0
jinja2==3.1.4
python-multipart==0.0.9
sqlalchemy==2.0.35
aiosqlite==0.20.0
websockets==13.0
```

---

## Project Structure

```
thinkdev-ai/
├── main.py                    # FastAPI app entry point + lifespan
├── config.py                  # Paths, ports, constants
├── database.py                # Async SQLite engine + session factory
├── models.py                  # SQLAlchemy models (Project, TerminalSession)
├── schemas.py                 # Pydantic schemas
├── requirements.txt
│
├── routes/
│   ├── pages.py               # Homepage route
│   ├── projects.py            # CRUD + activate project
│   ├── files.py               # File tree, read, save, create, rename, delete
│   ├── git.py                 # Git operations (init, clone, commit, branch, etc.)
│   └── terminal.py            # Terminal CRUD + WebSocket endpoint
│
├── services/
│   ├── project_service.py     # Project DB operations
│   ├── file_service.py        # Filesystem operations with path traversal protection
│   ├── git_service.py         # Git CLI wrapper (async subprocess)
│   └── terminal_manager.py    # PTY session manager (singleton)
│
├── templates/
│   ├── base.html              # Page shell (header, layout grid, htmx CDN)
│   ├── index.html             # Main 4-panel layout
│   └── partials/
│       ├── project_list.html
│       ├── project_form.html
│       ├── project_activated.html   # Multi-panel JS update on project switch
│       ├── file_tree.html           # Recursive file tree macro
│       ├── editor.html
│       ├── editor_status.html
│       ├── git_panel.html
│       ├── git_branches.html
│       ├── git_history.html
│       └── terminal_panel.html      # Terminal tabs + WS auto-connect
│
├── static/
│   ├── css/app.css            # Full dark theme (~490 lines)
│   └── js/app.js              # Terminal WS client, panel resize, context menu (~440 lines)
│
└── workspace/                 # Project files stored here
    └── {project_id}/          # Each project gets its own directory
```

---

## Architecture

### How It Works

1. **No SPA framework** — The entire UI is server-rendered Jinja2 templates. Interactivity comes from htmx (partial HTML swaps) and vanilla JS (WebSocket terminal, panel resize, context menus).

2. **Project activation** — When you click a project, a single GET request returns the project name. A `<script>` block then fires parallel `fetch()` calls to load the file tree, git status, and terminal sessions into their respective panels. This avoids htmx OOB swap issues and keeps the UI snappy.

3. **Terminal architecture** — Each terminal session is a real PTY process (`pty.fork()` → `/bin/bash`). A WebSocket endpoint bridges the browser to the PTY fd. Output is buffered in a ~100KB ring buffer so reconnecting clients see recent output. Sessions are managed by a singleton `TerminalSessionManager` that tracks all active PTYs across all projects.

4. **File isolation** — Each project's files live in `workspace/{project_id}/`. All file operations validate paths against traversal attacks (no `../` escapes).

5. **Git operations** — Git commands run as async subprocesses in the project's workspace directory. The git panel auto-refreshes after each operation.

### Key Design Decisions

- **`pty.fork()` over `subprocess`** — Real pseudo-terminal enables interactive CLI tools (opencode, claude, aider), colored output, and proper shell behavior including job control.
- **Ring buffer** — Each session stores ~100KB of output. On WebSocket reconnect, the buffer is replayed so users don't miss output when switching tabs.
- **JS-based panel updates** — Project switching uses `fetch()` + `htmx.process()` instead of htmx OOB swaps to avoid `insertBefore` errors with mismatched element types.
- **No build step** — Zero npm, zero webpack, zero bundling. Just Python, HTML, CSS, JS served directly.

---

## API Endpoints

### Pages
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Homepage |

### Projects
| Method | Path | Description |
|--------|------|-------------|
| GET | `/projects/create-form` | New project modal form |
| POST | `/projects/create` | Create project |
| GET | `/projects/{id}/activate` | Activate project (update all panels) |
| GET | `/projects/{id}/edit-form` | Edit project modal form |
| POST | `/projects/{id}/edit` | Update project |
| DELETE | `/projects/{id}/delete` | Delete project + workspace |

### Files
| Method | Path | Description |
|--------|------|-------------|
| GET | `/files/{id}/tree` | File tree HTML |
| GET | `/files/{id}/read?path=...` | Open file in editor |
| POST | `/files/{id}/save` | Save file content |
| POST | `/files/{id}/create` | Create file or folder |
| POST | `/files/{id}/rename` | Rename file or folder |
| DELETE | `/files/{id}/delete?path=...` | Delete file or folder |

### Git
| Method | Path | Description |
|--------|------|-------------|
| GET | `/git/{id}/status` | Git status panel |
| POST | `/git/{id}/init` | Initialize repo |
| POST | `/git/{id}/clone` | Clone from URL |
| POST | `/git/{id}/commit` | Stage all + commit |
| POST | `/git/{id}/pull` | Git pull |
| POST | `/git/{id}/fetch` | Git fetch |
| GET | `/git/{id}/branches` | List branches |
| POST | `/git/{id}/branch/create` | Create branch |
| POST | `/git/{id}/branch/switch` | Switch branch |
| GET | `/git/{id}/log` | Commit history |

### Terminal
| Method | Path | Description |
|--------|------|-------------|
| POST | `/terminal/create` | Create terminal session |
| GET | `/terminal/sessions/{project_id}` | List sessions for project |
| POST | `/terminal/{id}/stop` | SIGTERM |
| POST | `/terminal/{id}/kill` | SIGKILL |
| POST | `/terminal/{id}/clear` | Clear output buffer |
| DELETE | `/terminal/{id}` | Remove session |
| WS | `/ws/terminal/{id}` | WebSocket bidirectional stream |

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` / `Cmd+S` | Save current file |
| `Tab` (in editor) | Insert tab character |
| `Escape` | Close modal / context menu |
| `Enter` (in terminal input) | Send command to terminal |

---

## Requirements

- **Python 3.11+** (uses `pty` module — macOS/Linux only)
- **Git** installed and available in PATH
- No Node.js, no npm, no build tools required

> **Note**: The `pty` module is not available on Windows. This application requires macOS or Linux.

---

## License

MIT
