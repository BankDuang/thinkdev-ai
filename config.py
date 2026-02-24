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
SERVER_PORT = int(os.getenv("THINKDEV_PORT", "19080"))

TERMINAL_BUFFER_SIZE = 100 * 1024  # 100KB per session
TERMINAL_SHELL = os.getenv("SHELL", "/bin/bash")

# ── Auth ──────────────────────────────────────────────────────────────────────
_ENV_PATH = BASE_DIR / ".env"


def _load_env_file():
    """Load key=value pairs from .env into os.environ (without overwriting existing vars)."""
    if not _ENV_PATH.exists():
        return
    with open(_ENV_PATH) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, val = line.partition("=")
                os.environ.setdefault(key.strip(), val.strip())


def _ensure_password():
    """Create .env with a random password if THINKDEV_PASSWORD is not set."""
    _load_env_file()
    if not os.getenv("THINKDEV_PASSWORD"):
        password = _secrets.token_urlsafe(16)
        with open(_ENV_PATH, "a") as f:
            f.write(f"THINKDEV_PASSWORD={password}\n")
        os.environ["THINKDEV_PASSWORD"] = password
        print("\n" + "=" * 60)
        print("  ThinkDev AI — First-time setup")
        print(f"  Password: {password}")
        print(f"  Saved to: {_ENV_PATH}")
        print("=" * 60 + "\n")


_ensure_password()

APP_PASSWORD = os.getenv("THINKDEV_PASSWORD", "")
SESSION_SECRET = _secrets.token_hex(32)  # regenerated each restart
