"""Shared pytest fixtures for all Itinera API tests."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

import httpx
import pytest
import pytest_asyncio

from app.config import Settings
from app.couch import CouchClient
from app.main import create_app


def make_settings(**overrides: Any) -> Settings:
    """Build a Settings instance that does not touch the real env/file."""
    defaults = dict(
        COUCHDB_URL="http://localhost:5984",
        COUCHDB_USER="admin",
        COUCHDB_PASSWORD="test",
        COUCHDB_DB="itinera_test",
        EXPORT_DIR="/tmp/itinera_test_exports",
        BACKUP_KEEP="3",
        COMPACT_ON_BACKUP="false",
        SCHEDULER_ENABLED="false",
        DOCS_ENABLED="false",
    )
    defaults.update(overrides)
    return Settings(**defaults)


class MockTransport(httpx.AsyncBaseTransport):
    """Minimal mock HTTPX transport driven by a pre-baked response map."""

    def __init__(self, responses: dict[tuple[str, str], httpx.Response]) -> None:
        # responses keyed by (METHOD, url-path-with-leading-slash)
        self._responses = responses

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        # Use raw_path so percent-encoded IDs (e.g. trip%3A01) match correctly.
        raw_path = request.url.raw_path.decode("ascii")
        # Strip query string from raw_path if present
        path_only = raw_path.split("?")[0]
        key = (request.method, path_only)
        resp = self._responses.get(key)
        if resp is None:
            # Default: 200 with empty JSON
            return httpx.Response(200, json={})
        return resp


def json_response(data: Any, status: int = 200) -> httpx.Response:
    """Build a pre-baked JSON HTTPX response."""
    return httpx.Response(status, content=json.dumps(data).encode(), headers={"content-type": "application/json"})


def make_couch(
    settings: Settings | None = None,
    responses: dict[tuple[str, str], httpx.Response] | None = None,
) -> CouchClient:
    """Build a CouchClient backed by a MockTransport."""
    s = settings or make_settings()
    transport = MockTransport(responses or {})
    client = httpx.AsyncClient(
        base_url=s.couchdb_url,
        transport=transport,
    )
    return CouchClient(s, client=client)


@pytest.fixture
def settings() -> Settings:
    return make_settings()


@pytest_asyncio.fixture
async def app_client() -> AsyncIterator[httpx.AsyncClient]:
    """HTTPX test client wrapping the FastAPI app (no real CouchDB needed)."""
    s = make_settings()
    # Build a CouchClient that returns a canned welcome ping + db-exists=True
    responses = {
        ("GET", "/"): json_response({"version": "3.3.3", "couchdb": "Welcome"}),
        ("HEAD", "/itinera_test"): httpx.Response(200),
        ("PUT", "/itinera_test"): httpx.Response(412, json={"error": "file_exists"}),
    }
    couch = make_couch(s, responses)
    app = create_app(settings=s, couch=couch)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        yield client
