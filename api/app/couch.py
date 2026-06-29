"""Async CouchDB access via httpx.

A thin, typed wrapper around the few CouchDB endpoints this helper needs. It is
the only module that talks HTTP to CouchDB. Authentication uses the single admin
credential from `class: ~app.config.Settings` (never exposed to clients).
"""

from __future__ import annotations

import json
import logging
from typing import Any
from urllib.parse import quote

import httpx

from .config import Settings

logger = logging.getLogger("itinera.couch")

# Sentinel high code point used to bound CouchDB prefix range scans.
_HIGH = "\ufff0"

# Prefixes for trip-scoped documents (see "IDs are meaningful and prefix-sortable"
# in 04-data-model.md). The trip document itself is fetched by id separately.
_TRIP_CHILD_PREFIXES: tuple[str, ...] = ("day", "itm", "chk", "flt", "res", "exp", "att")

#: Mango indexes created on startup. These align with the "Queries the app needs"
#: table in 04-data-model.md. The data-sync layer should rely on these names.
INDEX_SPECS: tuple[dict[str, Any], ...] = (
    # All trips for Home; any "by type" listing.
    {"index": {"fields": ["type"], "name": "idx-type", "ddoc": "idx-type", "type": "json"},
    # Everything for one trip / trip-scoped Mango queries.
    {
        "index": {"fields": ["type", "tripId"]},
        "name": "idx-type-tripId",
        "ddoc": "idx-type-tripId",
        "type": "json",
    },
    # Home: trips sorted by start date.
    {
        "index": {"fields": ["type", "startDate"]},
        "name": "idx-type-startDate",
        "ddoc": "idx-type-startDate",
        "type": "json",
    },
    # Itinerary items / expenses / dated checklist items by day.
    {
        "index": {"fields": ["type", "date"]},
        "name": "idx-type-date",
        "ddoc": "idx-type-date",
        "type": "json",
    },
    # Budget category breakdowns; itinerary by category.
    {
        "index": {"fields": ["type", "category"]},
        "name": "idx-type-category",
        "ddoc": "idx-type-category",
        "type": "json",
    },
    # Trash / undo: items with a non-null deletedAt.
    {
        "index": {"fields": ["type", "deletedAt"]},
        "name": "idx-type-deletedAt",
        "ddoc": "idx-type-deletedAt",
        "type": "json",
    },
)


def normalise_trip_id(trip_id: str) -> str:
    """Return the bare ULID part of a trip id (accepts `trip:xxx` or `xxx`)."""
    return trip_id[len("trip:"):] if trip_id.startswith("trip:") else trip_id


class CouchClient:
    """Async CouchDB client scoped to a single database.

    Pass a pre-built `class: httpx.AsyncClient` (with a mock transport) in tests;
    otherwise one is created from settings with admin auth and a sane timeout.
    """

    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None) -> None:
        self.settings = settings
        self._db = settings.couchdb_db
        if client is None:
            client = httpx.AsyncClient(
                base_url=settings.couchdb_url.rstrip("/"),
                auth=(settings.couchdb_user, settings.couchdb_password),
                timeout=settings.http_timeout_seconds,
            )
        self._client = client

    @property
    def db(self) -> str:
        return self._db

    async def aclose(self) -> None:
        await self._client.aclose()

    # --- Health / provisioning ---

    async def ping(self) -> dict[str, Any]:
        """Return the CouchDB welcome payload (raises on connection failure)."""
        resp = await self._client.get("/")
        resp.raise_for_status()
        return resp.json()

    async def database_exists(self) -> bool:
        resp = await self._client.head(f"/{self._db}")
        return resp.status_code == 200

    async def ensure_database(self) -> bool:
        """Create the database if missing. Idempotent.

        Returns ``True`` if it was created, ``False`` if it already existed.
        """
        resp = await self._client.put(f"/{self._db}")
        if resp.status_code in (201, 202):
            logger.info("Created CouchDB database %s", self._db)
            return True
        if resp.status_code == 412:  # file_exists
            return False
        resp.raise_for_status()
        return False

    async def ensure_indexes(self) -> list[dict[str, Any]]:
        """Create all Mango indexes from `data: INDEX_SPECS`. Idempotent.

        Returns CouchDB's per-index result (``{"name", "result"}``) so startup
        can log exactly what was created vs. already existed.
        """
        results: list[dict[str, Any]] = []
        for spec in INDEX_SPECS:
            resp = await self._client.post(f"/{self._db}/_index", json=spec)
            resp.raise_for_status()
            body = resp.json()
            results.append({"name": spec["name"], "result": body.get("result", "unknown")})
        logger.info("Ensured %d Mango indexes on %r", len(results), self._db)
        return results

    async def compact(self) -> bool:
        """Trigger database compaction (housekeeping). Returns True if accepted."""
        resp = await self._client.post(
            f"/{self._db}/_compact", json={}, headers={"Content-Type": "application/json"}
        )
        if resp.status_code in (200, 202):
            return True
        resp.raise_for_status()
        return False

    # --- Document reads ---

    async def get_doc(self, doc_id: str) -> dict[str, Any] | None:
        """Fetch a single document, or ``None`` if it does not exist."""
        resp = await self._client.get(f"/{self._db}/{quote(doc_id, safe='')}")
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()

    async def get_all_docs(self, *, include_deleted: bool = False) -> list[dict[str, Any]]:
        """Return every document in the database.

        Design documents (Mango indexes) are always excluded. Soft-deleted
        documents (``deletedAt`` set) are excluded unless ``include_deleted``.
        """
        resp = await self._client.get(
            f"/{self._db}/_all_docs", params={"include_docs": "true"}
        )
        resp.raise_for_status()
        rows = resp.json().get("rows", [])
        return [doc for row in rows if (doc := row.get("doc")) and self._keep(doc, include_deleted)]

    async def get_trip_docs(
        self, trip_id: str, *, include_deleted: bool = False
    ) -> list[dict[str, Any]]:
        """Return the trip document plus all of its child documents.

        Uses prefix range scans (``startkey``/``endkey``) per child type, which
        need no index – the same fast, offline-friendly pattern the client uses.
        """
        bare = normalise_trip_id(trip_id)
        docs: list[dict[str, Any]] = []

        trip_doc = await self.get_doc(f"trip:{bare}")
        if trip_doc and self._keep(trip_doc, include_deleted):
            docs.append(trip_doc)

        for prefix in _TRIP_CHILD_PREFIXES:
            for doc in await self._prefix_scan(f"{prefix}:{bare}"):
                if self._keep(doc, include_deleted):
                    docs.append(doc)
        return docs

    async def fetch_attachment(self, doc_id: str, name: str) -> bytes:
        """Download the raw bytes of a named attachment on a document."""
        resp = await self._client.get(
            f"/{self._db}/{quote(doc_id, safe='')}/{quote(name, safe='')}"
        )
        resp.raise_for_status()
        return resp.content

    # --- Internals ---

    async def _prefix_scan(self, prefix: str) -> list[dict[str, Any]]:
        params = {
            "include_docs": "true",
            "startkey": json.dumps(prefix),
            "endkey": json.dumps(prefix + _HIGH),
        }
        resp = await self._client.get(f"/{self._db}/_all_docs", params=params)
        resp.raise_for_status()
        rows = resp.json().get("rows", [])
        return [doc for row in rows if (doc := row.get("doc"))]

    @staticmethod
    def _keep(doc: dict[str, Any], include_deleted: bool) -> bool:
        doc_id = doc.get("id", "")
        if isinstance(doc_id, str) and doc_id.startswith("_design"):
            return False
        return include_deleted or not doc.get("deletedAt")
        