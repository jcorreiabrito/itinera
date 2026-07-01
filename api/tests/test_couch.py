"""Unit tests for app.couch using httpx MockTransport."""

from __future__ import annotations

import json

import httpx
import pytest

from app.couch import CouchClient, normalise_trip_id
from tests.conftest import json_response, make_couch, make_settings


class TestNormaliseTripId:
    def test_strips_trip_prefix(self):
        assert normalise_trip_id("trip:ABCDE") == "ABCDE"

    def test_leaves_bare_ulid_unchanged(self):
        assert normalise_trip_id("ABCDE") == "ABCDE"


class TestKeepFilter:
    def test_excludes_design_docs(self):
        doc = {"id": "_design/idx-type", "type": "trip"}
        assert CouchClient._keep(doc, False) is False

    def test_excludes_soft_deleted_by_default(self):
        doc = {"id": "trip:01", "deletedAt": "2026-01-01T00:00:00+00:00"}
        assert CouchClient._keep(doc, False) is False

    def test_includes_soft_deleted_when_flag_set(self):
        doc = {"id": "trip:01", "deletedAt": "2026-01-01T00:00:00+00:00"}
        assert CouchClient._keep(doc, True) is True

    def test_includes_regular_doc(self):
        doc = {"id": "trip:01", "type": "trip"}
        assert CouchClient._keep(doc, False) is True


class TestEnsureDatabase:
    async def test_returns_true_on_201(self):
        couch = make_couch(
            responses={("PUT", "/itinera_test"): httpx.Response(201, json={})}
        )
        result = await couch.ensure_database()
        assert result is True
        await couch.aclose()

    async def test_returns_false_on_412(self):
        couch = make_couch(
            responses={("PUT", "/itinera_test"): httpx.Response(412, json={"error": "file_exists"})}
        )
        result = await couch.ensure_database()
        assert result is False
        await couch.aclose()


class TestGetDoc:
    async def test_returns_none_on_404(self):
        couch = make_couch(
            responses={("GET", "/itinera_test/trip%3A01"): httpx.Response(404, json={"error": "not_found"})}
        )
        result = await couch.get_doc("trip:01")
        assert result is None
        await couch.aclose()

    async def test_returns_parsed_json_on_200(self):
        doc = {"_id": "trip:01", "type": "trip", "title": "Paris"}
        couch = make_couch(
            responses={("GET", "/itinera_test/trip%3A01"): json_response(doc)}
        )
        result = await couch.get_doc("trip:01")
        assert result is not None
        assert result["title"] == "Paris"
        await couch.aclose()


class TestGetAllDocs:
    async def test_returns_docs_filtered_by_keep(self):
        all_docs_resp = {
            "rows": [
                {"doc": {"_id": "trip:01", "id": "trip:01", "type": "trip"}},
                {"doc": {"_id": "trip:02", "id": "trip:02", "type": "trip", "deletedAt": "2026-01-01T00:00:00+00:00"}},
                {"doc": {"_id": "_design/idx", "id": "_design/idx"}},
            ]
        }
        couch = make_couch(
            responses={("GET", "/itinera_test/_all_docs"): json_response(all_docs_resp)}
        )
        result = await couch.get_all_docs(include_deleted=False)
        assert len(result) == 1
        assert result[0]["_id"] == "trip:01"
        await couch.aclose()

    async def test_include_deleted_returns_soft_deleted(self):
        all_docs_resp = {
            "rows": [
                {"doc": {"_id": "trip:01", "id": "trip:01", "type": "trip", "deletedAt": "2026-01-01T00:00:00+00:00"}},
            ]
        }
        couch = make_couch(
            responses={("GET", "/itinera_test/_all_docs"): json_response(all_docs_resp)}
        )
        result = await couch.get_all_docs(include_deleted=True)
        assert len(result) == 1
        await couch.aclose()
