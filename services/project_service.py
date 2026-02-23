import asyncio
import re
import shutil
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import WORKSPACE_DIR
from models import Project
from services import workspace


def _safe_dirname(name: str) -> str:
    """Sanitize project name for use as a directory name. Keeps original casing and spaces."""
    safe = name.strip()
    safe = re.sub(r'[/\\:*?"<>|]', '', safe)  # Remove dangerous chars
    safe = re.sub(r'\.\.+', '.', safe)  # Prevent path traversal
    safe = safe.strip('. ')
    return safe or 'project'


def _unique_workspace_dir(name: str) -> Path:
    """Get a unique workspace directory path based on project name."""
    dirname = _safe_dirname(name)
    path = WORKSPACE_DIR / dirname
    if not path.exists():
        return path
    i = 2
    while (WORKSPACE_DIR / f"{dirname} ({i})").exists():
        i += 1
    return WORKSPACE_DIR / f"{dirname} ({i})"


async def list_projects(db: AsyncSession) -> list[Project]:
    result = await db.execute(select(Project).order_by(Project.updated_at.desc()))
    return list(result.scalars().all())


async def get_project(db: AsyncSession, project_id: str) -> Project | None:
    return await db.get(Project, project_id)


async def create_project(
    db: AsyncSession,
    name: str,
    description: str = "",
    git_repository_url: str = "",
) -> Project:
    # Determine workspace directory name from project name
    workspace_path = _unique_workspace_dir(name)
    workspace_name = workspace_path.name

    project = Project(name=name, description=description, git_repository_url=git_repository_url, workspace_dir=workspace_name)
    db.add(project)
    await db.commit()
    await db.refresh(project)

    # Create workspace directory
    workspace_path.mkdir(parents=True, exist_ok=True)

    # Register mapping
    workspace.register(project.id, workspace_name)

    # Clone git repo if provided
    if git_repository_url.strip():
        await _git_clone(git_repository_url.strip(), workspace_path)

    return project


async def update_project(
    db: AsyncSession,
    project_id: str,
    name: str | None = None,
    description: str | None = None,
    git_repository_url: str | None = None,
) -> Project | None:
    project = await db.get(Project, project_id)
    if not project:
        return None

    # Rename workspace dir if name changed
    if name is not None and name != project.name:
        old_path = WORKSPACE_DIR / project.workspace_dir
        new_path = _unique_workspace_dir(name)
        if old_path.exists():
            old_path.rename(new_path)
        project.workspace_dir = new_path.name
        project.name = name
        workspace.register(project.id, new_path.name)

    if description is not None:
        project.description = description
    if git_repository_url is not None:
        project.git_repository_url = git_repository_url
    await db.commit()
    await db.refresh(project)
    return project


async def delete_project(db: AsyncSession, project_id: str) -> bool:
    project = await db.get(Project, project_id)
    if not project:
        return False

    # Remove workspace directory
    workspace_path = WORKSPACE_DIR / project.workspace_dir
    if workspace_path.exists():
        shutil.rmtree(workspace_path, ignore_errors=True)

    workspace.unregister(project_id)
    await db.delete(project)
    await db.commit()
    return True


def get_workspace_path(project_id: str) -> Path:
    return WORKSPACE_DIR / project_id


def get_workspace_path_by_dir(workspace_dir: str) -> Path:
    return WORKSPACE_DIR / workspace_dir


async def _git_clone(url: str, dest: Path):
    try:
        proc = await asyncio.create_subprocess_exec(
            "git", "clone", url, str(dest),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await proc.communicate()
    except Exception:
        pass
