"""Live iCalendar (.ics / webcal) subscription endpoint for a trip."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response

from ..couch import CouchClient
from ..deps import get_couch
from ..util import safe_filename

router = APIRouter(tags=["calendar"])


def _format_ics_date(date_str: str | None, time_str: str | None = None) -> str:
    if not date_str:
        return ""
    clean_date = date_str.replace("-", "")
    if not time_str:
        return clean_date
    clean_time = time_str.replace(":", "")[:4] + "00"
    return f"{clean_date}T{clean_time}"


def _add_one_day(date_str: str) -> str:
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d") + timedelta(days=1)
        return dt.strftime("%Y%m%d")
    except Exception:
        return date_str.replace("-", "")


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

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Itinera Trip Planner//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:✈️ {title}",
    ]

    # Master trip event
    start_date = trip.get("startDate")
    end_date = trip.get("endDate") or start_date
    if start_date:
        start_ics = _format_ics_date(start_date)
        end_ics = _add_one_day(end_date)
        notes = (trip.get("notes") or "").replace("\n", "\\n")
        lines.extend([
            "BEGIN:VEVENT",
            f"UID:trip-{trip.get('_id')}-{now_stamp}@itinera",
            f"DTSTAMP:{now_stamp}",
            f"SUMMARY:✈️ {title}",
            f"DESCRIPTION:{notes}",
            f"DTSTART;VALUE=DATE:{start_ics}",
            f"DTEND;VALUE=DATE:{end_ics}",
            "END:VEVENT",
        ])

    # Itinerary items
    for item in items:
        date_str = item.get("date")
        if not date_str:
            continue
        start_time = item.get("startTime")
        end_time = item.get("endTime")
        summary = item.get("title") or "Activity"
        notes = (item.get("notes") or "").replace("\n", "\\n")
        location = item.get("location")
        loc_str = ""
        if isinstance(location, str):
            loc_str = location
        elif isinstance(location, dict):
            loc_str = location.get("name") or location.get("address") or ""

        event_lines = [
            "BEGIN:VEVENT",
            f"UID:itin-{item.get('_id')}@itinera",
            f"DTSTAMP:{now_stamp}",
            f"SUMMARY:{summary}",
        ]
        if notes:
            event_lines.append(f"DESCRIPTION:{notes}")
        if loc_str:
            event_lines.append(f"LOCATION:{loc_str}")

        if start_time:
            dtstart = _format_ics_date(date_str, start_time)
            event_lines.append(f"DTSTART:{dtstart}")
            if end_time:
                dtend = _format_ics_date(date_str, end_time)
                event_lines.append(f"DTEND:{dtend}")
        else:
            dtstart = _format_ics_date(date_str)
            event_lines.append(f"DTSTART;VALUE=DATE:{dtstart}")
            event_lines.append(f"DTEND;VALUE=DATE:{_add_one_day(date_str)}")

        event_lines.append("END:VEVENT")
        lines.extend(event_lines)

    # Flights
    for fl in flights:
        fl_date = fl.get("departureDate") or fl.get("date")
        if not fl_date:
            continue
        dep_time = fl.get("departureTime")
        arr_time = fl.get("arrivalTime")
        airline = fl.get("airline") or ""
        fl_num = fl.get("flightNumber") or ""
        origin = fl.get("origin") or ""
        dest = fl.get("destination") or ""
        summary = f"✈️ Voo {airline} {fl_num}: {origin} -> {dest}".strip()
        lines.extend([
            "BEGIN:VEVENT",
            f"UID:flight-{fl.get('_id')}@itinera",
            f"DTSTAMP:{now_stamp}",
            f"SUMMARY:{summary}",
            f"DTSTART:{_format_ics_date(fl_date, dep_time) if dep_time else _format_ics_date(fl_date)}",
            f"DTEND:{_format_ics_date(fl_date, arr_time) if arr_time else _add_one_day(fl_date)}",
            "END:VEVENT",
        ])

    # Reservations (lodging, car rental, etc.)
    for res in reservations:
        res_date = res.get("date") or res.get("checkIn") or res.get("startDate")
        if not res_date:
            continue
        end_date = res.get("endDate") or res.get("checkOut") or res_date
        title = res.get("name") or res.get("title") or "Reserva"
        category = res.get("category") or "reserva"
        address = res.get("address") or ""
        lines.append("BEGIN:VEVENT")
        lines.append(f"UID:res-{res.get('_id')}@itinera")
        lines.append(f"DTSTAMP:{now_stamp}")
        lines.append(f"SUMMARY:🏨 Hospedagem: {title}" if category == "lodging" else f"📌 {title}")
        if address:
            lines.append(f"LOCATION:{address}")
        lines.append(f"DTSTART;VALUE=DATE:{_format_ics_date(res_date)}")
        lines.append(f"DTEND;VALUE=DATE:{_add_one_day(end_date)}")
        lines.append("END:VEVENT")

    lines.append("END:VCALENDAR")
    return "\r\n".join(lines)


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
        headers={
            "Content-Disposition": f'inline; filename="itinera-{safe_id}.ics"',
            "Cache-Control": "no-cache, no-store, must-revalidate",
        },
    )
