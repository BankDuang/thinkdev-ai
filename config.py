import os
import secrets as _secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

WORKSPACE_DIR = BASE_DIR / "workspace"
WORKSPACE_DIR.mkdir(exist_ok=True)

DATABASE_URL = f"sqlite+aiosqlite:///{BASE_DIR / 'thinkdev.db'}"

TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"

SERVER_HOST = os.getenv("THINKDEV_HOST", "0.0.0.0")
SERVER_PORT = int(os.getenv("THINKDEV_PORT", "8700"))

TERMINAL_BUFFER_SIZE = 100 * 1024  # 100KB per session
TERMINAL_SHELL = os.getenv("SHELL", "/bin/bash")
