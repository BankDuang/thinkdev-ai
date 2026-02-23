import asyncio
import shutil
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import WORKSPACE_DIR
from models import Project


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
    project = Project(name=name, description=description, git_repository_url=git_repository_url)
    db.add(project)
    await db.commit()
    await db.refresh(project)

    # Create workspace directory
    workspace_path = WORKSPACE_DIR / project.id
    workspace_path.mkdir(parents=True, exist_ok=True)

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
    if name is not None:
        project.name = name
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
    workspace_path = WORKSPACE_DIR / project_id
    if workspace_path.exists():
        shutil.rmtree(workspace_path, ignore_errors=True)

    await db.delete(project)
    await db.commit()
    return True


def get_workspace_path(project_id: str) -> Path:
    return WORKSPACE_DIR / project_id


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
