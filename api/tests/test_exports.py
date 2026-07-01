"""Unit tests for app.services.exports – pure, no I/O."""

from __future__ import annotations

from app.models import DOC_TYPES
from app.services.exports import (
    EXPORT_VERSION,
    FULL_EXPORT_SCHEMA,
    TRIP_EXPORT_SCHEMA,
    build_attachment_manifest,
    group_docs_by_type,
    shape_full_export,
    shape_trip_export,
)


class TestGroupDocsByType:
    def test_empty_list_has_all_keys(self):
        grouped = group_docs_by_type([])
        for t in DOC_TYPES:
            assert t in grouped

    def test_documents_bucketed_by_type(self):
        docs = [
            {"type": "trip", "_id": "trip:01"},
            {"type": "expense", "_id": "exp:01:A"},
            {"type": "expense", "_id": "exp:01:B"},
        ]
        grouped = group_docs_by_type(docs)
        assert len(grouped["trip"]) == 1
        assert len(grouped["expense"]) == 2

    def test_unknown_type_lands_in_its_own_key(self):
        docs = [{"type": "futureDoc", "_id": "x"}]
        grouped = group_docs_by_type(docs)
        assert "futureDoc" in grouped
        assert grouped["futureDoc"] == docs


class TestBuildAttachmentManifest:
    def test_attachment_stub_produces_manifest_entry(self):
        docs = [
            {
                "_id": "att:01:A",
                "type": "attachment",
                "filename": "photo.jpg",
                "mime": "image/jpeg",
                "size": 2048,
                "ownerType": "itineraryItem",
                "ownerId": "itin:01:B",
                "_attachments": {
                    "photo.jpg": {"content_type": "image/jpeg", "length": 2048, "digest": "sha256-abc"}
                },
            }
        ]
        manifest = build_attachment_manifest(docs)
        assert len(manifest) == 1
        entry = manifest[0]
        assert entry["docId"] == "att:01:A"
        assert entry["name"] == "photo.jpg"
        assert entry["digest"] == "sha256-abc"
        assert entry["ownerType"] == "itineraryItem"

    def test_attachment_doc_without_binary_stub_gets_listed(self):
        docs = [
            {
                "_id": "att:01:A",
                "type": "attachment",
                "filename": "receipt.pdf",
                "mime": "application/pdf",
                "size": 512,
                # No _attachments key at all
            }
        ]
        manifest = build_attachment_manifest(docs)
        assert len(manifest) == 1
        assert manifest[0]["digest"] is None
        assert manifest[0]["filename"] == "receipt.pdf"

    def test_non_attachment_doc_without_stubs_produces_no_entry(self):
        docs = [{"_id": "trip:01", "type": "trip", "title": "Paris"}]
        manifest = build_attachment_manifest(docs)
        assert manifest == []

    def test_multiple_stubs_on_one_doc(self):
        docs = [
            {
                "_id": "att:01:A",
                "type": "attachment",
                "_attachments": {
                    "a.jpg": {"content_type": "image/jpeg", "length": 100, "digest": "sha256-a"},
                    "b.jpg": {"content_type": "image/jpeg", "length": 200, "digest": "sha256-b"},
                },
            }
        ]
        manifest = build_attachment_manifest(docs)
        assert len(manifest) == 2


class TestShapeTripExport:
    def _make_docs(self):
        return [
            {"_id": "trip:01", "type": "trip", "title": "Paris"},
            {"_id": "itin:01:A", "type": "itineraryItem", "tripId": "trip:01", "title": "Eiffel Tower"},
            {"_id": "itin:01:B", "type": "itineraryItem", "tripId": "trip:01", "title": "Louvre"},
            {"_id": "exp:01:A", "type": "expense", "tripId": "trip:01"},
        ]

    def test_schema_and_version(self):
        payload = shape_trip_export("01", self._make_docs(), "itinera")
        assert payload["schema"] == TRIP_EXPORT_SCHEMA
        assert payload["version"] == EXPORT_VERSION

    def test_trip_key_holds_trip_document(self):
        payload = shape_trip_export("01", self._make_docs(), "itinera")
        assert payload["trip"] is not None
        assert payload["trip"]["type"] == "trip"

    def test_counts_reflect_doc_counts(self):
        payload = shape_trip_export("01", self._make_docs(), "itinera")
        assert payload["counts"]["itineraryItem"] == 2
        assert payload["counts"]["expense"] == 1

    def test_trip_absent_returns_none_trip(self):
        payload = shape_trip_export("99", [], "itinera")
        assert payload["trip"] is None

    def test_db_name_in_payload(self):
        payload = shape_trip_export("01", self._make_docs(), "my_db")
        assert payload["db"] == "my_db"


class TestShapeFullExport:
    def test_schema_and_version(self):
        docs = [{"_id": "trip:01", "type": "trip"}]
        payload = shape_full_export(docs, "itinera")
        assert payload["schema"] == FULL_EXPORT_SCHEMA
        assert payload["version"] == EXPORT_VERSION

    def test_doc_count_matches(self):
        docs = [{"_id": f"trip:{i}", "type": "trip"} for i in range(5)]
        payload = shape_full_export(docs, "itinera")
        assert payload["docCount"] == 5

    def test_documents_key_contains_all_docs(self):
        docs = [{"_id": "trip:01", "type": "trip"}, {"_id": "exp:01:A", "type": "expense"}]
        payload = shape_full_export(docs, "itinera")
        assert payload["documents"] == docs
