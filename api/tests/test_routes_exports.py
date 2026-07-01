"""Integration tests for the export routes."""

from __future__ import annotations

import json

import httpx
import pytest

from app.main import create_app
from app.services.exports import TRIP_EXPORT_SCHEMA, FULL_EXPORT_SCHEMA
from tests.conftest import json_response, make_couch, make_settings

TRIP_DOC = {"_id": "trip:01", "id": "trip:01", "type": "trip", "title": "Paris"}


def _all_docs_resp(docs: list) -> dict:
    return {"rows": [{"doc": d} for d in docs]}


async def _make_client(couch_responses: dict) -> httpx.AsyncClient:
    s = make_settings()
    couch = make_couch(s, couch_responses)
    app = create_app(settings=s, couch=couch)
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver")


class TestExportTrip:
    async def test_returns_404_when_trip_not_found(self):
        # No docs for trip:99
        responses = {
            ("GET", "/itinera_test/trip%3A99"): httpx.Response(404, json={"error": "not_found"}),
            ("PUT", "/itinera_test"): httpx.Response(412, json={}),
        }
        async with await _make_client(responses) as client:
            resp = await client.get("/api/trips/99/export.json")
        assert resp.status_code == 404

    async def test_returns_200_with_trip_payload(self):
        responses = {
            ("GET", "/itinera_test/trip%3A01"): json_response(TRIP_DOC),
            ("GET", "/itinera_test/_all_docs"): json_response(_all_docs_resp([TRIP_DOC])),
            ("PUT", "/itinera_test"): httpx.Response(412, json={}),
        }
        async with await _make_client(responses) as client:
            resp = await client.get("/api/trips/01/export.json")
        assert resp.status_code == 200
        body = resp.json()
        assert body["schema"] == TRIP_EXPORT_SCHEMA
        assert body["trip"]["type"] == "trip"

    async def test_response_has_content_disposition(self):
        responses = {
            ("GET", "/itinera_test/trip%3A01"): json_response(TRIP_DOC),
            ("GET", "/itinera_test/_all_docs"): json_response(_all_docs_resp([TRIP_DOC])),
            ("PUT", "/itinera_test"): httpx.Response(412, json={}),
        }
        async with await _make_client(responses) as client:
            resp = await client.get("/api/trips/01/export.json")
        assert "Content-Disposition" in resp.headers
        assert "attachment" in resp.headers["Content-Disposition"]


class TestExportAll:
    async def test_returns_200_with_full_payload(self):
        docs = [TRIP_DOC, {"_id": "exp:01:A", "id": "exp:01:A", "type": "expense"}]
        responses = {
            ("GET", "/itinera_test/_all_docs"): json_response(_all_docs_resp(docs)),
            ("PUT", "/itinera_test"): httpx.Response(412, json={}),
        }
        async with await _make_client(responses) as client:
            resp = await client.get("/api/export/all.json")
        assert resp.status_code == 200
        body = resp.json()
        assert body["schema"] == FULL_EXPORT_SCHEMA
        assert body["docCount"] == 2
