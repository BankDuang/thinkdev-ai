import httpx
from fastapi import APIRouter, Depends, Request, Form
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.ext.asyncio import AsyncSession

from config import TEMPLATES_DIR
from database import get_db
from services import project_service

router = APIRouter(prefix="/projects", tags=["projects"])
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


@router.get("/list", response_class=HTMLResponse)
async def project_list(request: Request, db: AsyncSession = Depends(get_db)):
    projects = await project_service.list_projects(db)
    return templates.TemplateResponse("partials/project_list.html", {
        "request": request,
        "projects": projects,
    })


@router.get("/create-form", response_class=HTMLResponse)
async def create_form(request: Request):
    return templates.TemplateResponse("partials/project_form.html", {
        "request": request,
        "mode": "create",
        "project": None,
    })


@router.post("/create", response_class=HTMLResponse)
async def create_project(
    request: Request,
    name: str = Form(...),
    description: str = Form(""),
    git_repository_url: str = Form(""),
    db: AsyncSession = Depends(get_db),
):
    try:
        project = await project_service.create_project(
            db, name=name, description=description, git_repository_url=git_repository_url
        )
        projects = await project_service.list_projects(db)
        return templates.TemplateResponse("partials/project_list.html", {
            "request": request,
            "projects": projects,
            "toast": f"Project '{project.name}' created",
        })
    except Exception as e:
        return templates.TemplateResponse("partials/project_form.html", {
            "request": request,
            "mode": "create",
            "project": None,
            "error": str(e),
        })


@router.get("/{project_id}/edit-form", response_class=HTMLResponse)
async def edit_form(
    project_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    project = await project_service.get_project(db, project_id)
    if not project:
        return HTMLResponse("<div class='error'>Project not found</div>", status_code=404)
    return templates.TemplateResponse("partials/project_form.html", {
        "request": request,
        "mode": "edit",
        "project": project,
    })


@router.put("/{project_id}/update", response_class=HTMLResponse)
async def update_project(
    project_id: str,
    request: Request,
    name: str = Form(...),
    description: str = Form(""),
    git_repository_url: str = Form(""),
    db: AsyncSession = Depends(get_db),
):
    project = await project_service.update_project(
        db, project_id, name=name, description=description, git_repository_url=git_repository_url
    )
    if not project:
        return HTMLResponse("<div class='error'>Project not found</div>", status_code=404)
    projects = await project_service.list_projects(db)
    return templates.TemplateResponse("partials/project_list.html", {
        "request": request,
        "projects": projects,
        "toast": f"Project '{project.name}' updated",
    })


@router.delete("/{project_id}/delete", response_class=HTMLResponse)
async def delete_project(
    project_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    project = await project_service.get_project(db, project_id)
    project_name = project.name if project else "Unknown"
    deleted = await project_service.delete_project(db, project_id)
    if not deleted:
        return HTMLResponse("<div class='error'>Project not found</div>", status_code=404)
    projects = await project_service.list_projects(db)
    return templates.TemplateResponse("partials/project_list.html", {
        "request": request,
        "projects": projects,
        "toast": f"Project '{project_name}' deleted",
    })


@router.get("/{project_id}/activate", response_class=HTMLResponse)
async def activate_project(
    project_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    project = await project_service.get_project(db, project_id)
    if not project:
        return HTMLResponse("<div class='error'>Project not found</div>", status_code=404)

    return templates.TemplateResponse("partials/project_activated.html", {
        "request": request,
        "project": project,
    })


@router.get("/github/repos", response_class=JSONResponse)
async def github_repos(username: str):
    """Fetch public repos for a GitHub username."""
    if not username.strip():
        return JSONResponse({"repos": [], "error": "Username required"})
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"https://api.github.com/users/{username.strip()}/repos",
                params={"per_page": 100, "sort": "updated", "direction": "desc"},
                headers={"Accept": "application/vnd.github.v3+json"},
            )
            if resp.status_code == 404:
                return JSONResponse({"repos": [], "error": "User not found"})
            resp.raise_for_status()
            repos = [
                {
                    "name": r["name"],
                    "full_name": r["full_name"],
                    "clone_url": r["clone_url"],
                    "description": r["description"] or "",
                    "language": r["language"] or "",
                    "updated_at": r["updated_at"],
                    "private": r["private"],
                }
                for r in resp.json()
                if not r["private"]
            ]
            return JSONResponse({"repos": repos})
    except httpx.HTTPStatusError as e:
        return JSONResponse({"repos": [], "error": f"GitHub API error: {e.response.status_code}"})
    except Exception as e:
        return JSONResponse({"repos": [], "error": str(e)})
