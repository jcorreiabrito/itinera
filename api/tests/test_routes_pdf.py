"""Integration tests for the printable-PDF route.

The web client asks for a document in the language the app is showing with
`?lang=`; these pin that the parameter actually reaches the rendered document.
The client half of that contract lives in `web/src/lib/api.ts`, which this suite
cannot see, so the endpoint is the only end of it that is testable here.
"""

from __future__ import annotations

import re
import zlib

import httpx
import pytest
from app.main import create_app
from tests.conftest import json_response, make_couch, make_settings

pytest.importorskip("weasyprint", reason="PDF rendering needs WeasyPrint")

TRIP_DOC = {
    "_id": "trip:01",
    "id": "trip:01",
    "type": "trip",
    "title": "Paris",
    "startDate": "2026-06-01",
    "endDate": "2026-06-02",
}


def _all_docs_resp(docs: list) -> dict:
    return {"rows": [{"doc": d} for d in docs]}


async def _make_client(couch_responses: dict) -> httpx.AsyncClient:
    s = make_settings()
    couch = make_couch(s, couch_responses)
    app = create_app(settings=s, couch=couch)
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver")


def _pdf_including_object_streams(pdf: bytes) -> bytes:
    """
    A PDF's bytes with every Flate-compressed stream expanded.

    WeasyPrint writes the document catalog into an object stream, so `/Lang` is
    not visible in the raw file; expanding the streams is what makes it greppable
    without adding a PDF parser to the test dependencies.
    """
    out = [pdf]
    for match in re.finditer(rb"stream\r?\n", pdf):
        end = pdf.find(b"endstream", match.end())
        if end == -1:
            continue
        try:
            out.append(zlib.decompress(pdf[match.end() : end]))
        except zlib.error:  # a font or image stream, not one we need
            continue
    return b"".join(out)


class TestPrintPdf:
    async def _get_pdf(self, query: str = "") -> httpx.Response:
        responses = {
            ("GET", "/itinera_test/trip%3A01"): json_response(TRIP_DOC),
            ("GET", "/itinera_test/_all_docs"): json_response(_all_docs_resp([TRIP_DOC])),
            ("PUT", "/itinera_test"): httpx.Response(412, json={}),
        }
        async with await _make_client(responses) as client:
            return await client.get(f"/api/trips/01/print.pdf{query}")

    async def test_returns_a_pdf(self):
        resp = await self._get_pdf()
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/pdf"
        assert resp.content.startswith(b"%PDF")

    async def test_lang_query_reaches_the_document(self):
        resp = await self._get_pdf("?lang=pt-BR")
        assert resp.status_code == 200
        assert b"/Lang (pt-BR)" in _pdf_including_object_streams(resp.content)

    async def test_default_language_is_english(self):
        resp = await self._get_pdf()
        assert b"/Lang (en)" in _pdf_including_object_streams(resp.content)

    async def test_default_paper_is_a4(self):
        resp = await self._get_pdf()
        assert re.search(
            rb"/MediaBox \[0 0 595\.\d+ 841\.\d+\]",
            _pdf_including_object_streams(resp.content),
        )

    async def test_letter_paper_sets_the_page_size(self):
        resp = await self._get_pdf("?paper=letter")
        assert resp.status_code == 200
        assert b"/MediaBox [0 0 612 792]" in _pdf_including_object_streams(resp.content)

    async def test_unknown_paper_falls_back_to_a4(self):
        resp = await self._get_pdf("?paper=a3")
        assert resp.status_code == 200
        assert re.search(
            rb"/MediaBox \[0 0 595\.\d+ 841\.\d+\]",
            _pdf_including_object_streams(resp.content),
        )

    async def test_language_and_paper_compose(self):
        resp = await self._get_pdf("?lang=pt-BR&paper=letter")
        blob = _pdf_including_object_streams(resp.content)
        assert b"/Lang (pt-BR)" in blob
        assert b"/MediaBox [0 0 612 792]" in blob

    async def test_pdf_is_tagged_for_screen_readers(self):
        resp = await self._get_pdf()
        blob = _pdf_including_object_streams(resp.content)
        assert b"/StructTreeRoot" in blob
        assert b"/MarkInfo <</Marked true>>" in blob

    async def test_filename_names_the_trip_not_the_language(self):
        resp = await self._get_pdf("?lang=pt-BR")
        assert 'filename="itinera-paris.pdf"' in resp.headers["content-disposition"]
