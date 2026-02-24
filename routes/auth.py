from fastapi import APIRouter, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from config import APP_PASSWORD, TEMPLATES_DIR

router = APIRouter(tags=["auth"])
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


@router.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    if request.session.get("authenticated"):
        return RedirectResponse(url="/", status_code=302)
    return templates.TemplateResponse("login.html", {"request": request, "error": None})


@router.post("/login", response_class=HTMLResponse)
async def login(request: Request, password: str = Form(...)):
    if password == APP_PASSWORD:
        request.session["authenticated"] = True
        return RedirectResponse(url="/", status_code=302)
    return templates.TemplateResponse(
        "login.html",
        {"request": request, "error": "Incorrect password. Please try again."},
        status_code=401,
    )


@router.get("/logout")
async def logout(request: Request):
    request.session.clear()
    return RedirectResponse(url="/login", status_code=302)
