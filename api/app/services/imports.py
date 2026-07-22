"""Pure functions for validating and preparing trip import payloads.

Kept free of I/O so they are trivially unit-testable without a live CouchDB.
"""

from __future__ import annotations

import os
import time
from typing import Any

from ..util import utcnow_iso

CROCKFORD32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def generate_ulid(timestamp_ms: int | None = None) -> str:
    """Generate a 26-character Crockford Base32 ULID."""
    if timestamp_ms is None:
        timestamp_ms = int(time.time() * 1000)
    time_part = []
    t = timestamp_ms
    for _ in range(10):
        time_part.append(CROCKFORD32[t & 31])
        t >>= 5
    time_part.reverse()

    rand_bytes = os.urandom(10)
    rand_int = int.from_bytes(rand_bytes, "big")
    rand_part = []
    for _ in range(16):
        rand_part.append(CROCKFORD32[rand_int & 31])
        rand_int >>= 5
    rand_part.reverse()

    return "".join(time_part) + "".join(rand_part)


PREFIX_MAP = {
    "tripDay": "day",
    "itineraryItem": "itin",
    "checklistItem": "chk",
    "flight": "flt",
    "reservation": "res",
    "expense": "exp",
    "attachment": "att",
}


def infer_type_and_prefix(doc: dict[str, Any]) -> tuple[str, str]:
    doc_type = str(doc.get("type") or "")
    prefix = ""

    doc_id = str(doc.get("_id") or doc.get("id") or "")
    if ":" in doc_id:
        prefix = doc_id.split(":")[0]

    if not doc_type and prefix:
        type_by_prefix = {
            "trip": "trip",
            "day": "tripDay",
            "itin": "itineraryItem",
            "chk": "checklistItem",
            "flt": "flight",
            "res": "reservation",
            "exp": "expense",
            "att": "attachment",
        }
        doc_type = type_by_prefix.get(prefix, "unknown")

    if doc_type and not prefix:
        prefix = PREFIX_MAP.get(doc_type, "doc")

    return doc_type or "unknown", prefix or "doc"


def prepare_trip_import(payload: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
    """Validate and re-id a trip import payload with ultra-high tolerance.

    Returns a tuple of `(new_trip_id, docs_to_insert)`.
    """
    if not isinstance(payload, dict):
        raise ValueError("Payload must be a JSON object")

    raw_trip_doc: dict[str, Any] | None = None
    raw_child_docs: list[dict[str, Any]] = []

    # Locate trip doc
    trip_prop = payload.get("trip")
    if isinstance(trip_prop, dict):
        raw_trip_doc = trip_prop

    docs_container = payload.get("documents") or payload.get("docs") or payload.get("items")
    if isinstance(docs_container, list):
        for item in docs_container:
            if isinstance(item, dict):
                if not raw_trip_doc and (item.get("type") == "trip" or str(item.get("_id", "")).startswith("trip:")):
                    raw_trip_doc = item
                else:
                    raw_child_docs.append(item)
    elif isinstance(docs_container, dict):
        for key, val in docs_container.items():
            if isinstance(val, list):
                for item in val:
                    if isinstance(item, dict):
                        if not raw_trip_doc and (key == "trip" or item.get("type") == "trip"):
                            raw_trip_doc = item
                        elif item.get("type") != "trip":
                            raw_child_docs.append(item)

    if not raw_trip_doc and (payload.get("type") == "trip" or payload.get("title") or payload.get("startDate")):
        raw_trip_doc = payload

    if not raw_trip_doc:
        raw_trip_doc = {
            "type": "trip",
            "title": str(payload.get("title") or "Imported Trip"),
            "startDate": str(payload.get("startDate") or ""),
            "endDate": str(payload.get("endDate") or ""),
            "homeCurrency": str(payload.get("homeCurrency") or "EUR"),
        }

    new_trip_uid = generate_ulid()
    new_trip_id = f"trip:{new_trip_uid}"
    now = utcnow_iso()
    id_map: dict[str, str] = {}

    old_trip_id = str(raw_trip_doc.get("_id") or raw_trip_doc.get("id") or "")
    if old_trip_id:
        id_map[old_trip_id] = new_trip_id

    all_raw = [raw_trip_doc] + raw_child_docs
    intermediate_docs: list[dict[str, Any]] = []

    for i, raw_doc in enumerate(all_raw):
        doc_copy = dict(raw_doc)
        old_id = str(doc_copy.get("_id") or doc_copy.get("id") or "")
        doc_type, prefix = infer_type_and_prefix(doc_copy)

        if i == 0 or doc_type == "trip":
            new_id = new_trip_id
            doc_copy["type"] = "trip"
        elif doc_type == "tripDay":
            date_part = str(doc_copy.get("date") or "undated")
            new_id = f"day:{new_trip_uid}:{date_part}"
            doc_copy["type"] = "tripDay"
        else:
            new_id = f"{prefix}:{new_trip_uid}:{generate_ulid()}"
            doc_copy["type"] = doc_type

        if old_id:
            id_map[old_id] = new_id

        doc_copy["_id"] = new_id
        doc_copy.pop("_rev", None)
        doc_copy.pop("_conflicts", None)
        doc_copy.pop("_attachments", None)
        doc_copy.pop("deletedAt", None)
        doc_copy.pop("archivedAt", None)

        doc_copy["createdAt"] = now
        doc_copy["updatedAt"] = now

        if doc_copy["type"] == "trip":
            doc_copy["archived"] = False
        else:
            doc_copy["tripId"] = new_trip_id
            doc_copy["tripid"] = new_trip_id

        intermediate_docs.append(doc_copy)

    # Remap references
    prepared_docs: list[dict[str, Any]] = []
    for doc in intermediate_docs:
        if "coverImageAttId" in doc and doc["coverImageAttId"] in id_map:
            doc["coverImageAttId"] = id_map[doc["coverImageAttId"]]
        if "linkedFlightId" in doc and doc["linkedFlightId"] in id_map:
            doc["linkedFlightId"] = id_map[doc["linkedFlightId"]]
        if "linkedReservationId" in doc and doc["linkedReservationId"] in id_map:
            doc["linkedReservationId"] = id_map[doc["linkedReservationId"]]
        if "linkedId" in doc and doc["linkedId"] in id_map:
            doc["linkedId"] = id_map[doc["linkedId"]]
        if "ownerId" in doc and doc["ownerId"] in id_map:
            doc["ownerId"] = id_map[doc["ownerId"]]
        if "attachmentIds" in doc and isinstance(doc["attachmentIds"], list):
            doc["attachmentIds"] = [
                id_map.get(att_id, att_id) for att_id in doc["attachmentIds"]
            ]

        prepared_docs.append(doc)

    return new_trip_id, prepared_docs
