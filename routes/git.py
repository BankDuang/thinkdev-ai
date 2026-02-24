from fastapi import APIRouter, Request, Form
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from config import TEMPLATES_DIR
from services import git_service

router = APIRouter(prefix="/git", tags=["git"])
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


@router.get("/{project_id}/status", response_class=HTMLResponse)
async def git_status(project_id: str, request: Request):
    try:
        st = await git_service.status(project_id)
        return templates.TemplateResponse("partials/git_panel.html", {
            "request": request,
            "project_id": project_id,
            "status": st,
        })
    except Exception as e:
        return HTMLResponse(f'<div class="git-error">{e}</div>', status_code=500)


@router.post("/{project_id}/init", response_class=HTMLResponse)
async def git_init(project_id: str, request: Request):
    ok, msg = await git_service.init(project_id)
    st = await git_service.status(project_id)
    return templates.TemplateResponse("partials/git_panel.html", {
        "request": request,
        "project_id": project_id,
        "status": st,
        "toast": msg if ok else None,
        "error": msg if not ok else None,
    })


@router.post("/{project_id}/clone", response_class=HTMLResponse)
async def git_clone(
    project_id: str,
    request: Request,
    url: str = Form(...),
):
    ok, msg = await git_service.clone(url, project_id)
    st = await git_service.status(project_id)
    return templates.TemplateResponse("partials/git_panel.html", {
        "request": request,
        "project_id": project_id,
        "status": st,
        "toast": msg if ok else None,
        "error": msg if not ok else None,
    })


@router.get("/{project_id}/branches", response_class=HTMLResponse)
async def git_branches(project_id: str, request: Request):
    try:
        branches, current = await git_service.branch_list(project_id)
        return templates.TemplateResponse("partials/git_branches.html", {
            "request": request,
            "project_id": project_id,
            "branches": branches,
            "current": current,
        })
    except Exception as e:
        return HTMLResponse(f'<div class="git-error">{e}</div>', status_code=500)


@router.post("/{project_id}/branch/create", response_class=HTMLResponse)
async def git_branch_create(
    project_id: str,
    request: Request,
    name: str = Form(...),
):
    ok, msg = await git_service.branch_create(project_id, name)
    st = await git_service.status(project_id)
    return templates.TemplateResponse("partials/git_panel.html", {
        "request": request,
        "project_id": project_id,
        "status": st,
        "toast": msg if ok else None,
        "error": msg if not ok else None,
    })


@router.post("/{project_id}/branch/switch", response_class=HTMLResponse)
async def git_branch_switch(
    project_id: str,
    request: Request,
    name: str = Form(...),
):
    ok, msg = await git_service.branch_switch(project_id, name)
    st = await git_service.status(project_id)
    return templates.TemplateResponse("partials/git_panel.html", {
        "request": request,
        "project_id": project_id,
        "status": st,
        "toast": msg if ok else None,
        "error": msg if not ok else None,
    })


@router.post("/{project_id}/commit", response_class=HTMLResponse)
async def git_commit(
    project_id: str,
    request: Request,
    message: str = Form(...),
):
    ok, msg = await git_service.commit(project_id, message)
    st = await git_service.status(project_id)
    return templates.TemplateResponse("partials/git_panel.html", {
        "request": request,
        "project_id": project_id,
        "status": st,
        "toast": msg if ok else None,
        "error": msg if not ok else None,
    })


@router.post("/{project_id}/pull", response_class=HTMLResponse)
async def git_pull(project_id: str, request: Request):
    ok, msg = await git_service.pull(project_id)
    st = await git_service.status(project_id)
    return templates.TemplateResponse("partials/git_panel.html", {
        "request": request,
        "project_id": project_id,
        "status": st,
        "toast": msg if ok else None,
        "error": msg if not ok else None,
    })


@router.post("/{project_id}/push", response_class=HTMLResponse)
async def git_push(project_id: str, request: Request):
    ok, msg = await git_service.push(project_id)
    st = await git_service.status(project_id)
    return templates.TemplateResponse("partials/git_panel.html", {
        "request": request,
        "project_id": project_id,
        "status": st,
        "toast": msg if ok else None,
        "error": msg if not ok else None,
    })


@router.post("/{project_id}/fetch", response_class=HTMLResponse)
async def git_fetch(project_id: str, request: Request):
    ok, msg = await git_service.fetch(project_id)
    st = await git_service.status(project_id)
    return templates.TemplateResponse("partials/git_panel.html", {
        "request": request,
        "project_id": project_id,
        "status": st,
        "toast": msg if ok else None,
        "error": msg if not ok else None,
    })


@router.get("/{project_id}/log", response_class=HTMLResponse)
async def git_log(project_id: str, request: Request):
    try:
        entries = await git_service.log(project_id)
        return templates.TemplateResponse("partials/git_history.html", {
            "request": request,
            "project_id": project_id,
            "entries": entries,
        })
    except Exception as e:
        return HTMLResponse(f'<div class="git-error">{e}</div>', status_code=500)
