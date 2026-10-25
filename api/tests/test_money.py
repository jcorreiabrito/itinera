"""
Parity tests for `app/services/money.py`.

Every case here has a twin in `web/src/lib/db/money.test.ts`. That is the point:
the PDF and the screen are both "the trip", and a total that disagrees between
them is a bug the reader cannot resolve. If a rule changes on one side, this file
and its twin must change together.
"""

import pytest
from app.services.money import (
    MoneyTotals,
    budget_remaining,
    budget_used_fraction,
    convert_to_home,
    expense_amounts,
    rollup_by_category,
    rollup_by_day,
    round_money,
    sum_expenses,
)


class TestConvertToHome:
    def test_same_currency_passes_through(self):
        assert convert_to_home(100, "EUR", "EUR") == 100

    def test_null_amount_is_null(self):
        assert convert_to_home(None, "EUR", "EUR") is None

    def test_foreign_multiplies_by_rate(self):
        assert convert_to_home(100, "USD", "EUR", 0.9) == pytest.approx(90)

    def test_foreign_without_rate_is_excluded(self):
        assert convert_to_home(100, "USD", "EUR", None) is None

    def test_null_currency_is_same_currency(self):
        assert convert_to_home(50, None, "EUR") == 50

    def test_blank_rate_string_is_no_rate(self):
        # A form that submits an empty string must not become a 0-rate
        # conversion, which would silently zero the amount.
        assert convert_to_home(100, "USD", "EUR", "") is None

    def test_non_numeric_amount_is_null(self):
        assert convert_to_home("not a number", "EUR", "EUR") is None


class TestExpenseAmounts:
    def test_same_currency_expense(self):
        result = expense_amounts(
            {"amountEstimate": 100, "amountActual": 80, "currency": "EUR"}, "EUR"
        )
        assert result.estimate == 100
        assert result.actual == 80
        assert result.spent == 80  # actual ?? estimate
        assert result.missing_rate is False

    def test_missing_rate_is_flagged_and_excluded(self):
        result = expense_amounts(
            {"amountEstimate": 100, "currency": "USD", "fxRate": None}, "EUR"
        )
        assert result.missing_rate is True
        assert result.estimate is None

    def test_spent_falls_back_to_estimate(self):
        result = expense_amounts({"amountEstimate": 50, "currency": "EUR"}, "EUR")
        assert result.spent == 50


class TestSumExpenses:
    def test_sums_estimate_and_actual(self):
        expenses = [
            {"amountEstimate": 100, "amountActual": 80, "currency": "EUR"},
            {"amountEstimate": 50, "amountActual": 40, "currency": "EUR"},
        ]
        totals = sum_expenses(expenses, "EUR")
        assert totals.estimate == 150
        assert totals.actual == 120

    def test_unpaid_is_counted_separately(self):
        expenses = [
            {"amountActual": 100, "currency": "EUR", "paid": False},
            {"amountActual": 50, "currency": "EUR", "paid": True},
        ]
        totals = sum_expenses(expenses, "EUR")
        assert totals.unpaid == 100
        assert totals.spent == 150

    def test_missing_rate_count(self):
        expenses = [
            {"amountEstimate": 100, "currency": "USD", "fxRate": None},
            {"amountEstimate": 50, "currency": "EUR"},
        ]
        totals = sum_expenses(expenses, "EUR")
        assert totals.missing_rate_count == 1

    def test_per_person_multiplier(self):
        expenses = [
            {"amountActual": 100, "currency": "EUR", "paid": False, "costType": "per_person"}
        ]
        totals = sum_expenses(expenses, "EUR", 3)
        assert totals.spent == 300

    def test_per_person_multiplier_applies_to_estimate_too(self):
        # The app multiplies both buckets; a PDF that multiplied only `actual`
        # would under-report a trip that is still being planned.
        expenses = [
            {"amountEstimate": 100, "currency": "EUR", "costType": "per_person"}
        ]
        totals = sum_expenses(expenses, "EUR", 4)
        assert totals.estimate == 400
        assert totals.spent == 400

    def test_empty_list_is_zero(self):
        totals = sum_expenses([], "EUR")
        assert totals.estimate == 0
        assert totals.actual == 0
        assert totals.missing_rate_count == 0

    def test_audit_acceptance_fixture(self):
        """The §8.3 fixture: 984.00, with the rate-less item flagged not summed.

        USD 200 @ 0.92 = 184; USD 120 with no rate is excluded and counted;
        EUR 800 passes through. Home EUR, 4 travellers (none per-person).
        """
        expenses = [
            {"amountActual": 200, "currency": "USD", "fxRate": 0.92, "category": "food"},
            {
                "amountActual": 120,
                "currency": "USD",
                "fxRate": None,
                "costType": "per_person",
                "category": "food",
            },
            {"amountActual": 800, "currency": "EUR", "category": "lodging"},
        ]
        totals = sum_expenses(expenses, "EUR", 4)
        assert totals.actual == pytest.approx(984.00)
        assert totals.missing_rate_count == 1

    def test_as_dict_uses_the_camel_case_shape_the_template_reads(self):
        totals = MoneyTotals(estimate=1.0, actual=2.0, spent=2.0, unpaid=2.0)
        assert totals.as_dict() == {
            "estimate": 1.0,
            "actual": 2.0,
            "spent": 2.0,
            "unpaid": 2.0,
            "missingRateCount": 0,
        }


