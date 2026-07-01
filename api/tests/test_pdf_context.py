"""Unit tests for the pure helpers in app.services.pdf."""

from __future__ import annotations

import pytest

from app.services.pdf import _date_range, _money, shape_trip_pdf_context


class TestMoney:
    def test_formats_amount_with_currency(self):
        assert _money(10.5, "EUR") == "10.50 EUR"

    def test_formats_zero(self):
        assert _money(0.0, "USD") == "0.00 USD"

    def test_returns_none_for_none_amount(self):
        assert _money(None, "EUR") is None


class TestDateRange:
    def test_single_day_range(self):
        assert _date_range("2026-06-01", "2026-06-01") == ["2026-06-01"]

    def test_multi_day_range(self):
        result = _date_range("2026-06-01", "2026-06-03")
        assert result == ["2026-06-01", "2026-06-02", "2026-06-03"]

    def test_reversed_dates_return_empty(self):
        assert _date_range("2026-06-10", "2026-06-01") == []

    def test_none_start_returns_empty(self):
        assert _date_range(None, "2026-06-10") == []

    def test_invalid_date_string_returns_empty(self):
        assert _date_range("not-a-date", "2026-06-10") == []


def _trip(extra: dict | None = None) -> dict:
    base = {
        "_id": "trip:01",
        "type": "trip",
        "title": "Test Trip",
        "startDate": "2026-06-01",
        "endDate": "2026-06-03",
        "homeCurrency": "EUR",
        "destinations": [{"name": "Paris"}],
    }
    if extra:
        base.update(extra)
    return base


def _item(date: str | None, title: str, order: float = 0, deleted: bool = False) -> dict:
    d = {"_id": f"itin:01:{title}", "type": "itineraryItem", "date": date, "title": title, "order": order}
    if deleted:
        d["deletedAt"] = "2026-06-01T00:00:00+00:00"
    return d


def _expense(category: str, estimate: float = 0, actual: float = 0, deleted: bool = False) -> dict:
    d = {
        "_id": f"exp:01:{category}",
        "type": "expense",
        "category": category,
        "amountEstimate": estimate,
        "amountActual": actual,
    }
    if deleted:
        d["deletedAt"] = "2026-06-01T00:00:00+00:00"
    return d


class TestShapeTripPdfContext:
    def test_empty_docs_does_not_crash(self):
        ctx = shape_trip_pdf_context([])
        assert "trip" in ctx
        assert ctx["trip"] == {}
        assert ctx["days"] == []

    def test_day_blocks_span_trip_dates(self):
        docs = [_trip(), _item("2026-06-01", "Breakfast"), _item("2026-06-02", "Lunch")]
        ctx = shape_trip_pdf_context(docs)
        dates = [b["date"] for b in ctx["days"]]
        assert "2026-06-01" in dates
        assert "2026-06-02" in dates
        assert "2026-06-03" in dates  # even if no items

    def test_soft_deleted_items_excluded(self):
        docs = [_trip(), _item("2026-06-01", "Visible"), _item("2026-06-01", "Deleted", deleted=True)]
        ctx = shape_trip_pdf_context(docs)
        day = next(b for b in ctx["days"] if b["date"] == "2026-06-01")
        titles = [i["title"] for i in day["items"]]
        assert "Visible" in titles
        assert "Deleted" not in titles

    def test_unscheduled_items_form_own_block(self):
        docs = [_trip(), _item(None, "Unscheduled")]
        ctx = shape_trip_pdf_context(docs)
        unscheduled = [b for b in ctx["days"] if b["date"] is None]
        assert len(unscheduled) == 1
        assert unscheduled[0]["label"] == "Unscheduled"

    def test_items_sorted_by_order_then_start_time(self):
        docs = [
            _trip(),
            {**_item("2026-06-01", "B"), "order": 2, "startTime": "10:00"},
            {**_item("2026-06-01", "A"), "order": 1, "startTime": "09:00"},
        ]
        ctx = shape_trip_pdf_context(docs)
        day = next(b for b in ctx["days"] if b["date"] == "2026-06-01")
        assert day["items"][0]["title"] == "A"
        assert day["items"][1]["title"] == "B"

    def test_cost_summary_aggregates_by_category(self):
        docs = [
            _trip(),
            _expense("food", estimate=100, actual=80),
            _expense("transport", estimate=200, actual=150),
        ]
        ctx = shape_trip_pdf_context(docs)
        costs = ctx["costs"]
        assert costs["hasData"] is True
        cats = {r["category"] for r in costs["rows"]}
        assert "food" in cats
        assert "transport" in cats

    def test_soft_deleted_expenses_excluded(self):
        docs = [_trip(), _expense("food", actual=100, deleted=True)]
        ctx = shape_trip_pdf_context(docs)
        assert ctx["costs"]["hasData"] is False

    def test_budget_remaining_computed(self):
        docs = [
            _trip({"budget": {"total": 500}}),
            _expense("food", actual=100),
        ]
        ctx = shape_trip_pdf_context(docs)
        assert ctx["costs"]["remaining"] is not None
        # 500 - 100 = 400
        assert "400.00" in ctx["costs"]["remaining"]

    def test_destinations_joined(self):
        docs = [_trip({"destinations": [{"name": "Paris"}, {"name": "Lyon"}]})]
        ctx = shape_trip_pdf_context(docs)
        assert "Paris" in ctx["destinations"]
        assert "Lyon" in ctx["destinations"]

    def test_checklist_grouped_by_group(self):
        docs = [
            _trip(),
            {"_id": "chk:01:A", "type": "checklistItem", "text": "Passport", "group": "Documents", "done": True, "order": 0},
            {"_id": "chk:01:B", "type": "checklistItem", "text": "Toothbrush", "group": "Packing", "done": False, "order": 0},
        ]
        ctx = shape_trip_pdf_context(docs)
        group_names = {g["name"] for g in ctx["checklist_groups"]}
        assert "Documents" in group_names
        assert "Packing" in group_names
        docs_group = next(g for g in ctx["checklist_groups"] if g["name"] == "Documents")
        assert docs_group["done"] == 1
        assert docs_group["total"] == 1
