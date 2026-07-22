"""Unit tests for trip import logic and router."""

from __future__ import annotations

import json
import pytest
from app.services.imports import prepare_trip_import


def test_prepare_trip_import_success():
    payload = {
        "schema": "itinera.trip-export",
        "version": 1,
        "exportedAt": "2026-07-21T10:00:00Z",
        "db": "test_db",
        "tripId": "trip:OLD123",
        "trip": {
            "_id": "trip:OLD123",
            "_rev": "1-abc",
            "type": "trip",
            "title": "Paris 2026",
            "startDate": "2026-08-01",
            "endDate": "2026-08-10",
            "coverImageAttId": "att:OLD123:IMG1",
        },
        "documents": {
            "tripDay": [
                {
                    "_id": "day:OLD123:2026-08-01",
                    "type": "tripDay",
                    "tripId": "trip:OLD123",
                    "date": "2026-08-01",
                    "title": "Arrival",
                }
            ],
            "itineraryItem": [
                {
                    "_id": "itin:OLD123:ITEM1",
                    "type": "itineraryItem",
                    "tripId": "trip:OLD123",
                    "title": "Eiffel Tower",
                    "linkedFlightId": "flt:OLD123:FLT1",
                }
            ],
            "flight": [
                {
                    "_id": "flt:OLD123:FLT1",
                    "type": "flight",
                    "tripId": "trip:OLD123",
                    "attachmentIds": ["att:OLD123:IMG1"],
                }
            ],
            "attachment": [
                {
                    "_id": "att:OLD123:IMG1",
                    "type": "attachment",
                    "tripId": "trip:OLD123",
                    "filename": "ticket.pdf",
                    "ownerId": "flt:OLD123:FLT1",
                }
            ],
        },
    }

    new_trip_id, docs = prepare_trip_import(payload)

    assert new_trip_id.startswith("trip:")
    assert new_trip_id != "trip:OLD123"

    doc_by_type = {d["type"]: d for d in docs}
    assert "trip" in doc_by_type
    assert doc_by_type["trip"]["_id"] == new_trip_id
    assert doc_by_type["trip"]["title"] == "Paris 2026"
    assert "_rev" not in doc_by_type["trip"]
    assert doc_by_type["trip"]["archived"] is False

    day_doc = doc_by_type["tripDay"]
    assert day_doc["_id"] == f"day:{new_trip_id.split(':')[1]}:2026-08-01"
    assert day_doc["tripId"] == new_trip_id

    itin_doc = doc_by_type["itineraryItem"]
    assert itin_doc["tripId"] == new_trip_id
    assert itin_doc["linkedFlightId"].startswith("flt:")
    assert itin_doc["linkedFlightId"] != "flt:OLD123:FLT1"

    flt_doc = doc_by_type["flight"]
    assert itin_doc["linkedFlightId"] == flt_doc["_id"]

    att_doc = doc_by_type["attachment"]
    assert att_doc["ownerId"] == flt_doc["_id"]
    assert flt_doc["attachmentIds"] == [att_doc["_id"]]
    assert doc_by_type["trip"]["coverImageAttId"] == att_doc["_id"]


def test_prepare_trip_import_resilient_fallback():
    # Even with non-standard schema, version or missing trip, it recovers gracefully
    new_id_1, docs_1 = prepare_trip_import({"schema": "custom.schema", "version": 99, "title": "My Custom Trip"})
    assert new_id_1.startswith("trip:")
    assert docs_1[0]["title"] == "My Custom Trip"

    # Non-dictionary payload still raises ValueError
    with pytest.raises(ValueError, match="Payload must be a JSON object"):
        prepare_trip_import("not a json object")

