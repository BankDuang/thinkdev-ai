import uvicorn
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.sessions import SessionMiddleware
from starlette.requests import Request

from config import STATIC_DIR, SERVER_HOST, SERVER_PORT, SESSION_SECRET
from database import init_db
from routes.auth import router as auth_router
from routes.pages import router as pages_router
from routes.projects import router as projects_router
from routes.files import router as files_router
from routes.git import router as git_router
from routes.terminal import router as terminal_router, ws_router as terminal_ws_router
from services.terminal_manager import TerminalSessionManager

_PUBLIC_PATHS = {"/login", "/logout"}


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Allow static files and auth pages
        if path.startswith("/static/") or path in _PUBLIC_PATHS:
            return await call_next(request)

        if not request.session.get("authenticated"):
            # htmx partial requests: tell htmx to redirect the full page
            if request.headers.get("HX-Request"):
                return Response(status_code=401, headers={"HX-Redirect": "/login"})
            return RedirectResponse(url="/login", status_code=302)

        return await call_next(request)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield
    TerminalSessionManager.get_instance().cleanup_all()


app = FastAPI(title="ThinkDev AI", lifespan=lifespan)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# Middleware order: SessionMiddleware runs first (outer), AuthMiddleware second (inner)
app.add_middleware(AuthMiddleware)
app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET, session_cookie="thinkdev_session")

app.include_router(auth_router)
app.include_router(pages_router)
app.include_router(projects_router)
app.include_router(files_router)
app.include_router(git_router)
app.include_router(terminal_router)
app.include_router(terminal_ws_router)


if __name__ == "__main__":
    uvicorn.run("main:app", host=SERVER_HOST, port=SERVER_PORT, reload=False)
