"""JSON export endpoints: per-trip and whole-database."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from ..config import Settings
from ..couch import CouchClient
from ..deps import get_couch, get_settings
from ..services.exports import shape_full_export, shape_trip_export
from ..util import safe_filename

router = APIRouter(tags=["exports"])


@router.get("/trips/{trip_id}/export.json", summary="Full trip JSON + attachment manifest")
async def export_trip(
    trip_id: str,
    couch: CouchClient = Depends(get_couch),
    settings: Settings = Depends(get_settings),
) -> JSONResponse:
    docs = await couch.get_trip_docs(trip_id)
    if not any(d.get("type") == "trip" for d in docs):
        raise HTTPException(status_code=404, detail=f"Trip {trip_id!r} not found")
    payload: dict[str, Any] = shape_trip_export(trip_id, docs, settings.couchdb_db)
    # Sanitize before the id lands in the quoted Content-Disposition header:
    # keep the human-readable `":-` form, but strip quotes / CR-LF / other
    # unsafe characters so a stray byte cannot break the header.
    safe_id = safe_filename(trip_id.replace(":", "-"))
    filename = f"itinera-{safe_id}.json"
    return JSONResponse(
        content=payload,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/all.json", summary="Whole-database JSON export")
async def export_all(
    couch: CouchClient = Depends(get_couch),
    settings: Settings = Depends(get_settings),
) -> JSONResponse:
    docs = await couch.get_all_docs()
    payload: dict[str, Any] = shape_full_export(docs, settings.couchdb_db)
    return JSONResponse(
        content=payload,
        headers={"Content-Disposition": 'attachment; filename="itinera-export.json"'},
    )