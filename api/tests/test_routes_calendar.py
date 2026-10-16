"""
Integration tests for GET /api/trips/{trip_id}/calendar.ics.

The fixtures here are built from the *real* document shapes in
`web/src/lib/db/schemas.ts` (`Flight.segments[]`, `Reservation.start`/`kind`).
The previous version of this file invented `departureDate` / `airline` /
`category` fields, so it passed while the feed contained no flights and no
reservations at all.
"""

from __future__ import annotations

import re

import httpx
import pytest
from app.main import create_app
from app.routers.calendar import (
    _add_one_day,
    _escape_text,
    _fold,
    _format_ics_date,
    _normalise_time,
    _plus_one_hour,
    generate_ics,
)
from tests.conftest import json_response, make_couch, make_settings

# --- Fixtures shaped like the app's own documents ---------------------------


def make_trip(**overrides) -> dict:
    trip = {
        "_id": "trip:01TESTTRIP",
        "type": "trip",
        "title": "Viagem Teste",
        "startDate": "2026-10-15",
        "endDate": "2026-10-24",
        "destinations": [{"name": "Chile"}],
        "notes": "Primeira vez na América do Sul",
        "updatedAt": "2026-10-01T09:00:00.000Z",
    }
    trip.update(overrides)
    return trip


def make_item(**overrides) -> dict:
    item = {
        "_id": "itin:01TESTTRIP:01ITEM",
        "type": "itineraryItem",
        "title": "Passeio Valle de la Luna",
        "date": "2026-10-18",
        "startTime": "14:00",
        "endTime": "18:00",
        "category": "sightseeing",
        "location": {"name": "Valle de la Luna", "address": "San Pedro de Atacama"},
        "notes": "Levar água e casaco",
        "updatedAt": "2026-10-02T09:00:00.000Z",
    }
    item.update(overrides)
    return item


def make_flight(**overrides) -> dict:
    flight = {
        "_id": "flt:01TESTTRIP:01FLIGHT",
        "type": "flight",
        "bookingRef": "ABC123",
        "segments": [
            {
                "airline": "LATAM",
                "flightNumber": "LA123",
                "from": {"code": "GRU", "city": "São Paulo"},
                "to": {"code": "CJC", "city": "Calama"},
                "departLocal": "2026-10-17T08:00",
                "arriveLocal": "2026-10-17T10:30",
            }
        ],
        "updatedAt": "2026-10-03T09:00:00.000Z",
    }
    flight.update(overrides)
    return flight


def make_reservation(**overrides) -> dict:
    res = {
        "_id": "res:01TESTTRIP:01RES",
        "type": "reservation",
        "kind": "lodging",
        "name": "Hotel San Pedro",
        "start": "2026-10-17T15:00",
        "end": "2026-10-24T11:00",
        "location": {"name": "Calle Caracoles 123", "address": "San Pedro de Atacama"},
        "confirmation": "CONF-9",
        "updatedAt": "2026-10-04T09:00:00.000Z",
    }
    res.update(overrides)
    return res


def parsing_ics(ics: str) -> list[str]:
    """Unfold to logical lines, the way a conforming parser does."""
    logical: list[str] = []
    for line in ics.split("\r\n"):
        if line.startswith(" ") and logical:
            logical[-1] += line[1:]
        elif line:
            logical.append(line)
    return logical


def props(ics: str) -> dict[str, list[str]]:
    """The calendar-level properties, i.e. the ones outside every VEVENT."""
    out: dict[str, list[str]] = {}
    in_event = False
    for line in parsing_ics(ics):
        if line == "BEGIN:VEVENT":
            in_event = True
        elif line == "END:VEVENT":
            in_event = False
        elif not in_event and line not in ("BEGIN:VCALENDAR", "END:VCALENDAR"):
            name, _, value = line.partition(":")
            out.setdefault(name, []).append(value)
    return out


