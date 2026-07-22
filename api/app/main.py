"""FastAPI application factory and ASGI entrypoint.

Run with:

    uvicorn app.main:app --host 0.0.0.0 --port 8000

The app:
  * provisions the CouchDB database + Mango indexes on startup (with retry),
  * starts a background scheduler for periodic backups + compaction,
  * mounts all routers under `/api` (same-origin via Caddy; CORS off by default).
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .config import Settings, get_settings
from .couch import CouchClient
from .routers import backups, exports, health, imports, pdf
from .scheduler import build_scheduler

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("itinera.main")


async def _ensure_couch_ready(couch: CouchClient, settings: Settings) -> bool:
    """Ensure the database + indexes exist, retrying while CouchDB warms up."""
    last_error: Exception | None = None
    for attempt in range(1, settings.couch_ready_retries + 1):
        try:
            await couch.ensure_database()
            results = await couch.ensure_indexes()
            logger.info("CouchDB ready; indexes: %s", results)
            return True
        except Exception as exc:  # retry transient startup failures
            last_error = exc
            logger.warning(
                "CouchDB not ready (attempt %d/%d): %s",
                attempt,
                settings.couch_ready_retries,
                exc,
            )
            await asyncio.sleep(settings.couch_ready_backoff_seconds)
    logger.error("Continuing without confirmed CouchDB provisioning: %s", last_error)
    return False


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings: Settings = app.state.settings
    owns_couch = app.state.couch is None
    if owns_couch:
        app.state.couch = CouchClient(settings)

    await _ensure_couch_ready(app.state.couch, settings)

    scheduler = None
    if settings.scheduler_enabled:
        scheduler = build_scheduler(app)
        scheduler.start()
        app.state.scheduler = scheduler
        logger.info("Background scheduler started")

    try:
        yield
    finally:
        if scheduler is not None:
            scheduler.shutdown(wait=False)
        if owns_couch:
            await app.state.couch.aclose()


def create_app(settings: Settings | None = None, couch: CouchClient | None = None) -> FastAPI:
    """Build the FastAPI app.

    ``couch`` may be injected (e.g. a mock-backed client in tests); when omitted
    a real client is created during startup and closed on shutdown.
    """
    settings = settings or get_settings()

    docs_enabled = settings.docs_enabled
    app = FastAPI(
        title="Itinera API",
        version=__version__,
        summary="Helper service: exports, printable PDFs, backups, CouchDB housekeeping.",
        lifespan=lifespan,
        docs_url="/api/docs" if docs_enabled else None,
        redoc_url="/api/redoc" if docs_enabled else None,
        openapi_url="/api/openapi.json" if docs_enabled else None,
    )
    app.state.settings = settings
    app.state.couch = couch
    app.state.scheduler = None

    origins = settings.cors_origin_list
    if origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_methods=["*"],
            allow_headers=["*"],
            allow_credentials=False,
        )

    for module in (health, exports, pdf, backups, imports):
        app.include_router(module.router, prefix="/api")

    return app


#: ASGI application for ``uvicorn app.main:app`` (listens on 0.0.0.0:8000).
app = create_app()
