"""Health endpoint: liveness of the helper + CouchDB reachability."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from .. import __version__
from ..config import Settings
from ..couch import CouchClient
from ..deps import get_couch, get_settings
from ..util import utcnow_iso

router = APIRouter(tags=["health"])


@router.get("/health", summary="Service liveness + CouchDB reachability")
async def health(
    couch: CouchClient = Depends(get_couch),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """Always 200 while the app is up; reports CouchDB reachability inline.

    Devops can use this behind Caddy at `/api/health` for container health.
    """
    couch_status: dict[str, Any]
    try:
        info = await couch.ping()
        couch_status = {
            "reachable": True,
            "db": settings.couchdb_db,
            "present": await couch.database_exists(),
            "version": info.get("version"),
        }
    except Exception as exc:  # report, never crash the probe
        couch_status = {
            "reachable": False,
            "db": settings.couchdb_db,
            "present": False,
            "error": str(exc),
        }

    return {
        "status": "ok",
        "service": "itinera-api",
        "version": __version__,
        "time": utcnow_iso(),
        "couch": couch_status,
    }
    