def events(ics: str) -> dict[str, dict[str, list[str]]]:
    """`UID` -> that event's properties, so assertions stay per-event."""
    out: dict[str, dict[str, list[str]]] = {}
    current: dict[str, list[str]] | None = None
    for line in parsing_ics(ics):
        if line == "BEGIN:VEVENT":
            current = {}
        elif line == "END:VEVENT":
            if current is not None and "UID" in current:
                out[current["UID"][0]] = current
            current = None
        elif current is not None:
            name, _, value = line.partition(":")
            current.setdefault(name, []).append(value)
    return out


def event(ics: str, uid_part: str) -> dict[str, list[str]]:
    """The single event whose UID contains `uid_part`."""
    matches = {uid: p for uid, p in events(ics).items() if uid_part in uid}
    assert len(matches) == 1, f"expected one event matching {uid_part!r}, got {list(matches)}"
    return next(iter(matches.values()))


# --- Date/time primitives ---------------------------------------------------


def test_format_ics_date():
    assert _format_ics_date(None) == ""
    assert _format_ics_date("2026-10-15") == "20261015"
    assert _format_ics_date("2026-10-15", "14:30") == "20261015T143000"
    # A hand-edited document can carry a single-digit hour, which the old
    # `replace(":", "")[:4] + "00"` turned into the five-character `90000`.
    assert _format_ics_date("2026-10-15", "9:00") == "20261015T090000"
    assert _format_ics_date("not a date") == ""


def test_normalise_time():
    assert _normalise_time(None) is None
    assert _normalise_time("") is None
    assert _normalise_time("14:30") == "143000"
    assert _normalise_time("9:00") == "090000"
    assert _normalise_time("1430") == "143000"
    assert _normalise_time("14:30:15") == "143015"
    assert _normalise_time("--") is None


def test_plus_one_hour():
    assert _plus_one_hour("193000") == "203000"
    assert _plus_one_hour("233000") == "003000"  # wraps past midnight
    assert _plus_one_hour(None) is None


def test_add_one_day():
    assert _add_one_day("2026-10-15") == "20261016"
    assert _add_one_day("2026-12-31") == "20270101"
    assert _add_one_day(None) == ""


# --- TEXT escaping and folding (RFC 5545 §3.1, §3.3.11) ---------------------


def test_escape_text():
    assert _escape_text("Dinner, then fado; late") == "Dinner\\, then fado\\; late"
    assert _escape_text("back\\slash") == "back\\\\slash"
    assert _escape_text("two\nlines") == "two\\nlines"
    assert _escape_text("crlf\r\nhere") == "crlf\\nhere"
    # CONTROL characters would truncate the line in a strict parser.
    assert _escape_text("bell\x07here") == "bellhere"
    # TAB is the one control character the grammar permits.
    assert _escape_text("a\tb") == "a\tb"


def test_fold_respects_the_75_octet_limit():
    line = "DESCRIPTION:" + "a" * 200
    folded = _fold(line)
    assert all(len(part.encode("utf-8")) <= 75 for part in folded)
    # Continuations carry exactly one leading space, and rejoining restores it.
    assert all(part.startswith(" ") for part in folded[1:])
    assert "".join([folded[0], *(p[1:] for p in folded[1:])]) == line


def test_fold_counts_octets_not_characters():
    # 'ã' is two octets, so a character-based slice would overrun and could
    # split the character in half.
    folded = _fold("SUMMARY:" + "ã" * 60)
    assert all(len(part.encode("utf-8")) <= 75 for part in folded)
    for part in folded:
        part.encode("utf-8").decode("utf-8")  # would raise on a split character


def test_fold_leaves_short_lines_alone():
    assert _fold("SUMMARY:trip") == ["SUMMARY:trip"]


# --- Whole-feed behaviour ---------------------------------------------------


