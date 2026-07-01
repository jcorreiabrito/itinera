"""Pydantic v2 models mirroring the CouchDB document schemas from `04-data-model.md`.

These are used for validation, typed export shaping and documentation. They are
intentionally lenient (`extra="allow"`) so that real documents carrying extra
or CouchDB-internal fields (`_attachments`, `_conflicts`, `_revisions` ...)
still validate and round-trip faithfully for exports.

Field names are Pythonic `snake_case` with `camelCase` aliases matching the
stored documents; `populate_by_name=True` means both forms parse.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

# --- Enumerations (mirrors of the doc's enum columns) ------------------------

ItineraryCategory = Literal[
    "sightseeing", "food", "transport", "lodging", "activity", "free", "other"
]
ExpenseCategory = Literal[
    "transport", "lodging", "food", "activities", "shopping", "fees", "other"
]
ReservationKind = Literal["lodging", "car", "restaurant", "activity", "transport", "other"]
ThemePref = Literal["system", "light", "dark"]

# --- Shared base ------------------------------------------------------------

class CouchDoc(BaseModel):
    """Fields shared by every document (see `04-data-model.md`)."""
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    id: str | None = Field(default=None, alias="_id")
    rev: str | None = Field(default=None, alias="_rev")
    type: str | None = None
    trip_id: str | None = Field(default=None, alias="tripId")
    created_at: str | None = Field(default=None, alias="createdAt")
    updated_at: str | None = Field(default=None, alias="updatedAt")
    deleted_at: str | None = Field(default=None, alias="deletedAt")
    schema_version: int | None = Field(default=None, alias="schemaVersion")

# --- Nested value objects ----------------------------------------------------

class Destination(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    name: str
    country: str | None = None
    lat: float | None = None
    lng: float | None = None
    arrive_date: str | None = Field(default=None, alias="arriveDate")
    depart_date: str | None = Field(default=None, alias="departDate")


class Budget(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    total: float | None = None
    by_category: dict[str, float] | None = Field(default=None, alias="byCategory")
    per_day: float | None = Field(default=None, alias="perDay")


class Geolocation(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    name: str | None = None
    address: str | None = None
    lat: float | None = None
    lng: float | None = None


class Airport(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    code: str | None = None
    name: str | None = None
    city: str | None = None
    tz: str | None = None


class FlightSegment(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    airline: str | None = None
    flight_number: str | None = Field(default=None, alias="flightNumber")
    from_: Airport | None = Field(default=None, alias="from")
    to: Airport | None = None
    depart_local: str | None = Field(default=None, alias="departLocal")
    arrive_local: str | None = Field(default=None, alias="arriveLocal")
    seat: str | None = None
    terminal: str | None = None
    gate: str | None = None
    baggage: str | None = None
    check_in_opens_at: str | None = Field(default=None, alias="checkInOpensAt")
    notes: str | None = None


class ReservationContact(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    phone: str | None = None
    email: str | None = None
    url: str | None = None


class ChecklistTemplateItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    text: str
    group: str | None = None
    order: float | None = None
    note: str | None = None
    quantity: float | None = None
    important: bool | None = None


# --- Top-level documents -----------------------------------------------------

class Trip(CouchDoc):
    type: Literal["trip"] = "trip"
    title: str | None = None
    destinations: list[Destination] = Field(default_factory=list)
    start_date: str | None = Field(default=None, alias="startDate")
    end_date: str | None = Field(default=None, alias="endDate")
    primary_timezone: str | None = Field(default=None, alias="primaryTimezone")
    archived: bool = False
    archived_at: str | None = Field(default=None, alias="archivedAt")
    home_currency: str | None = Field(default=None, alias="homeCurrency")
    budget: Budget | None = None
    cover_image_att_id: str | None = Field(default=None, alias="coverImageAttId")
    notes: str | None = None
    tags: list[str] = Field(default_factory=list)


class TripDay(CouchDoc):
    type: Literal["tripDay"] = "tripDay"
    date: str | None = None
    title: str | None = None
    notes: str | None = None


class ItineraryCostItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    id: str
    label: str = ""
    category: ExpenseCategory = "activities"
    amount: float = 0.0


class ItineraryItem(CouchDoc):
    type: Literal["itineraryItem"] = "itineraryItem"
    date: str | None = None
    all_day: bool = Field(default=False, alias="allDay")
    start_time: str | None = Field(default=None, alias="startTime")
    end_time: str | None = Field(default=None, alias="endTime")
    title: str | None = None
    category: ItineraryCategory | None = None
    location: Geolocation | None = None
    notes: str | None = None
    linked_flight_id: str | None = Field(default=None, alias="linkedFlightId")
    linked_reservation_id: str | None = Field(default=None, alias="linkedReservationId")
    est_cost: float | None = Field(default=None, alias="estCost")
    currency: str | None = None
    costs: list[ItineraryCostItem] | None = None
    order: float | None = None


class ChecklistItem(CouchDoc):
    type: Literal["checklistItem"] = "checklistItem"
    text: str | None = None
    group: str | None = None
    done: bool = False
    done_at: str | None = Field(default=None, alias="doneAt")
    due_date: str | None = Field(default=None, alias="dueDate")
    date: str | None = None
    note: str | None = None
    quantity: float | None = None
    important: bool | None = None
    order: float | None = None


class Flight(CouchDoc):
    type: Literal["flight"] = "flight"
    booking_ref: str | None = Field(default=None, alias="bookingRef")
    check_in_url: str | None = Field(default=None, alias="checkInUrl")
    segments: list[FlightSegment] = Field(default_factory=list)
    cost: float | None = None
    currency: str | None = None
    attachment_ids: list[str] = Field(default_factory=list, alias="attachmentIds")
    order: float | None = None


class Reservation(CouchDoc):
    type: Literal["reservation"] = "reservation"
    kind: ReservationKind | None = None
    name: str | None = None
    location: Geolocation | None = None
    start: str | None = None
    end: str | None = None
    confirmation: str | None = None
    cost: float | None = None
    currency: str | None = None
    contact: ReservationContact | None = None
    details: dict[str, Any] = Field(default_factory=dict)
    notes: str | None = None
    attachment_ids: list[str] = Field(default_factory=list, alias="attachmentIds")
    order: float | None = None


class Expense(CouchDoc):
    type: Literal["expense"] = "expense"
    date: str | None = None
    category: ExpenseCategory | None = None
    description: str | None = None
    amount_estimate: float | None = Field(default=None, alias="amountEstimate")
    amount_actual: float | None = Field(default=None, alias="amountActual")
    currency: str | None = None
    fx_rate: float | None = Field(default=None, alias="fxRate")
    paid: bool = False
    linked_type: str | None = Field(default=None, alias="linkedType")
    linked_id: str | None = Field(default=None, alias="linkedId")


class Attachment(CouchDoc):
    type: Literal["attachment"] = "attachment"
    filename: str | None = None
    mime: str | None = None
    size: int | None = None
    owner_type: str | None = Field(default=None, alias="ownerType")
    owner_id: str | None = Field(default=None, alias="ownerId")


class ChecklistTemplate(CouchDoc):
    type: Literal["checklistTemplate"] = "checklistTemplate"
    name: str | None = None
    is_default: bool = Field(default=False, alias="isDefault")
    items: list[ChecklistTemplateItem] = Field(default_factory=list)


class Settings(CouchDoc):
    type: Literal["settings"] = "settings"
    home_currency_default: str | None = Field(default=None, alias="homeCurrencyDefault")
    default_checklist_template_id: str | None = Field(
        default=None, alias="defaultChecklistTemplateId"
    )
    theme: ThemePref | None = None
    first_day_of_week: int | None = Field(default=None, alias="firstDayOfWeek")


# --- Registry + lenient parser -----------------------------------------------

DOC_MODELS: dict[str, type[CouchDoc]] = {
    "trip": Trip,
    "tripDay": TripDay,
    "itineraryItem": ItineraryItem,
    "checklistItem": ChecklistItem,
    "flight": Flight,
    "reservation": Reservation,
    "expense": Expense,
    "attachment": Attachment,
    "checklistTemplate": ChecklistTemplate,
    "settings": Settings,
}

#: Every document `type` we know about, in a stable order (used for grouping).
DOC_TYPES: tuple[str, ...] = tuple(DOC_MODELS.keys())


def parse_doc(raw: dict[str, Any]) -> CouchDoc:
    """Validate a raw CouchDB document into its typed model.

    Falls back to the permissive `class: CouchDoc` base when the `type` is
    unknown or the specific model rejects the payload, so callers never crash on
    unexpected data shapes.
    """
    model = DOC_MODELS.get(str(raw.get("type")), CouchDoc)
    try:
        return model.model_validate(raw)
    except ValidationError:
        return CouchDoc.model_validate(raw)
        