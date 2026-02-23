import os
from pathlib import Path
from typing import Any

from config import WORKSPACE_DIR


class PathTraversalError(Exception):
    pass


def _safe_path(project_id: str, relative_path: str) -> Path:
    base = (WORKSPACE_DIR / project_id).resolve()
    target = (base / relative_path).resolve()
    if not str(target).startswith(str(base)):
        raise PathTraversalError(f"Path traversal denied: {relative_path}")
    return target


def _project_root(project_id: str) -> Path:
    root = (WORKSPACE_DIR / project_id).resolve()
    if not root.exists():
        root.mkdir(parents=True, exist_ok=True)
    return root


def list_tree(project_id: str, max_depth: int = 10) -> list[dict[str, Any]]:
    root = _project_root(project_id)

    def _walk(directory: Path, depth: int) -> list[dict[str, Any]]:
        if depth > max_depth:
            return []
        items = []
        try:
            entries = sorted(directory.iterdir(), key=lambda e: (not e.is_dir(), e.name.lower()))
        except PermissionError:
            return []
        for entry in entries:
            if entry.name.startswith("."):
                continue
            rel = str(entry.relative_to(root))
            node: dict[str, Any] = {
                "name": entry.name,
                "path": rel,
                "is_dir": entry.is_dir(),
            }
            if entry.is_dir():
                node["children"] = _walk(entry, depth + 1)
            items.append(node)
        return items

    return _walk(root, 0)


def read_file(project_id: str, relative_path: str) -> str:
    path = _safe_path(project_id, relative_path)
    if not path.exists() or not path.is_file():
        raise FileNotFoundError(f"File not found: {relative_path}")
    return path.read_text(encoding="utf-8", errors="replace")


def write_file(project_id: str, relative_path: str, content: str) -> None:
    path = _safe_path(project_id, relative_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def create_file(project_id: str, relative_path: str, is_directory: bool = False) -> None:
    path = _safe_path(project_id, relative_path)
    if path.exists():
        raise FileExistsError(f"Already exists: {relative_path}")
    if is_directory:
        path.mkdir(parents=True, exist_ok=True)
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.touch()


def rename_item(project_id: str, old_path: str, new_path: str) -> None:
    src = _safe_path(project_id, old_path)
    dst = _safe_path(project_id, new_path)
    if not src.exists():
        raise FileNotFoundError(f"Not found: {old_path}")
    if dst.exists():
        raise FileExistsError(f"Already exists: {new_path}")
    dst.parent.mkdir(parents=True, exist_ok=True)
    src.rename(dst)


def delete_item(project_id: str, relative_path: str) -> None:
    path = _safe_path(project_id, relative_path)
    if not path.exists():
        raise FileNotFoundError(f"Not found: {relative_path}")
    if path.is_dir():
        import shutil
        shutil.rmtree(path)
    else:
        path.unlink()
