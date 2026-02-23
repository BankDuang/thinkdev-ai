import asyncio
from pathlib import Path
from dataclasses import dataclass

from services import workspace


@dataclass
class GitStatus:
    is_repo: bool = False
    branch: str = ""
    files: list = None
    error: str = ""

    def __post_init__(self):
        if self.files is None:
            self.files = []


@dataclass
class GitLogEntry:
    hash: str = ""
    short_hash: str = ""
    author: str = ""
    date: str = ""
    message: str = ""


def _project_path(project_id: str) -> Path:
    return workspace.resolve(project_id)


async def _run_git(project_path: Path, *args: str) -> tuple[int, str, str]:
    try:
        proc = await asyncio.create_subprocess_exec(
            "git", *args,
            cwd=str(project_path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        return proc.returncode, stdout.decode("utf-8", errors="replace"), stderr.decode("utf-8", errors="replace")
    except Exception as e:
        return 1, "", str(e)


async def is_git_repo(project_id: str) -> bool:
    path = _project_path(project_id)
    code, _, _ = await _run_git(path, "rev-parse", "--is-inside-work-tree")
    return code == 0


async def init(project_id: str) -> tuple[bool, str]:
    path = _project_path(project_id)
    code, out, err = await _run_git(path, "init")
    if code == 0:
        return True, out.strip()
    return False, err.strip()


async def clone(url: str, project_id: str) -> tuple[bool, str]:
    path = _project_path(project_id)
    try:
        proc = await asyncio.create_subprocess_exec(
            "git", "clone", url, ".",
            cwd=str(path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        if proc.returncode == 0:
            return True, "Cloned successfully"
        return False, stderr.decode("utf-8", errors="replace").strip()
    except Exception as e:
        return False, str(e)


async def status(project_id: str) -> GitStatus:
    path = _project_path(project_id)

    if not await is_git_repo(project_id):
        return GitStatus(is_repo=False)

    # Get branch
    code, branch_out, _ = await _run_git(path, "branch", "--show-current")
    branch = branch_out.strip() if code == 0 else "HEAD"

    # Get status
    code, status_out, err = await _run_git(path, "status", "--porcelain")
    if code != 0:
        return GitStatus(is_repo=True, branch=branch, error=err)

    files = []
    for line in status_out.strip().split("\n"):
        line = line.strip()
        if not line:
            continue
        status_code = line[:2].strip()
        file_path = line[3:]
        files.append({"status": status_code, "path": file_path})

    return GitStatus(is_repo=True, branch=branch, files=files)


async def branch_list(project_id: str) -> tuple[list[str], str]:
    path = _project_path(project_id)
    code, out, err = await _run_git(path, "branch", "--list", "--no-color")
    if code != 0:
        return [], err.strip()

    branches = []
    current = ""
    for line in out.strip().split("\n"):
        line = line.strip()
        if not line:
            continue
        if line.startswith("* "):
            name = line[2:].strip()
            current = name
            branches.append(name)
        else:
            branches.append(line)

    return branches, current


async def branch_create(project_id: str, name: str) -> tuple[bool, str]:
    path = _project_path(project_id)
    code, out, err = await _run_git(path, "branch", name)
    if code == 0:
        return True, f"Branch '{name}' created"
    return False, err.strip()


async def branch_switch(project_id: str, name: str) -> tuple[bool, str]:
    path = _project_path(project_id)
    code, out, err = await _run_git(path, "checkout", name)
    if code == 0:
        return True, f"Switched to '{name}'"
    return False, err.strip()


async def commit(project_id: str, message: str) -> tuple[bool, str]:
    path = _project_path(project_id)
    # Stage all changes
    code, _, err = await _run_git(path, "add", "-A")
    if code != 0:
        return False, f"Stage failed: {err.strip()}"

    code, out, err = await _run_git(path, "commit", "-m", message)
    if code == 0:
        return True, out.strip()
    return False, err.strip()


async def pull(project_id: str) -> tuple[bool, str]:
    path = _project_path(project_id)
    code, out, err = await _run_git(path, "pull")
    if code == 0:
        return True, out.strip()
    return False, err.strip()


async def fetch(project_id: str) -> tuple[bool, str]:
    path = _project_path(project_id)
    code, out, err = await _run_git(path, "fetch", "--all")
    if code == 0:
        return True, out.strip() or "Fetched"
    return False, err.strip()


async def log(project_id: str, limit: int = 20) -> list[GitLogEntry]:
    path = _project_path(project_id)
    code, out, _ = await _run_git(
        path, "log",
        f"--max-count={limit}",
        "--format=%H|%h|%an|%ar|%s",
    )
    if code != 0:
        return []

    entries = []
    for line in out.strip().split("\n"):
        line = line.strip()
        if not line:
            continue
        parts = line.split("|", 4)
        if len(parts) == 5:
            entries.append(GitLogEntry(
                hash=parts[0],
                short_hash=parts[1],
                author=parts[2],
                date=parts[3],
                message=parts[4],
            ))
    return entries
