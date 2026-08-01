"""Unit tests for the pure helpers in app.services.pdf."""

from __future__ import annotations

import pytest

from app.services.pdf import (
    _date_range,
    _money,
    render_markdown,
    render_trip_html,
    shape_trip_pdf_context,
)


class TestMoney:
    def test_formats_amount_with_currency(self):
        assert _money(10.5, "EUR") == "€ 10.50"

    def test_formats_zero(self):
        assert _money(0.0, "USD") == "$ 0.00"

    def test_formats_brl(self):
        assert _money(140.5, "BRL") == "R$ 140,50"

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


def _item(date: str | None, title: str, order: float = 0, deleted: bool = False, **kwargs) -> dict:
    d = {"_id": f"itin:01:{title}", "type": "itineraryItem", "date": date, "title": title, "order": order}
    if deleted:
        d["deletedAt"] = "2026-06-01T00:00:00+00:00"
    d.update(kwargs)
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

    def test_calendar_grid_shaping(self):
        docs = [
            _trip(),
            _item("2026-06-01", "Morning Coffee", startTime="08:30", endTime="09:30"),
            _item("2026-06-01", "Lunch", startTime="12:00", endTime="13:30"),
            _item("2026-06-01", "Hotel Check-in", startTime=None),  # All-day
        ]
        ctx = shape_trip_pdf_context(docs)
        assert "calendar_grid" in ctx
        grid = ctx["calendar_grid"]
        assert grid["has_data"] is True
        assert grid["start_hour"] <= 8
        assert grid["end_hour"] >= 14
        day1 = grid["days"][0]
        assert len(day1["timed"]) == 2
        assert len(day1["all_day"]) == 1
        assert day1["timed"][0]["title"] == "Morning Coffee"
        assert day1["all_day"][0]["title"] == "Hotel Check-in"

    def test_calendar_grid_rendered_in_html(self):
        docs = [
            _trip(),
            _item("2026-06-01", "Eiffel Tower Visit", startTime="10:00", endTime="12:00"),
        ]
        ctx = shape_trip_pdf_context(docs)
        html_page = render_trip_html(ctx)
        assert '<section class="cal-grid-section">' in html_page
        assert "Trip Overview" in html_page
        assert "Eiffel Tower Visit" in html_page

    def test_calendar_grid_chunking(self):
        # 9 day trip: 2026-06-01 to 2026-06-09
        docs = [
            _trip({"startDate": "2026-06-01", "endDate": "2026-06-09"}),
            _item("2026-06-01", "Activity 1", startTime="10:00", endTime="11:00"),
            _item("2026-06-08", "Activity 2", startTime="14:00", endTime="16:00"),
        ]
        ctx = shape_trip_pdf_context(docs)
        grid = ctx["calendar_grid"]
        assert len(grid["chunks"]) == 2
        assert len(grid["chunks"][0]["days"]) == 5
        assert len(grid["chunks"][1]["days"]) == 4
        assert grid["chunks"][0]["chunk_index"] == 1
        assert grid["chunks"][1]["chunk_index"] == 2
        html_page = render_trip_html(ctx)
        assert "Part 1 of 2" in html_page
        assert "Part 2 of 2" in html_page



class TestRenderMarkdown:
    def test_renders_lists(self):
        text = "- Natal Luz, 41ª edição\n- Acendimento das Luzes"
        html_out = render_markdown(text)
        assert '<ul class="note-list">' in html_out
        assert "<li>Natal Luz, 41ª edição</li>" in html_out
        assert "<li>Acendimento das Luzes</li>" in html_out

    def test_renders_headings_and_bold(self):
        text = "# Gramado Tips\nDon't forget your **coat** and *gloves*."
        html_out = render_markdown(text)
        assert '<div class="note-h1">Gramado Tips</div>' in html_out
        assert "<strong>coat</strong>" in html_out
        assert "<em>gloves</em>" in html_out

    def test_render_trip_html_with_markdown(self):
        ctx = shape_trip_pdf_context([_trip({"notes": "# Important Notes\n- Pack boots\n- Book tickets"})])
        html_page = render_trip_html(ctx)
        assert '<section class="trip-notes">' in html_page
        assert '<div class="note-h1">Important Notes</div>' in html_page
        assert "<li>Pack boots</li>" in html_page
