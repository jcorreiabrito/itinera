"""Domain errors raised by services and translated to HTTP responses by routers."""

from __future__ import annotations


class ItineraError(Exception):
    """Base class for service-level errors."""


class TripNotFound(ItineraError):
    """Requested trip has no `trip` document in CouchDB."""

    def __init__(self, trip_id: str) -> None:
        self.trip_id = trip_id
        super().__init__(f"No trip document found for trip id {trip_id!r}")


class PdfUnavailable(ItineraError):
    """WeasyPrint (and its native libs) are not importable in this environment."""

    def __init__(self, detail: str) -> None:
        self.detail = detail
        super().__init__(detail)