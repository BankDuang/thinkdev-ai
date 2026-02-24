import uvicorn
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from config import STATIC_DIR, SERVER_HOST, SERVER_PORT
from database import init_db
from routes.pages import router as pages_router
from routes.projects import router as projects_router
from routes.files import router as files_router
from routes.git import router as git_router
from routes.terminal import router as terminal_router, ws_router as terminal_ws_router
from services.terminal_manager import TerminalSessionManager


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield
    TerminalSessionManager.get_instance().cleanup_all()


app = FastAPI(title="ThinkDev AI", lifespan=lifespan)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

app.include_router(pages_router)
app.include_router(projects_router)
app.include_router(files_router)
app.include_router(git_router)
app.include_router(terminal_router)
app.include_router(terminal_ws_router)


if __name__ == "__main__":
    uvicorn.run("main:app", host=SERVER_HOST, port=SERVER_PORT, reload=False)
