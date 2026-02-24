import os
import pty
import signal
import asyncio
import fcntl
import struct
import termios
from collections import deque
from dataclasses import dataclass, field
from typing import Optional

from config import TERMINAL_BUFFER_SIZE, TERMINAL_SHELL
from services import workspace


@dataclass
class SessionInfo:
    session_id: str
    project_id: str
    name: str
    pid: int
    fd: int
    status: str = "running"
    output_buffer: deque = field(default_factory=lambda: deque(maxlen=TERMINAL_BUFFER_SIZE))
    _buffer_bytes: int = 0


class TerminalSessionManager:
    _instance: Optional["TerminalSessionManager"] = None

    def __init__(self):
        self.sessions: dict[str, SessionInfo] = {}
        # Per-session: set of asyncio.Queue, one per connected WebSocket client
        self._subscribers: dict[str, set[asyncio.Queue]] = {}
        # Per-session: single background PTY reader task
        self._reader_tasks: dict[str, asyncio.Task] = {}
        # Per-session: write lock to serialize input from multiple clients
        self._write_locks: dict[str, asyncio.Lock] = {}

    @classmethod
    def get_instance(cls) -> "TerminalSessionManager":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def create_session(self, session_id: str, project_id: str, name: str = "bash") -> SessionInfo:
        ws_path = workspace.resolve(project_id)
        ws_path.mkdir(parents=True, exist_ok=True)

        pid, fd = pty.openpty()
        child_pid = os.fork()

        if child_pid == 0:
            # Child process
            os.close(pid)
            os.setsid()
            # Set the slave as controlling terminal
            fcntl.ioctl(fd, termios.TIOCSCTTY, 0)
            os.dup2(fd, 0)
            os.dup2(fd, 1)
            os.dup2(fd, 2)
            if fd > 2:
                os.close(fd)
            os.chdir(str(ws_path))
            env = os.environ.copy()
            env["TERM"] = "xterm-256color"
            env["COLORTERM"] = "truecolor"
            env["HOME"] = os.path.expanduser("~")
            env["CLICOLOR"] = "1"
            env["CLICOLOR_FORCE"] = "1"
            env["LSCOLORS"] = "GxFxCxDxBxegedabagaced"
            env["FORCE_COLOR"] = "1"

            # Create a custom zshrc that sources user's config then sets colored prompt
            import tempfile
            zdotdir = tempfile.mkdtemp(prefix="thinkdev-zsh-")
            home = os.path.expanduser("~")
            with open(os.path.join(zdotdir, ".zshrc"), "w") as f:
                f.write(f'[ -f "{home}/.zshrc" ] && source "{home}/.zshrc"\n')
                f.write('export PROMPT="%F{green}%n@%m%f %F{blue}%1~%f %# "\n')
                f.write('export CLICOLOR=1\n')
            with open(os.path.join(zdotdir, ".zshenv"), "w") as f:
                f.write(f'[ -f "{home}/.zshenv" ] && source "{home}/.zshenv"\n')

            shell_name = os.path.basename(TERMINAL_SHELL)
            if shell_name == "zsh":
                env["ZDOTDIR"] = zdotdir
                os.execvpe(TERMINAL_SHELL, [TERMINAL_SHELL], env)
            else:
                # Bash: use --rcfile with colored PS1
                import getpass, socket
                user = getpass.getuser()
                host = socket.gethostname().split(".")[0]
                bashrc = os.path.join(zdotdir, ".bashrc")
                with open(bashrc, "w") as f:
                    f.write(f'[ -f "{home}/.bashrc" ] && source "{home}/.bashrc"\n')
                    f.write(f'export PS1="\\[\\033[01;32m\\]{user}@{host}\\[\\033[00m\\] \\[\\033[01;34m\\]\\W\\[\\033[00m\\] \\$ "\n')
                os.execvpe(TERMINAL_SHELL, [TERMINAL_SHELL, "--rcfile", bashrc], env)
        else:
            # Parent process
            os.close(fd)
            # Set non-blocking
            flags = fcntl.fcntl(pid, fcntl.F_GETFL)
            fcntl.fcntl(pid, fcntl.F_SETFL, flags | os.O_NONBLOCK)

            # Set terminal size (80x24)
            winsize = struct.pack("HHHH", 24, 80, 0, 0)
            fcntl.ioctl(pid, termios.TIOCSWINSZ, winsize)

            session = SessionInfo(
                session_id=session_id,
                project_id=project_id,
                name=name,
                pid=child_pid,
                fd=pid,
            )
            self.sessions[session_id] = session
            # Init per-session multi-client state
            self._subscribers[session_id] = set()
            return session

    def get_session(self, session_id: str) -> Optional[SessionInfo]:
        return self.sessions.get(session_id)

    def write_to_session(self, session_id: str, data: bytes) -> bool:
        session = self.sessions.get(session_id)
        if not session or session.status != "running":
            return False
        try:
            os.write(session.fd, data)
            return True
        except OSError:
            return False

    def get_write_lock(self, session_id: str) -> asyncio.Lock:
        """Return (lazily created) write lock for a session."""
        if session_id not in self._write_locks:
            self._write_locks[session_id] = asyncio.Lock()
        return self._write_locks[session_id]

    def resize_session(self, session_id: str, rows: int, cols: int) -> bool:
        session = self.sessions.get(session_id)
        if not session or session.status != "running":
            return False
        try:
            winsize = struct.pack("HHHH", rows, cols, 0, 0)
            fcntl.ioctl(session.fd, termios.TIOCSWINSZ, winsize)
            os.kill(session.pid, signal.SIGWINCH)
            return True
        except OSError:
            return False

    # ------------------------------------------------------------------ #
    # Multi-client broadcast: one PTY reader, fan-out to subscriber queues
    # ------------------------------------------------------------------ #

    async def subscribe(self, session_id: str) -> asyncio.Queue:
        """Register a WebSocket client. Returns a queue that receives PTY bytes.
        Call unsubscribe() when the client disconnects."""
        q: asyncio.Queue[Optional[bytes]] = asyncio.Queue(maxsize=512)
        subs = self._subscribers.setdefault(session_id, set())
        subs.add(q)
        # Start/restart the single background reader if needed
        self._ensure_reader(session_id)
        return q

    def unsubscribe(self, session_id: str, q: asyncio.Queue) -> None:
        """Unregister a WebSocket client queue."""
        subs = self._subscribers.get(session_id)
        if subs:
            subs.discard(q)

    def _ensure_reader(self, session_id: str) -> None:
        """Start the background PTY reader task if it isn't already running."""
        task = self._reader_tasks.get(session_id)
        if task is None or task.done():
            self._reader_tasks[session_id] = asyncio.create_task(
                self._pty_reader_task(session_id),
                name=f"pty-reader-{session_id[:8]}",
            )

    async def _pty_reader_task(self, session_id: str) -> None:
        """Reads from the PTY once and broadcasts to ALL subscriber queues.
        This is the ONLY coroutine that calls os.read() on the fd."""
        session = self.sessions.get(session_id)
        if not session:
            return

        loop = asyncio.get_event_loop()
        while session.status == "running":
            try:
                data = await loop.run_in_executor(None, self._blocking_read, session.fd)
                if data:
                    # Append to replay buffer
                    session.output_buffer.append(data)
                    session._buffer_bytes += len(data)
                    while session._buffer_bytes > TERMINAL_BUFFER_SIZE and session.output_buffer:
                        removed = session.output_buffer.popleft()
                        session._buffer_bytes -= len(removed)

                    # Broadcast to every connected client
                    for q in list(self._subscribers.get(session_id, set())):
                        try:
                            q.put_nowait(data)
                        except asyncio.QueueFull:
                            pass  # Slow consumer — drop rather than block
                else:
                    await asyncio.sleep(0.01)
            except OSError:
                session.status = "stopped"
                break
            except asyncio.CancelledError:
                break
            except Exception:
                await asyncio.sleep(0.05)

        # Signal all subscribers that the session ended
        sentinel = None
        for q in list(self._subscribers.get(session_id, set())):
            try:
                q.put_nowait(sentinel)
            except asyncio.QueueFull:
                pass

    def _cleanup_session_state(self, session_id: str) -> None:
        """Cancel reader task and notify remaining subscribers."""
        task = self._reader_tasks.pop(session_id, None)
        if task and not task.done():
            task.cancel()

        subs = self._subscribers.pop(session_id, set())
        for q in subs:
            try:
                q.put_nowait(None)
            except asyncio.QueueFull:
                pass

        self._write_locks.pop(session_id, None)

    # ------------------------------------------------------------------ #

    def get_buffer(self, session_id: str) -> bytes:
        session = self.sessions.get(session_id)
        if not session:
            return b""
        return b"".join(session.output_buffer)

    def clear_buffer(self, session_id: str) -> bool:
        session = self.sessions.get(session_id)
        if not session:
            return False
        session.output_buffer.clear()
        session._buffer_bytes = 0
        return True

    def stop_session(self, session_id: str) -> bool:
        session = self.sessions.get(session_id)
        if not session or session.status != "running":
            return False
        try:
            os.kill(session.pid, signal.SIGTERM)
            session.status = "stopped"
            return True
        except OSError:
            session.status = "stopped"
            return True

    def kill_session(self, session_id: str) -> bool:
        session = self.sessions.get(session_id)
        if not session:
            return False
        try:
            os.kill(session.pid, signal.SIGKILL)
        except OSError:
            pass
        session.status = "stopped"
        self._close_fd(session)
        self._cleanup_session_state(session_id)
        return True

    def remove_session(self, session_id: str) -> bool:
        session = self.sessions.pop(session_id, None)
        if not session:
            return False
        if session.status == "running":
            try:
                os.kill(session.pid, signal.SIGKILL)
            except OSError:
                pass
        self._close_fd(session)
        self._cleanup_session_state(session_id)
        # Reap child
        try:
            os.waitpid(session.pid, os.WNOHANG)
        except ChildProcessError:
            pass
        return True

    def _close_fd(self, session: SessionInfo):
        try:
            os.close(session.fd)
        except OSError:
            pass

    def list_sessions(self, project_id: str = None) -> list[SessionInfo]:
        if project_id:
            return [s for s in self.sessions.values() if s.project_id == project_id]
        return list(self.sessions.values())

    def cleanup_all(self):
        for sid in list(self.sessions.keys()):
            self.remove_session(sid)

    def _check_alive(self, session: SessionInfo) -> bool:
        try:
            pid, status = os.waitpid(session.pid, os.WNOHANG)
            if pid != 0:
                session.status = "stopped"
                return False
            return True
        except ChildProcessError:
            session.status = "stopped"
            return False

    def _blocking_read(self, fd: int) -> bytes:
        try:
            return os.read(fd, 4096)
        except BlockingIOError:
            import time
            time.sleep(0.02)
            return b""
        except OSError:
            raise
