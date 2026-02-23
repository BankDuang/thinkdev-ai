from fastapi import APIRouter, Request, Form
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from config import TEMPLATES_DIR
from services import file_service
from services.file_service import PathTraversalError

router = APIRouter(prefix="/files", tags=["files"])
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


@router.get("/{project_id}/tree", response_class=HTMLResponse)
async def file_tree(project_id: str, request: Request):
    try:
        tree = file_service.list_tree(project_id)
        return templates.TemplateResponse("partials/file_tree.html", {
            "request": request,
            "tree": tree,
            "project_id": project_id,
        })
    except Exception as e:
        return HTMLResponse(f'<div class="error">{e}</div>', status_code=500)


@router.get("/{project_id}/read", response_class=HTMLResponse)
async def read_file(project_id: str, path: str, request: Request):
    try:
        content = file_service.read_file(project_id, path)
        return templates.TemplateResponse("partials/editor.html", {
            "request": request,
            "project_id": project_id,
            "file_path": path,
            "content": content,
            "saved": True,
        })
    except PathTraversalError:
        return HTMLResponse('<div class="error">Access denied</div>', status_code=403)
    except FileNotFoundError:
        return HTMLResponse('<div class="error">File not found</div>', status_code=404)
    except Exception as e:
        return HTMLResponse(f'<div class="error">{e}</div>', status_code=500)


@router.post("/{project_id}/save", response_class=HTMLResponse)
async def save_file(
    project_id: str,
    request: Request,
    path: str = Form(...),
    content: str = Form(""),
):
    try:
        file_service.write_file(project_id, path, content)
        return templates.TemplateResponse("partials/editor_status.html", {
            "request": request,
            "saved": True,
            "message": "Saved",
        })
    except PathTraversalError:
        return templates.TemplateResponse("partials/editor_status.html", {
            "request": request,
            "saved": False,
            "message": "Access denied",
        })
    except Exception as e:
        return templates.TemplateResponse("partials/editor_status.html", {
            "request": request,
            "saved": False,
            "message": str(e),
        })


@router.post("/{project_id}/create", response_class=HTMLResponse)
async def create_item(
    project_id: str,
    request: Request,
    path: str = Form(...),
    is_directory: bool = Form(False),
):
    try:
        file_service.create_file(project_id, path, is_directory=is_directory)
        tree = file_service.list_tree(project_id)
        return templates.TemplateResponse("partials/file_tree.html", {
            "request": request,
            "tree": tree,
            "project_id": project_id,
            "toast": f"Created {'folder' if is_directory else 'file'}: {path}",
        })
    except (PathTraversalError, FileExistsError) as e:
        return HTMLResponse(f'<div class="error">{e}</div>', status_code=400)


@router.post("/{project_id}/rename", response_class=HTMLResponse)
async def rename_item(
    project_id: str,
    request: Request,
    old_path: str = Form(...),
    new_path: str = Form(...),
):
    try:
        file_service.rename_item(project_id, old_path, new_path)
        tree = file_service.list_tree(project_id)
        return templates.TemplateResponse("partials/file_tree.html", {
            "request": request,
            "tree": tree,
            "project_id": project_id,
            "toast": f"Renamed: {old_path} → {new_path}",
        })
    except (PathTraversalError, FileNotFoundError, FileExistsError) as e:
        return HTMLResponse(f'<div class="error">{e}</div>', status_code=400)


@router.delete("/{project_id}/delete", response_class=HTMLResponse)
async def delete_item(
    project_id: str,
    request: Request,
    path: str = "",
):
    try:
        file_service.delete_item(project_id, path)
        tree = file_service.list_tree(project_id)
        return templates.TemplateResponse("partials/file_tree.html", {
            "request": request,
            "tree": tree,
            "project_id": project_id,
            "toast": f"Deleted: {path}",
        })
    except (PathTraversalError, FileNotFoundError) as e:
        return HTMLResponse(f'<div class="error">{e}</div>', status_code=400)
