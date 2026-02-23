from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.ext.asyncio import AsyncSession

from config import TEMPLATES_DIR
from database import get_db
from services import project_service

router = APIRouter(tags=["pages"])
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


@router.get("/", response_class=HTMLResponse)
async def index(request: Request, db: AsyncSession = Depends(get_db)):
    projects = await project_service.list_projects(db)
    return templates.TemplateResponse("index.html", {
        "request": request,
        "projects": projects,
        "active_project": None,
    })
