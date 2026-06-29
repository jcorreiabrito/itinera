"""FastAPI dependency providers that pull shared state off `app.state`."""

from __future__ import annotations

from fastapi import Request

from .config import Settings
from .couch import CouchClient


def get_settings(request: Request) -> Settings:
    """Return the process-wide `class: Settings` placed on the app state."""
    return request.app.state.settings


def get_couch(request: Request) -> CouchClient:
    """Return the shared `class: CouchClient` created during app startup."""
    couch = request.app.state.couch
    if couch is None:  # pragma: no cover - only if startup failed
        raise RuntimeError("CouchDB client is not initialised")
    return couch