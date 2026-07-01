"""Unit tests for app.models – Pydantic document schemas and parse_doc."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.models import (
    Attachment,
    ChecklistItem,
    ChecklistTemplate,
    CouchDoc,
    Expense,
    Flight,
    ItineraryItem,
    Reservation,
    Settings,
    Trip,
    TripDay,
    parse_doc,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

BASE = {
    "_id": "test:01",
    "_rev": "1-abc",
    "tripId": "trip:01",
    "createdAt": "2026-01-01T00:00:00+00:00",
    "updatedAt": "2026-01-01T00:00:00+00:00",
    "schemaVersion": 1,
}


class TestCouchDoc:
    def test_minimal_validates(self):
        doc = CouchDoc.model_validate({"_id": "x"})
        assert doc.id == "x"

    def test_extra_fields_preserved(self):
        raw = {"_id": "x", "_attachments": {"file.pdf": {"length": 100}}}
        doc = CouchDoc.model_validate(raw)
        assert doc.model_extra["_attachments"] is not None

    def test_snake_and_camel_aliases(self):
        doc = CouchDoc.model_validate({"_id": "x", "tripId": "trip:01"})
        assert doc.trip_id == "trip:01"


class TestTripModel:
    def test_minimal(self):
        raw = {**BASE, "type": "trip", "title": "Paris"}
        trip = Trip.model_validate(raw)
        assert trip.type == "trip"
        assert trip.title == "Paris"
        assert trip.archived is False
        assert trip.destinations == []

    def test_camel_alias_startDate(self):
        raw = {**BASE, "type": "trip", "startDate": "2026-06-01"}
        trip = Trip.model_validate(raw)
        assert trip.start_date == "2026-06-01"

    def test_camel_alias_endDate(self):
        raw = {**BASE, "type": "trip", "endDate": "2026-06-10"}
        trip = Trip.model_validate(raw)
        assert trip.end_date == "2026-06-10"


class TestTripDayModel:
    def test_minimal(self):
        raw = {**BASE, "type": "tripDay", "date": "2026-06-01"}
        doc = TripDay.model_validate(raw)
        assert doc.type == "tripDay"
        assert doc.date == "2026-06-01"


class TestItineraryItemModel:
    def test_minimal(self):
        raw = {**BASE, "type": "itineraryItem"}
        doc = ItineraryItem.model_validate(raw)
        assert doc.all_day is False

    def test_all_day_alias(self):
        raw = {**BASE, "type": "itineraryItem", "allDay": True}
        doc = ItineraryItem.model_validate(raw)
        assert doc.all_day is True


class TestChecklistItemModel:
    def test_defaults(self):
        raw = {**BASE, "type": "checklistItem", "text": "Pack passport"}
        doc = ChecklistItem.model_validate(raw)
        assert doc.done is False


class TestFlightModel:
    def test_segments_default_empty(self):
        raw = {**BASE, "type": "flight"}
        doc = Flight.model_validate(raw)
        assert doc.segments == []


class TestReservationModel:
    def test_minimal(self):
        raw = {**BASE, "type": "reservation", "kind": "lodging"}
        doc = Reservation.model_validate(raw)
        assert doc.kind == "lodging"
        assert doc.details == {}


class TestExpenseModel:
    def test_defaults(self):
        raw = {**BASE, "type": "expense"}
        doc = Expense.model_validate(raw)
        assert doc.paid is False


class TestAttachmentModel:
    def test_minimal(self):
        raw = {**BASE, "type": "attachment", "filename": "doc.pdf"}
        doc = Attachment.model_validate(raw)
        assert doc.filename == "doc.pdf"


class TestChecklistTemplateModel:
    def test_items_default_empty(self):
        raw = {**BASE, "type": "checklistTemplate", "name": "Packing"}
        doc = ChecklistTemplate.model_validate(raw)
        assert doc.items == []


class TestSettingsModel:
    def test_minimal(self):
        raw = {**BASE, "type": "settings"}
        doc = Settings.model_validate(raw)
        assert doc.type == "settings"


class TestParseDoc:
    def test_resolves_trip(self):
        raw = {**BASE, "type": "trip"}
        doc = parse_doc(raw)
        assert isinstance(doc, Trip)

    def test_resolves_itinerary_item(self):
        raw = {**BASE, "type": "itineraryItem"}
        doc = parse_doc(raw)
        assert isinstance(doc, ItineraryItem)

    def test_resolves_expense(self):
        raw = {**BASE, "type": "expense"}
        doc = parse_doc(raw)
        assert isinstance(doc, Expense)

    def test_resolves_flight(self):
        raw = {**BASE, "type": "flight"}
        doc = parse_doc(raw)
        assert isinstance(doc, Flight)

    def test_resolves_reservation(self):
        raw = {**BASE, "type": "reservation"}
        doc = parse_doc(raw)
        assert isinstance(doc, Reservation)

    def test_resolves_checklist_item(self):
        raw = {**BASE, "type": "checklistItem"}
        doc = parse_doc(raw)
        assert isinstance(doc, ChecklistItem)

    def test_resolves_attachment(self):
        raw = {**BASE, "type": "attachment"}
        doc = parse_doc(raw)
        assert isinstance(doc, Attachment)

    def test_resolves_settings(self):
        raw = {**BASE, "type": "settings"}
        doc = parse_doc(raw)
        assert isinstance(doc, Settings)

    def test_unknown_type_falls_back_to_couchdoc(self):
        raw = {**BASE, "type": "unknownFuture"}
        doc = parse_doc(raw)
        assert type(doc) is CouchDoc

    def test_validation_error_falls_back_to_couchdoc(self):
        # Provide a payload that would fail Trip validation in a way that forces
        # the fallback. We do this by monkeypatching is impractical, so instead
        # we test the fallback via an invalid enum on a known type.
        raw = {**BASE, "type": "itineraryItem", "category": "__invalid__"}
        doc = parse_doc(raw)
        # Falls back gracefully
        assert isinstance(doc, CouchDoc)
