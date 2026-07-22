"""JSON import endpoints: upload and import a trip JSON payload."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, status

from ..couch import CouchClient
from ..deps import get_couch
from ..services.imports import prepare_trip_import

router = APIRouter(tags=["imports"])


@router.post(
    "/trips/import.json",
    status_code=status.HTTP_201_CREATED,
    summary="Import trip from JSON export",
)
async def import_trip(
    payload: dict[str, Any] = Body(...),
    couch: CouchClient = Depends(get_couch),
) -> dict[str, Any]:
    try:
        new_trip_id, docs_to_insert = prepare_trip_import(payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    try:
        results = await couch.bulk_save(docs_to_insert)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save imported trip: {exc}",
        ) from exc

    return {
        "tripId": new_trip_id,
        "docCount": len(docs_to_insert),
        "results": results,
    }
