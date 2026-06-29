"""Printable per-trip PDF endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from ..couch import CouchClient
from ..deps import get_couch
from ..errors import PdfUnavailable, TripNotFound
from ..services.pdf import build_trip_pdf

router = APIRouter(tags=["pdf"])


@router.get(
    "/trips/{trip_id}/print.pdf",
    summary="Printable trip PDF (itinerary + flights + reservations + checklist + costs)",
    responses={
        200: {"content": {"application/pdf": {}}},
        404: {"description": "Trip not found"},
        503: {"description": "PDF rendering unavailable"},
    },
)
async def print_trip(
    trip_id: str,
    couch: CouchClient = Depends(get_couch),
) -> Response:
    try:
        pdf_bytes, filename = await build_trip_pdf(couch, trip_id)
    except TripNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PdfUnavailable as exc:
        raise HTTPException(status_code=503, detail=exc.detail) from exc

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
    