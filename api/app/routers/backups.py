"""Backup endpoints: run a dump now, list existing dumps, and restore one."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query

from ..config import Settings
from ..couch import CouchClient
from ..deps import get_couch, get_settings
from ..services.backups import list_backups, run_backup
from ..services.restore import BackupNotFound, RestoreError, restore_backup

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


@router.post(
    "/backups/{name}/restore",
    summary="Restore a backup (a safety snapshot is written first)",
    responses={
        400: {"description": "Invalid backup name or unreadable export"},
        404: {"description": "Backup not found"},
    },
)
async def restore_backup_endpoint(
    name: str,
    mode: Literal["merge", "replace"] = Query(
        "merge",
        description=(
            "'merge' only creates documents that do not exist (safe on a live "
            "database); 'replace' also overwrites existing ones from the backup."
        ),
    ),
    dry_run: bool = Query(False, description="Report what would change, write nothing"),
    couch: CouchClient = Depends(get_couch),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    try:
        return await restore_backup(couch, settings, name, mode=mode, dry_run=dry_run)
    except BackupNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RestoreError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc