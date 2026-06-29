"""Backup endpoints: trigger a dump now, and list existing dumps."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from ..config import Settings
from ..couch import CouchClient
from ..deps import get_couch, get_settings
from ..services.backups import list_backups, run_backup

router = APIRouter(tags=["backups"])


@router.post("/backups/run", summary="Run a backup now (JSON + attachments dump)")
async def run_backup_now(
    couch: CouchClient = Depends(get_couch),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    return await run_backup(couch, settings)


@router.get("/backups", summary="List existing backup dumps")
async def list_backups_endpoint(
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    return {"dir": settings.export_dir, "backups": list_backups(settings)}