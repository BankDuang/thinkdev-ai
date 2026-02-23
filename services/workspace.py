"""Workspace directory resolver — maps project_id to workspace_dir name."""
import json
from pathlib import Path

from config import WORKSPACE_DIR

_MAPPING_FILE = WORKSPACE_DIR / ".workspace_map.json"


def _load_map() -> dict[str, str]:
    if _MAPPING_FILE.exists():
        try:
            return json.loads(_MAPPING_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return {}


def _save_map(mapping: dict[str, str]):
    _MAPPING_FILE.write_text(json.dumps(mapping, indent=2))


def register(project_id: str, workspace_dir: str):
    """Register a project_id → workspace_dir mapping."""
    mapping = _load_map()
    mapping[project_id] = workspace_dir
    _save_map(mapping)


def unregister(project_id: str):
    """Remove a project_id mapping."""
    mapping = _load_map()
    mapping.pop(project_id, None)
    _save_map(mapping)


def resolve(project_id: str) -> Path:
    """Resolve project_id to its workspace Path.
    Falls back to project_id as dir name for backward compatibility."""
    mapping = _load_map()
    dir_name = mapping.get(project_id, project_id)
    return (WORKSPACE_DIR / dir_name).resolve()
