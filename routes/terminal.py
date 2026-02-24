import uuid

from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect, Depends, Form
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.ext.asyncio import AsyncSession

from config import TEMPLATES_DIR
from database import get_db
from models import TerminalSession as TerminalSessionModel
from services.terminal_manager import TerminalSessionManager

router = APIRouter(prefix="/terminal", tags=["terminal"])
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


def get_manager() -> TerminalSessionManager:
    return TerminalSessionManager.get_instance()


@router.post("/create", response_class=HTMLResponse)
async def create_session(
    request: Request,
    project_id: str = Form(...),
    name: str = Form("bash"),
    db: AsyncSession = Depends(get_db),
):
    try:
        manager = get_manager()
        session_id = str(uuid.uuid4())

        # Create pty session
        manager.create_session(session_id, project_id, name)

        # Persist to DB
        db_session = TerminalSessionModel(id=session_id, project_id=project_id, name=name, status="running")
        db.add(db_session)
        await db.commit()

        # Return updated terminal panel
        sessions = manager.list_sessions(project_id)
        return templates.TemplateResponse("partials/terminal_panel.html", {
            "request": request,
            "sessions": sessions,
            "active_session_id": session_id,
            "project_id": project_id,
        })
    except Exception as e:
        return HTMLResponse(f'<div class="error">Failed to create terminal: {e}</div>', status_code=500)


@router.get("/sessions/{project_id}", response_class=HTMLResponse)
async def list_sessions(project_id: str, request: Request):
    manager = get_manager()
    sessions = manager.list_sessions(project_id)
    # Check alive status
    for s in sessions:
        manager._check_alive(s)
    return templates.TemplateResponse("partials/terminal_panel.html", {
        "request": request,
        "sessions": sessions,
        "active_session_id": sessions[0].session_id if sessions else None,
        "project_id": project_id,
    })


@router.post("/{session_id}/stop", response_class=HTMLResponse)
async def stop_session(
    session_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    manager = get_manager()
    session = manager.get_session(session_id)
    if not session:
        return HTMLResponse('<div class="error">Session not found</div>', status_code=404)

    manager.stop_session(session_id)

    # Update DB
    db_session = await db.get(TerminalSessionModel, session_id)
    if db_session:
        db_session.status = "stopped"
        await db.commit()

    sessions = manager.list_sessions(session.project_id)
    return templates.TemplateResponse("partials/terminal_panel.html", {
        "request": request,
        "sessions": sessions,
        "active_session_id": session_id,
        "project_id": session.project_id,
    })


@router.post("/{session_id}/kill", response_class=HTMLResponse)
async def kill_session(
    session_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    manager = get_manager()
    session = manager.get_session(session_id)
    if not session:
        return HTMLResponse('<div class="error">Session not found</div>', status_code=404)

    project_id = session.project_id
    manager.kill_session(session_id)

    db_session = await db.get(TerminalSessionModel, session_id)
    if db_session:
        db_session.status = "stopped"
        await db.commit()

    sessions = manager.list_sessions(project_id)
    return templates.TemplateResponse("partials/terminal_panel.html", {
        "request": request,
        "sessions": sessions,
        "active_session_id": session_id,
        "project_id": project_id,
    })


@router.post("/{session_id}/clear", response_class=HTMLResponse)
async def clear_buffer(session_id: str, request: Request):
    manager = get_manager()
    manager.clear_buffer(session_id)
    return HTMLResponse("")


@router.delete("/{session_id}", response_class=HTMLResponse)
async def remove_session(
    session_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    manager = get_manager()
    session = manager.get_session(session_id)
    project_id = session.project_id if session else None

    manager.remove_session(session_id)

    db_session = await db.get(TerminalSessionModel, session_id)
    if db_session:
        await db.delete(db_session)
        await db.commit()

    if project_id:
        sessions = manager.list_sessions(project_id)
        new_active = sessions[0].session_id if sessions else None
        return templates.TemplateResponse("partials/terminal_panel.html", {
            "request": request,
            "sessions": sessions,
            "active_session_id": new_active,
            "project_id": project_id,
        })
    return HTMLResponse("")


# WebSocket endpoint — separate router to avoid prefix issues
ws_router = APIRouter(tags=["terminal-ws"])


@ws_router.websocket("/ws/terminal/{session_id}")
async def terminal_websocket(websocket: WebSocket, session_id: str):
    await websocket.accept()
    manager = get_manager()
    session = manager.get_session(session_id)

    if not session:
        await websocket.send_text("\r\n[Session not found]\r\n")
        await websocket.close()
        return

    # Subscribe FIRST so we don't miss data that arrives during buffer replay.
    # subscribe() has no internal await so no data can slip between subscribe and get_buffer.
    import asyncio
    q = await manager.subscribe(session_id)

    # Replay historical buffer to catch up the new client
    buffer = manager.get_buffer(session_id)
    if buffer:
        try:
            await websocket.send_bytes(buffer)
        except Exception:
            manager.unsubscribe(session_id, q)
            return

    # One lock per session serialises writes from all concurrent clients
    write_lock = manager.get_write_lock(session_id)

    async def read_pty():
        """Drain this client's queue and forward PTY output to the WebSocket."""
        try:
            while True:
                data = await q.get()
                if data is None:  # Session ended sentinel
                    break
                await websocket.send_bytes(data)
        except (WebSocketDisconnect, Exception):
            pass
        finally:
            manager.unsubscribe(session_id, q)

    async def write_pty():
        """Forward WebSocket input to the PTY, serialised via write_lock."""
        import json
        try:
            while True:
                msg = await websocket.receive()
                if msg.get("type") == "websocket.disconnect":
                    break
                if "text" in msg:
                    text = msg["text"]
                    # Check for JSON resize message from xterm.js
                    if text.startswith('{'):
                        try:
                            data = json.loads(text)
                            if data.get("type") == "resize":
                                manager.resize_session(session_id, data.get("rows", 24), data.get("cols", 80))
                                continue
                        except (json.JSONDecodeError, ValueError):
                            pass
                    async with write_lock:
                        manager.write_to_session(session_id, text.encode("utf-8"))
                elif "bytes" in msg:
                    async with write_lock:
                        manager.write_to_session(session_id, msg["bytes"])
        except (WebSocketDisconnect, Exception):
            pass

    read_task = asyncio.create_task(read_pty())
    write_task = asyncio.create_task(write_pty())

    try:
        await asyncio.gather(read_task, write_task, return_exceptions=True)
    finally:
        read_task.cancel()
        write_task.cancel()
        manager.unsubscribe(session_id, q)  # Idempotent — safe to call again
        # Session keeps running — don't kill it
