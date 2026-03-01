import os
from datetime import datetime, timezone
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from apscheduler.schedulers.background import BackgroundScheduler


class NoCacheStaticMiddleware(BaseHTTPMiddleware):
    """Prevent browsers from caching CSS / JS forever."""
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        path = request.url.path
        if path.startswith("/static/") or path.startswith("/js/"):
            response.headers["Cache-Control"] = "no-cache, must-revalidate"
        return response

import models
from database import engine, SessionLocal
from routers import auth, dumps, photos, faces

# ── Create tables ────────────────────────────────────────────────────────────
models.Base.metadata.create_all(bind=engine)

FRONTEND_DIR = os.getenv("FRONTEND_DIR", "/app/frontend")


# ── Cleanup expired dumps ────────────────────────────────────────────────────
def cleanup_expired_dumps():
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        expired = db.query(models.Dump).filter(
            models.Dump.expires_at != None,
            models.Dump.expires_at <= now,
            models.Dump.is_deleted == False,
        ).all()
        for dump in expired:
            dump.is_deleted = True
        db.commit()
    finally:
        db.close()


# ── App lifespan ─────────────────────────────────────────────────────────────
scheduler = BackgroundScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.add_job(cleanup_expired_dumps, "interval", hours=1, id="cleanup")
    scheduler.start()
    yield
    scheduler.shutdown()


app = FastAPI(title="PhotoDump API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(NoCacheStaticMiddleware)

# ── API Routers ───────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(dumps.router)
app.include_router(photos.router)
app.include_router(faces.router)

# ── Serve frontend ────────────────────────────────────────────────────────────
if os.path.isdir(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=os.path.join(FRONTEND_DIR, "css"), html=False), name="css")
    app.mount("/js", StaticFiles(directory=os.path.join(FRONTEND_DIR, "js"), html=False), name="js")
    app.mount("/photos", StaticFiles(directory=os.path.join(FRONTEND_DIR, "photos"), html=False), name="photos")

    @app.get("/", include_in_schema=False)
    def serve_index():
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

    for page in ["dashboard", "create-dump", "manage-dump", "access-dump", "view-dump", "login", "register", "find-photos"]:
        html_file = os.path.join(FRONTEND_DIR, f"{page}.html")

        def make_route(path=html_file):
            def _route():
                return FileResponse(path)
            return _route

        app.add_api_route(f"/{page}", make_route(), include_in_schema=False)
        app.add_api_route(f"/{page}.html", make_route(), include_in_schema=False)
