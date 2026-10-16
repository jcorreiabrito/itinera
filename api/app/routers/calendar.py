"""Live iCalendar (.ics / webcal) subscription endpoint for a trip.

The feed is generated fresh from the trip's CouchDB documents on every request,
so it has to survive whatever the user typed into them. Two families of bug
lived here and neither shows up in a casual look at the output:

* **Values were interpolated raw.** RFC 5545 gives `TEXT` values an escape
  syntax (`\\\\`, `\\;`, `\\,`, `\\n`) and caps a physical line at 75 octets. A
  title like `Dinner, then fado` became two values, and every note longer than
  75 characters produced a malformed line. Both are ordinary user input.
* **The document fields were wrong.** Flights were read as `departureDate` /
  `airline` / `origin` and reservations as `date` / `category` / `address`.
  The real documents (`web/src/lib/db/schemas.ts`, `app/models.py`) carry
  `segments[]` with `departLocal` / `from` / `to`, and `start` / `kind` /
  `location`. Every lookup returned `None`, so the feed silently contained only
  the trip event and the itinerary items: the two things most worth having on
  your phone were the two that never appeared.

Both are fixed below, and `api/tests/test_routes_calendar.py` pins the shape
against documents built from the real schemas rather than hand-written dicts.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response

from ..couch import CouchClient
from ..deps import get_couch
from ..util import safe_filename

router = APIRouter(tags=["calendar"])

# RFC 5545 §3.1: a content line is at most 75 octets, continuations prefixed
# with a single space.
_MAX_OCTETS = 75

# CONTROL characters have no representation in a `TEXT` value; TAB is the one
# exception the grammar allows. A raw CR would end the line early.
_CONTROL = {chr(code) for code in range(0x20)} - {"\t"} | {"\x7f"}

# Emoji stand in for the document type so the summary stays readable in a
# calendar list. They lead the summary instead of a localized noun ("Voo",
# "Hospedagem") because this endpoint has no locale to localize with and a
# Portuguese word in an English subscriber's calendar is worse than a glyph.
_KIND_EMOJI = {
    "lodging": "🏨",
    "car": "🚗",
    "restaurant": "🍽️",
    "activity": "🎟️",
    "transport": "🚆",
    "other": "📌",
}


def _escape_text(value: Any) -> str:
    """Escape a value for a `TEXT`-valued property (RFC 5545 §3.3.11)."""
    text = "" if value is None else str(value)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    # Backslash first, or it would double the escapes added after it.
    text = text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,")
    text = text.replace("\n", "\\n")
    return "".join(ch for ch in text if ch not in _CONTROL)


def _fold(line: str) -> list[str]:
    """
    Split one content line to the 75-*octet* limit of RFC 5545 §3.1.

    The limit is octets, not characters, and the continuation is a single
    leading space — so a `line[i:i + 75]` slice both miscounts accented text
    (two octets in UTF-8) and can cut a multi-byte character in half, which a
    strict parser rejects outright rather than repairing. Titles and notes are
    free text and routinely exceed the limit.
    """
    if len(line.encode("utf-8")) <= _MAX_OCTETS:
        return [line]
    parts: list[str] = []
    current = ""
    used = 0
    limit = _MAX_OCTETS
    for ch in line:
        width = len(ch.encode("utf-8"))
        if used + width > limit:
            parts.append(current)
            current, used, limit = "", 0, _MAX_OCTETS - 1  # the leading space
        current += ch
        used += width
    parts.append(current)
    return [parts[0], *(f" {part}" for part in parts[1:])]


def _normalise_time(value: Any) -> str | None:
    """`"14:30"` / `"9:00"` / `"1430"` -> `"143000"`, or `None` if not a time.

    The hour is zero-padded before the seconds are appended, so a single-digit
    hour that survived a hand-edited document yields `090000` rather than the
    five-character `90000` the old `replace(":", "")[:4] + "00"` produced.
    """
    if not value:
        return None
    digits = re.sub(r"\D", "", str(value))
    if len(digits) < 3:
        return None
    return digits.zfill(4).ljust(6, "0")[:6]


def _plus_one_hour(time_str: str | None) -> str | None:
    """`"193000"` -> `"203000"`, wrapping past midnight back to `"003000"`."""
    normalised = _normalise_time(time_str)
    if normalised is None:
        return None
    hours = (int(normalised[:2]) + 1) % 24
    return f"{hours:02d}{normalised[2:]}"


def _split_local(value: Any) -> tuple[str | None, str | None]:
    """
    Split a stored local value into `(date, time)`.

    Handles all three shapes that reach here: `"2026-10-17T08:00"` (a
    `datetime-local` input), `"2026-10-17"` (a date input) and `"06:15"` (a
    bare time, which is what `arriveLocal` holds when only the clock was
    filled in). Treating the last of those as a date is how an overnight
    flight ended up with a `DTEND` on the wrong day.
    """
    if not value:
        return None, None
    head, sep, tail = str(value).partition("T")
    if sep:
        return head or None, tail or None
    # No separator: an 8-digit run is a date, anything shorter is a clock time.
    if re.sub(r"\D", "", head) and len(re.sub(r"\D", "", head)) < 8:
        return None, head
    return head or None, None


def _format_ics_date(date_str: str | None, time_str: str | None = None) -> str:
    if not date_str:
        return ""
    clean_date = re.sub(r"\D", "", str(date_str))[:8]
    if len(clean_date) != 8:
        return ""
    time_part = _normalise_time(time_str)
    return f"{clean_date}T{time_part}" if time_part else clean_date


def _next_day_iso(iso_date: str | None) -> str:
    """`"2026-10-17"` -> `"2026-10-18"`, or `""` if it is not a date."""
    if not iso_date:
        return ""
    try:
        return (datetime.strptime(str(iso_date)[:10], "%Y-%m-%d") + timedelta(days=1)).strftime(
            "%Y-%m-%d"
        )
    except ValueError:
        return ""


def _add_one_day(date_str: str | None) -> str:
    """Next calendar day in ICS form — `DTEND` is exclusive for all-day events."""
    if not date_str:
        return ""
    return _format_ics_date(_next_day_iso(date_str)) or _format_ics_date(date_str)


def _ics_stamp(value: Any, fallback: str) -> str:
    """
    ISO-8601 timestamp -> `YYYYMMDDTHHMMSSZ`.

    Used for `DTSTAMP` / `LAST-MODIFIED` so the feed is byte-identical between
    edits. `DTSTAMP` is defined as when *this revision* of the event was
    created, not when the file was served — and a feed whose events change
    timestamp on every poll makes subscribers re-process and re-notify for
    nothing.
    """
    if not value:
        return fallback
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return fallback
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(UTC)
    return parsed.strftime("%Y%m%dT%H%M%SZ")


def _location_of(value: Any) -> str:
    """A `Geolocation` document, a plain string, or nothing -> a LOCATION value."""
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return value.get("name") or value.get("address") or ""
    return ""


def _uid(doc_id: Any, suffix: str = "") -> str:
    """A stable, globally-unique UID from a document id. Doc ids read `type:hash`."""
    return f"{str(doc_id).replace(':', '-')}{suffix}@itinera"


def _event(uid: str, lines: list[str]) -> list[str]:
    return ["BEGIN:VEVENT", f"UID:{uid}", *lines, "END:VEVENT"]


def generate_ics(
    trip: dict[str, Any],
    items: list[dict[str, Any]],
    flights: list[dict[str, Any]],
    reservations: list[dict[str, Any]],
) -> str:
    now_stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    title = trip.get("title") or "Trip"
    destinations = trip.get("destinations") or []
    dest_name = destinations[0].get("name", "") if destinations else ""
    trip_stamp = _ics_stamp(trip.get("updatedAt"), now_stamp)

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Itinera Trip Planner//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{_escape_text(f'✈️ {title}')}",
        # Without these, subscribers settle into polling once a day.
        "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
        "X-PUBLISHED-TTL:PT1H",
    ]

    # --- The trip itself -----------------------------------------------------
    start_date = trip.get("startDate")
    end_date = trip.get("endDate") or start_date
    if _format_ics_date(start_date):
        master = [
            f"DTSTAMP:{trip_stamp}",
            f"LAST-MODIFIED:{trip_stamp}",
            f"SUMMARY:{_escape_text(f'✈️ {title}')}",
            f"CATEGORIES:{_escape_text('Trip')}",
        ]
        notes = trip.get("notes")
        if notes:
            master.append(f"DESCRIPTION:{_escape_text(notes)}")
        if dest_name:
            master.append(f"LOCATION:{_escape_text(dest_name)}")
        master.extend(
            [
                f"DTSTART;VALUE=DATE:{_format_ics_date(start_date)}",
                f"DTEND;VALUE=DATE:{_add_one_day(end_date)}",
            ]
        )
        # The UID is stable across regenerations on purpose. It used to embed
        # the render timestamp, which made every poll look like a brand-new
        # event to the subscriber, so a daily-refreshing feed accumulated one
        # duplicate copy of the trip per day.
        lines.extend(_event(_uid(trip.get("_id")), master))

    # --- Itinerary items -----------------------------------------------------
    for item in items:
        date_str = item.get("date")
        if not _format_ics_date(date_str):
            continue
        start_time = item.get("startTime")
        end_time = item.get("endTime")
        stamp = _ics_stamp(item.get("updatedAt"), now_stamp)
        event = [
            f"DTSTAMP:{stamp}",
            f"LAST-MODIFIED:{stamp}",
            f"SUMMARY:{_escape_text(item.get('title') or 'Activity')}",
        ]
        if item.get("category"):
            event.append(f"CATEGORIES:{_escape_text(item['category'])}")
        if item.get("notes"):
            event.append(f"DESCRIPTION:{_escape_text(item['notes'])}")
        loc = _location_of(item.get("location"))
        if loc:
            event.append(f"LOCATION:{_escape_text(loc)}")

        if start_time:
            event.append(f"DTSTART:{_format_ics_date(date_str, start_time)}")
            end = _normalise_time(end_time)
            if end and end != _normalise_time(start_time):
                event.append(f"DTEND:{_format_ics_date(date_str, end_time)}")
            else:
                # See `_plus_one_hour`: an event with no end renders as nothing
                # in a month grid, and `endTime` is optional in the schema.
                event.append(f"DTEND:{_format_ics_date(date_str, _plus_one_hour(start_time))}")
        else:
            event.append(f"DTSTART;VALUE=DATE:{_format_ics_date(date_str)}")
            event.append(f"DTEND;VALUE=DATE:{_add_one_day(date_str)}")
        lines.extend(_event(_uid(item.get("_id")), event))

    # --- Flights, one event per segment --------------------------------------
    #
    # Times are written as *floating* local times (no `Z`, no `TZID`). The
    # documents store the wall-clock time printed on the ticket with no offset,
    # so declaring a timezone would be inventing one; floating at least matches
    # what the boarding pass says.
    for flight in flights:
        booking_ref = flight.get("bookingRef") or ""
        currency = flight.get("currency") or ""
        stamp = _ics_stamp(flight.get("updatedAt"), now_stamp)
        for index, seg in enumerate(flight.get("segments") or []):
            if not isinstance(seg, dict):
                continue
            depart_date, depart_time = _split_local(seg.get("departLocal"))
            if not _format_ics_date(depart_date):
                continue
            arrive_date, arrive_time = _split_local(seg.get("arriveLocal"))

            airline = seg.get("airline") or ""
            number = seg.get("flightNumber") or ""
            from_airport = seg.get("from") or {}
            to_airport = seg.get("to") or {}
            origin = from_airport.get("code") or from_airport.get("city") or ""
            dest = to_airport.get("code") or to_airport.get("city") or ""
            route = f"{origin} → {dest}" if origin or dest else ""
            heading = " ".join(part for part in (airline, number) if part)

            event = [
                f"DTSTAMP:{stamp}",
                f"LAST-MODIFIED:{stamp}",
                f"SUMMARY:{_escape_text(' '.join(p for p in (f'✈️ {heading}'.strip(), route) if p))}",
                f"CATEGORIES:{_escape_text('Flight')}",
            ]
            details = [
                f"Booking ref: {booking_ref}" if booking_ref else "",
                f"Seat: {seg['seat']}" if seg.get("seat") else "",
                f"Terminal: {seg['terminal']}" if seg.get("terminal") else "",
                f"Gate: {seg['gate']}" if seg.get("gate") else "",
                f"Baggage: {seg['baggage']}" if seg.get("baggage") else "",
                f"Cost: {flight['cost']} {currency}".strip() if flight.get("cost") else "",
                str(seg.get("notes") or ""),
            ]
            if any(details):
                event.append(f"DESCRIPTION:{_escape_text(chr(10).join(d for d in details if d))}")
            if origin:
                event.append(f"LOCATION:{_escape_text(origin)}")

            event.append(f"DTSTART:{_format_ics_date(depart_date, depart_time)}")
            if arrive_time:
                # A red-eye arrival is *before* its departure on the clock, so
                # the old `DTEND == DTSTART's date + arrival time` produced an
                # end that precedes the start and clients dropped the event.
                end_date = arrive_date or depart_date
                # Both sides are normalised to `HHMMSS`, so the string compare
                # is chronological.
                if not arrive_date and depart_time and arrive_time <= depart_time:
                    end_date = _next_day_iso(depart_date) or depart_date
                event.append(f"DTEND:{_format_ics_date(end_date, arrive_time)}")
            else:
                event.append(f"DTEND:{_add_one_day(depart_date)}")
            lines.extend(_event(_uid(flight.get("_id"), f"-{index}"), event))

    # --- Reservations --------------------------------------------------------
    for res in reservations:
        start_date, start_time = _split_local(res.get("start"))
        if not _format_ics_date(start_date):
            continue
        end_date, end_time = _split_local(res.get("end"))
        stamp = _ics_stamp(res.get("updatedAt"), now_stamp)

        kind = res.get("kind") or "other"
        name = res.get("name") or "Reservation"
        emoji = _KIND_EMOJI.get(str(kind), "📌")

        event = [
            f"DTSTAMP:{stamp}",
            f"LAST-MODIFIED:{stamp}",
            f"SUMMARY:{_escape_text(f'{emoji} {name}')}",
            f"CATEGORIES:{_escape_text(str(kind).title())}",
        ]
        confirmation = res.get("confirmation")
        if confirmation:
            event.append(f"DESCRIPTION:{_escape_text(f'Confirmation: {confirmation}')}")
        loc = _location_of(res.get("location"))
        if loc:
            event.append(f"LOCATION:{_escape_text(loc)}")
        if res.get("contact") and isinstance(res["contact"], dict):
            phone = res["contact"].get("phone")
            if phone:
                event.append(f"CONTACT:{_escape_text(phone)}")

        if start_time:
            event.append(f"DTSTART:{_format_ics_date(start_date, start_time)}")
            if end_time:
                event.append(f"DTEND:{_format_ics_date(end_date or start_date, end_time)}")
            else:
                # A zero-length event renders as nothing at all in a month
                # grid, which is worse than a slightly-too-short one. An hour
                # is a convention, not data; the start time is the real fact.
                event.append(f"DTEND:{_format_ics_date(start_date, _plus_one_hour(start_time))}")
        else:
            event.append(f"DTSTART;VALUE=DATE:{_format_ics_date(start_date)}")
            event.append(f"DTEND;VALUE=DATE:{_add_one_day(end_date or start_date)}")
        lines.extend(_event(_uid(res.get("_id")), event))

    lines.append("END:VCALENDAR")

    physical: list[str] = []
    for line in lines:
        physical.extend(_fold(line))
    # The trailing CRLF is part of the grammar, not cosmetic: some parsers
    # treat an unterminated final line as a truncated file.
    return "\r\n".join(physical) + "\r\n"


@router.get(
    "/trips/{trip_id}/calendar.ics",
    summary="Live iCalendar feed for a trip (subscribe via Google Calendar / Apple Calendar)",
    responses={
        200: {"content": {"text/calendar": {}}},
        404: {"description": "Trip not found"},
    },
)
async def get_trip_calendar(
    trip_id: str,
    couch: CouchClient = Depends(get_couch),
) -> Response:
    docs = await couch.get_trip_docs(trip_id)
    trip = next((d for d in docs if d.get("type") == "trip"), None)
    if not trip:
        raise HTTPException(status_code=404, detail=f"Trip {trip_id!r} not found")

    items = [d for d in docs if d.get("type") == "itineraryItem"]
    flights = [d for d in docs if d.get("type") == "flight"]
    reservations = [d for d in docs if d.get("type") == "reservation"]

    ics_content = generate_ics(trip, items, flights, reservations)
    safe_id = safe_filename(trip_id.replace(":", "-"))
    return Response(
        content=ics_content,
        media_type="text/calendar",
        # `no-store` rather than `no-cache`: a revalidating proxy in front of a
        # subscription URL is the one place a stale feed is genuinely confusing.
        headers={
            "Content-Disposition": f'inline; filename="itinera-{safe_id}.ics"',
            "Cache-Control": "no-cache, no-store, must-revalidate",
        },
    )
