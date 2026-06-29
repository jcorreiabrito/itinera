"""Pure functions that shape CouchDB documents into export payloads.

Kept free of I/O so they are trivially unit-testable without a live CouchDB.
"""

from __future__ import annotations

from typing import Any

from ..models import DOC_TYPES
from ..util import utcnow_iso

TRIP_EXPORT_SCHEMA = "itinera.trip-export"
FULL_EXPORT_SCHEMA = "itinera.full-export"
EXPORT_VERSION = 1


def group_docs_by_type(docs: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Bucket documents by their `type` field, preserving a stable key order."""
    grouped: dict[str, list[dict[str, Any]]] = {t: [] for t in DOC_TYPES}
    for doc in docs:
        grouped.setdefault(str(doc.get("type", "unknown")), []).append(doc)
    return grouped


def build_attachment_manifest(docs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Describe every binary attachment referenced by the given documents.

    Reads CouchDB `_attachments` stubs (`content_type`/`length`/`digest`)
    and enriches them with owner metadata from `attachment` documents.
    """
    manifest: list[dict[str, Any]] = []
    for doc in docs:
        doc_id = doc.get("_id")
        attachments = doc.get("_attachments") or {}
        for name, meta in attachments.items():
            manifest.append(
                {
                    "docId": doc_id,
                    "name": name,
                    "filename": doc.get("filename") or name,
                    "mime": doc.get("mime") or meta.get("content_type"),
                    "size": doc.get("size") if doc.get("size") is not None else meta.get("length"),
                    "digest": meta.get("digest"),
                    "ownerType": doc.get("ownerType"),
                    "ownerId": doc.get("ownerId"),
                }
            )
        # Attachment documents whose binary stub is not inlined still get listed.
        if doc.get("type") == "attachment" and not attachments:
            manifest.append(
                {
                    "docId": doc.get("_id"),
                    "name": doc.get("filename"),
                    "filename": doc.get("filename"),
                    "mime": doc.get("mime"),
                    "size": doc.get("size"),
                    "digest": None,
                    "ownerType": doc.get("ownerType"),
                    "ownerId": doc.get("ownerId"),
                }
            )
    return manifest


def shape_trip_export(
    trip_id: str, docs: list[dict[str, Any]], db_name: str
) -> dict[str, Any]:
    """Build the per-trip export payload (trip + grouped children + manifest)."""
    grouped = group_docs_by_type(docs)
    trip_docs = grouped.get("trip", [])
    trip = trip_docs[0] if trip_docs else None

    documents = {t: grouped.get(t, []) for t in DOC_TYPES if t != "trip"}
    counts = {t: len(v) for t, v in documents.items()}
    manifest = build_attachment_manifest(docs)

    return {
        "schema": TRIP_EXPORT_SCHEMA,
        "version": EXPORT_VERSION,
        "exportedAt": utcnow_iso(),
        "db": db_name,
        "tripId": (trip or {}).get("_id", trip_id),
        "trip": trip,
        "documents": documents,
        "counts": counts,
        "attachments": manifest,
    }


def shape_full_export(docs: list[dict[str, Any]], db_name: str) -> dict[str, Any]:
    """Build a faithful whole-database export payload for backup/restore."""
    return {
        "schema": FULL_EXPORT_SCHEMA,
        "version": EXPORT_VERSION,
        "exportedAt": utcnow_iso(),
        "db": db_name,
        "docCount": len(docs),
        "documents": docs,
        "attachments": build_attachment_manifest(docs),
    }