def test_generate_ics_includes_every_document_type():
    ics = generate_ics(make_trip(), [make_item()], [make_flight()], [make_reservation()])
    assert "Passeio Valle de la Luna" in ics
    assert "LA123" in ics  # the flight, which never used to appear
    assert "Hotel San Pedro" in ics  # nor the reservation
    assert len(events(ics)) == 4


def test_uids_are_stable_across_regenerations():
    """
    The trip UID used to embed the render timestamp, so every poll looked like
    a new event and a refreshing subscription accumulated duplicates.
    """
    args = (make_trip(), [make_item()], [make_flight()], [make_reservation()])
    first = sorted(events(generate_ics(*args)))
    second = sorted(events(generate_ics(*args)))
    assert first == second
    assert len(set(first)) == len(first) == 4  # unique within one feed


def test_dtstamp_comes_from_the_document_not_the_clock():
    ics = generate_ics(make_trip(), [make_item()], [], [])
    assert "DTSTAMP:20261002T090000Z" in ics
    assert "LAST-MODIFIED:20261002T090000Z" in ics


def test_flight_segment_properties():
    ics = generate_ics(make_trip(), [], [make_flight()], [])
    p = event(ics, "flt-")
    assert p["SUMMARY"] == ["✈️ LATAM LA123 GRU → CJC"]
    assert p["DTSTART"] == ["20261017T080000"]
    assert p["DTEND"] == ["20261017T103000"]
    assert p["LOCATION"] == ["GRU"]
    assert "Booking ref: ABC123" in p["DESCRIPTION"][0]
    assert p["CATEGORIES"] == ["Flight"]


def test_overnight_flight_ends_on_the_next_day():
    """
    A red-eye arrival is before its departure on the clock; the old code
    emitted a DTEND that preceded DTSTART, which clients drop.
    """
    flight = make_flight(
        segments=[
            {
                "airline": "TAP",
                "flightNumber": "TP123",
                "from": {"code": "LIS"},
                "to": {"code": "GRU"},
                "departLocal": "2026-10-17T23:30",
                "arriveLocal": "2026-10-18T06:15",
            }
        ]
    )
    p = event(generate_ics(make_trip(), [], [flight], []), "flt-")
    assert p["DTSTART"] == ["20261017T233000"]
    assert p["DTEND"] == ["20261018T061500"]
    assert p["DTEND"][0] > p["DTSTART"][0]


def test_flight_without_an_arrival_date_but_an_earlier_arrival_rolls_over():
    # Only the wall-clock times are stored; the rollover has to be inferred.
    flight = make_flight(
        segments=[{"departLocal": "2026-10-17T23:30", "arriveLocal": "06:15"}]
    )
    p = event(generate_ics(make_trip(), [], [flight], []), "flt-")
    assert p["DTEND"] == ["20261018T061500"]


def test_multiple_segments_become_multiple_events():
    flight = make_flight(
        segments=[
            {"airline": "LA", "flightNumber": "LA1", "departLocal": "2026-10-17T08:00"},
            {"airline": "LA", "flightNumber": "LA2", "departLocal": "2026-10-17T14:00"},
        ]
    )
    all_events = events(generate_ics(make_trip(), [], [flight], []))
    assert len(all_events) == 3  # the trip plus one per segment
    assert sum(1 for uid in all_events if uid.startswith("flt-")) == 2


def test_reservation_properties():
    p = event(generate_ics(make_trip(), [], [], [make_reservation()]), "res-")
    assert p["SUMMARY"] == ["🏨 Hotel San Pedro"]
    assert p["CATEGORIES"] == ["Lodging"]
    assert p["LOCATION"] == ["Calle Caracoles 123"]
    assert p["DESCRIPTION"] == ["Confirmation: CONF-9"]
    assert p["DTSTART"] == ["20261017T150000"]
    assert p["DTEND"] == ["20261024T110000"]


def test_all_day_reservation_spans_dates_exclusively():
    res = make_reservation(start="2026-10-17", end="2026-10-24")
    p = event(generate_ics(make_trip(), [], [], [res]), "res-")
    assert p["DTSTART;VALUE=DATE"] == ["20261017"]
    assert p["DTEND;VALUE=DATE"] == ["20261025"]


