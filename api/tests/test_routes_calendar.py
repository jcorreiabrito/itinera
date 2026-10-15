"""Integration tests for GET /api/trips/{trip_id}/calendar.ics."""

from __future__ import annotations

import httpx
import pytest

from app.main import create_app
from app.routers.calendar import _add_one_day, _format_ics_date, generate_ics
from tests.conftest import json_response, make_couch, make_settings


def test_format_ics_date():
    assert _format_ics_date(None) == ""
    assert _format_ics_date("2026-10-15") == "20261015"
    assert _format_ics_date("2026-10-15", "14:30") == "20261015T143000"


def test_add_one_day():
    assert _add_one_day("2026-10-15") == "20261016"
    assert _add_one_day("2026-12-31") == "20270101"


def test_generate_ics():
    trip = {
        "_id": "trip:01TESTTRIP",
        "title": "Viagem Teste",
        "destinations": [{"name": "Chile"}],
    }
    items = [
        {
            "_id": "itin:01TESTTRIP:01ITEM",
            "title": "Passeio Valle de la Luna",
            "date": "2026-10-18",
            "startTime": "14:00",
            "endTime": "18:00",
            "location": {"name": "Valle de la Luna"},
            "notes": "Levar água e casaco",
        }
    ]
    flights = [
        {
            "_id": "flt:01TESTTRIP:01FLIGHT",
            "date": "2026-10-17",
            "departureTime": "08:00",
            "arrivalTime": "10:30",
            "airline": "LATAM",
            "flightNumber": "LA123",
            "origin": "GRU",
            "destination": "CJC",
        }
    ]
    reservations = [
        {
            "_id": "res:01TESTTRIP:01RES",
            "name": "Hotel San Pedro",
            "category": "lodging",
            "date": "2026-10-17",
            "endDate": "2026-10-24",
            "address": "Calle Caracoles 123",
        }
    ]

    ics = generate_ics(trip, items, flights, reservations)

    assert "BEGIN:VCALENDAR" in ics
    assert "PRODID:-//Itinera Trip Planner//EN" in ics
    assert "X-WR-CALNAME:✈️ Viagem Teste" in ics
    assert "Passeio Valle de la Luna" in ics
    assert "Valle de la Luna" in ics
    assert "Levar água e casaco" in ics
    assert "Voo LATAM LA123: GRU -> CJC" in ics
    assert "Hospedagem: Hotel San Pedro" in ics
    assert "Calle Caracoles 123" in ics
    assert "END:VCALENDAR" in ics


async def _make_client(couch_responses: dict) -> httpx.AsyncClient:
    s = make_settings()
    couch = make_couch(s, couch_responses)
    app = create_app(settings=s, couch=couch)
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver")


class TestCalendarEndpoint:
    async def test_returns_404_when_trip_not_found(self):
        responses = {
            ("GET", "/"): json_response({"version": "3.3.3"}),
            ("HEAD", "/itinera_test"): httpx.Response(200),
            ("PUT", "/itinera_test"): httpx.Response(412, json={}),
            ("GET", "/itinera_test/trip%3Anonexistent"): httpx.Response(404, json={"error": "not_found"}),
        }
        async with await _make_client(responses) as client:
            resp = await client.get("/api/trips/nonexistent/calendar.ics")
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()

    async def test_returns_200_ics_when_trip_exists(self):
        trip_doc = {
            "_id": "trip:01TEST",
            "type": "trip",
            "title": "Chile 2026",
            "destinations": [{"name": "San Pedro"}],
        }
        responses = {
            ("GET", "/"): json_response({"version": "3.3.3"}),
            ("HEAD", "/itinera_test"): httpx.Response(200),
            ("PUT", "/itinera_test"): httpx.Response(412, json={}),
            ("GET", "/itinera_test/trip%3A01TEST"): json_response(trip_doc),
            ("GET", "/itinera_test/_all_docs"): json_response({"rows": []}),
        }
        async with await _make_client(responses) as client:
            resp = await client.get("/api/trips/01TEST/calendar.ics")
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/calendar")
        assert 'inline; filename="itinera-01TEST.ics"' in resp.headers["content-disposition"]
        assert "BEGIN:VCALENDAR" in resp.text
        assert "X-WR-CALNAME:✈️ Chile 2026" in resp.text
