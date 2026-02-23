from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str = ""
    git_repository_url: str = ""


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    git_repository_url: Optional[str] = None


class ProjectOut(BaseModel):
    id: str
    name: str
    description: str
    git_repository_url: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TerminalSessionCreate(BaseModel):
    project_id: str
    name: str = "bash"


class TerminalSessionOut(BaseModel):
    id: str
    project_id: str
    name: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class FileCreate(BaseModel):
    path: str
    is_directory: bool = False


class FileRename(BaseModel):
    old_path: str
    new_path: str


class FileSave(BaseModel):
    path: str
    content: str


class GitCommit(BaseModel):
    message: str = Field(..., min_length=1)


class GitBranch(BaseModel):
    name: str = Field(..., min_length=1)