def test_timed_event_without_an_end_is_an_hour_long():
    # A zero-length event renders as nothing in a month grid.
    item = make_item(endTime=None)
    p = event(generate_ics(make_trip(), [item], [], []), "itin-")
    assert p["DTSTART"] == ["20261018T140000"]
    assert p["DTEND"] == ["20261018T150000"]


def test_all_day_item():
    item = make_item(startTime=None, endTime=None)
    p = event(generate_ics(make_trip(), [item], [], []), "itin-")
    assert p["DTSTART;VALUE=DATE"] == ["20261018"]
    assert p["DTEND;VALUE=DATE"] == ["20261019"]


def test_master_event_carries_the_destination():
    ics = generate_ics(make_trip(), [], [], [])
    p = event(ics, "trip-")
    assert p["LOCATION"] == ["Chile"]
    assert p["SUMMARY"] == ["✈️ Viagem Teste"]
    assert p["DTSTART;VALUE=DATE"] == ["20261015"]
    assert p["DTEND;VALUE=DATE"] == ["20261025"]
    assert props(ics)["X-WR-CALNAME"] == ["✈️ Viagem Teste"]
    assert props(ics)["REFRESH-INTERVAL;VALUE=DURATION"] == ["PT1H"]


def test_punctuation_in_user_text_survives_a_round_trip():
    """
    Unescaped, `Dinner, then fado` became two values and every comma-separated
    title was silently corrupted in the subscriber's calendar.
    """
    trip = make_trip(title="Dinner, then fado; late", notes="a, b; c\\d")
    ics = generate_ics(trip, [], [], [])
    assert "SUMMARY:✈️ Dinner\\, then fado\\; late" in parsing_ics(ics)
    assert event(ics, "trip-")["DESCRIPTION"] == ["a\\, b\\; c\\\\d"]


def test_long_notes_are_folded_and_unfold_to_the_original():
    notes = "palavra " * 40
    trip = make_trip(notes=notes)
    ics = generate_ics(trip, [], [], [])
    assert max(len(line.encode()) for line in ics.split("\r\n")) <= 75
    assert event(ics, "trip-")["DESCRIPTION"] == [notes]


def test_lines_end_with_crlf_and_the_file_is_terminated():
    ics = generate_ics(make_trip(), [], [], [])
    assert ics.endswith("END:VCALENDAR\r\n")
    assert "\n\n" not in ics.replace("\r\n", "\n")


def test_documents_missing_required_fields_are_skipped_not_fatal():
    # Half-synced documents are routine in a local-first app.
    ics = generate_ics(
        make_trip(),
        [{"_id": "i1"}, {"_id": "i2", "title": "No date"}],
        [{"_id": "f1", "segments": [None, {}, {"departLocal": ""}]}],
        [{"_id": "r1"}, {"_id": "r2", "start": None}],
    )
    assert ics.count("BEGIN:VEVENT") == 1  # just the trip
    assert "END:VCALENDAR" in ics


@pytest.mark.parametrize("bad", ["", "   ", "T", "2026-10"])
def test_undeclarable_dates_do_not_emit_a_broken_event(bad):
    all_events = events(generate_ics(make_trip(), [], [], [make_reservation(start=bad)]))
    assert list(all_events) == ["trip-01TESTTRIP@itinera"]  # trip only, no reservation
    assert all(p.get("DTSTART;VALUE=DATE", [""])[0] for p in all_events.values())


# --- Endpoint ---------------------------------------------------------------


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
            ("GET", "/itinera_test/trip%3Anonexistent"): httpx.Response(
                404, json={"error": "not_found"}
            ),
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
            "startDate": "2026-10-15",
            "endDate": "2026-10-24",
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
        assert re.search(r"DTSTART;VALUE=DATE:20261015", resp.text)
