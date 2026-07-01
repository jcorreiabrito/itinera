"""Integration tests for GET /api/health."""

from __future__ import annotations

import httpx
import pytest

from app.main import create_app
from tests.conftest import json_response, make_couch, make_settings


async def _make_client(
    couch_responses: dict,
) -> httpx.AsyncClient:
    s = make_settings()
    couch = make_couch(s, couch_responses)
    app = create_app(settings=s, couch=couch)
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver")


class TestHealthEndpoint:
    async def test_returns_200_when_couch_reachable(self):
        responses = {
            ("GET", "/"): json_response({"version": "3.3.3", "couchdb": "Welcome"}),
            ("HEAD", "/itinera_test"): httpx.Response(200),
            ("PUT", "/itinera_test"): httpx.Response(412, json={}),
        }
        async with await _make_client(responses) as client:
            resp = await client.get("/api/health")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"
        assert body["couch"]["reachable"] is True
        assert body["couch"]["version"] == "3.3.3"

    async def test_returns_200_with_couch_unreachable(self):
        """Health probe must never raise even when CouchDB is down."""
        # Simulate network error by returning 500 from the ping.
        responses = {
            ("GET", "/"): httpx.Response(500, json={"error": "internal"}),
            ("HEAD", "/itinera_test"): httpx.Response(200),
            ("PUT", "/itinera_test"): httpx.Response(412, json={}),
        }
        async with await _make_client(responses) as client:
            resp = await client.get("/api/health")
        assert resp.status_code == 200
        body = resp.json()
        assert body["couch"]["reachable"] is False

    async def test_response_shape(self):
        responses = {
            ("GET", "/"): json_response({"version": "3.3.3"}),
            ("HEAD", "/itinera_test"): httpx.Response(200),
            ("PUT", "/itinera_test"): httpx.Response(412, json={}),
        }
        async with await _make_client(responses) as client:
            resp = await client.get("/api/health")
        body = resp.json()
        for key in ("status", "service", "version", "time", "couch"):
            assert key in body