class TestRollupByDay:
    def test_groups_by_date(self):
        expenses = [
            {"amountActual": 10, "currency": "EUR", "date": "2026-06-01"},
            {"amountActual": 20, "currency": "EUR", "date": "2026-06-01"},
            {"amountActual": 30, "currency": "EUR", "date": "2026-06-02"},
        ]
        rollup = rollup_by_day(expenses, "EUR")
        assert len(rollup.days) == 2
        june1 = next(day for day in rollup.days if day.date == "2026-06-01")
        assert june1.totals.actual == 30

    def test_undated_goes_to_its_own_bucket(self):
        rollup = rollup_by_day([{"amountActual": 99, "currency": "EUR", "date": None}], "EUR")
        assert rollup.days == []
        assert rollup.undated.actual == 99

    def test_days_ascending(self):
        expenses = [
            {"amountActual": 1, "currency": "EUR", "date": "2026-06-03"},
            {"amountActual": 1, "currency": "EUR", "date": "2026-06-01"},
        ]
        rollup = rollup_by_day(expenses, "EUR")
        assert [day.date for day in rollup.days] == ["2026-06-01", "2026-06-03"]

    def test_day_totals_honour_per_person(self):
        expenses = [
            {
                "amountActual": 50,
                "currency": "EUR",
                "date": "2026-06-01",
                "costType": "per_person",
            }
        ]
        rollup = rollup_by_day(expenses, "EUR", 2)
        assert rollup.days[0].totals.actual == 100


class TestRollupByCategory:
    def test_groups_by_category(self):
        expenses = [
            {"amountActual": 50, "currency": "EUR", "category": "food"},
            {"amountActual": 30, "currency": "EUR", "category": "food"},
            {"amountActual": 100, "currency": "EUR", "category": "transport"},
        ]
        result = rollup_by_category(expenses, "EUR")
        assert result["food"].actual == 80
        assert result["transport"].actual == 100

    def test_missing_category_is_other(self):
        result = rollup_by_category([{"amountActual": 10, "currency": "EUR"}], "EUR")
        assert "other" in result


class TestBudget:
    def test_remaining(self):
        assert budget_remaining(200, 500) == 300

    def test_remaining_negative_when_over(self):
        assert budget_remaining(600, 500) == -100

    def test_remaining_null_when_no_budget(self):
        assert budget_remaining(200, None) is None

    def test_used_fraction(self):
        assert budget_used_fraction(250, 500) == pytest.approx(0.5)

    def test_used_fraction_null_when_no_budget(self):
        assert budget_used_fraction(100, None) is None

    def test_used_fraction_null_when_zero_budget(self):
        assert budget_used_fraction(100, 0) is None


class TestRoundMoney:
    def test_rounds_to_two_decimals(self):
        assert round_money(1.005) == 1.01

    def test_leaves_rounded_values_alone(self):
        assert round_money(10.5) == 10.5
