/**
 * Expenses & budget repository – the money view (`docs/12-page-costs-budget.md`).
 *
 * CRUD over `expense` docs plus the roll-ups every budget view needs: per-day,
 * per-category, estimate-vs-actual, paid/unpaid and budget-remaining. All maths
 * runs through the pure helpers in `./money`, using each expense's snapshot
 * `fxRate` so historical totals stay stable.
 *
 * Also the single source of truth for **linked expenses**: flights and
 * reservations call `@link upsertLinkedExpense` / `@link removeLinkedExpense` so
 * a booking's cost rolls into the budget exactly once.
 */

import { dayDelta, eachDateInRange, todayIso, tripDayCount } from '../datetime';
import { createDoc, getDoc, listTripDocs, patchDoc, restoreDoc, softDeleteDoc } from '../base';
import { expenseId, fullTripid } from '../ids';
import {
  budgetRemaining,
  budgetUsedFraction,
  rollupByCategory,
  rollupByDay,
  sumExpenses,
  type MoneyTotals
} from '../money';
import { EXPENSE_CATEGORIES } from '../schemas';
import type { Expense, ExpenseCategory, LinkedType, Trip } from '../schemas';

/** Fields accepted when creating an expense. */
export interface NewExpenseInput {
  description: string;
  category: ExpenseCategory;
  date?: string | null;
  amountEstimate?: number | null;
  amountActual?: number | null;
  currency?: string;
  fxRate?: number | null;
  paid?: boolean;
  linkedType?: LinkedType | null;
  linkedId?: string | null;
  costType?: 'total' | 'per_person';
}

/** All non-deleted expenses for a trip (prefix scan, no index needed). */
export function byTrip(tripid: string): Promise<Expense[]> {
  return listTripDocs<Expense>('expense', tripid);
}

/** Expenses dated to a specific day. */
export async function byDay(tripid: string, date: string): Promise<Expense[]> {
  return (await byTrip(tripid)).filter((e) => e.date === date);
}

/** Expenses in a category. */
export async function byCategory(tripid: string, category: ExpenseCategory): Promise<Expense[]> {
  return (await byTrip(tripid)).filter((e) => e.category === category);
}

/** Fetch one expense. */
export function get(id: string): Promise<Expense | null> {
  return getDoc<Expense>(id);
}

/** Create an expense. */
export function create(tripid: string, input: NewExpenseInput): Promise<Expense> {
  const _id = expenseId(tripid);
  return createDoc<Expense>({
    _id,
    type: 'expense',
    tripid: fullTripid(tripid),
    description: input.description,
    category: input.category,
    date: input.date ?? null,
    amountEstimate: input.amountEstimate ?? null,
    amountActual: input.amountActual ?? null,
    currency: input.currency,
    fxRate: input.fxRate ?? null,
    paid: input.paid ?? false,
    linkedType: input.linkedType ?? null,
    linkedId: input.linkedId ?? null,
    costType: input.costType ?? 'total'
  });
}

/** Patch an expense. */
export function update(id: string, patch: Partial<NewExpenseInput>): Promise<Expense> {
  return patchDoc<Expense>(id, patch as Partial<Expense>);
}

/** Toggle (or set) the paid flag. */
export async function togglePaid(id: string, paid?: boolean): Promise<Expense> {
  const current = await get(id);
  const next = paid ?? !(current?.paid ?? false);
  return patchDoc<Expense>(id, { paid: next });
}

/** Soft-delete an expense. */
export function softDelete(id: string): Promise<Expense> {
  return softDeleteDoc<Expense>(id);
}

/** Restore a soft-deleted expense. */
export function restore(id: string): Promise<Expense> {
  return restoreDoc<Expense>(id);
}

// --- Linked expenses (flights / reservations / itinerary) ---------------------

/** Arguments for upserting a booking's linked expense. */
export interface LinkedExpenseInput {
  tripid: string;
  linkedType: LinkedType;
  linkedId: string;
  category: ExpenseCategory;
  amount: number | null | undefined;
  currency?: string;
  description?: string;
  date?: string | null;
  costType?: 'total' | 'per_person';
}

/** Find the existing expense linked to a given booking, if any. */
export async function findLinked(
  tripid: string,
  linkedType: LinkedType,
  linkedId: string
): Promise<Expense | null> {
  const all = await byTrip(tripid);
  return all.find((e) => e.linkedType === linkedType && e.linkedId === linkedId) ?? null;
}

/**
 * Create or update the expense linked to a booking. The booking owns the
 * estimate (amount) and category; the user may still set `amountActual`/`paid`
 * on the expense directly. When `amount` is cleared, the linked expense is
 * soft-deleted (no budget line for a free booking).
 */
export async function upsertLinkedExpense(input: LinkedExpenseInput): Promise<Expense | null> {
  const existing = await findLinked(input.tripid, input.linkedType, input.linkedId);

  if (input.amount == null) {
    if (existing) await softDelete(existing._id);
    return null;
  }
  if (existing) {
    return patchDoc<Expense>(existing._id, {
      amountEstimate: input.amount,
      category: input.category,
      currency: input.currency,
      description: input.description,
      date: input.date ?? existing.date ?? null,
      deletedAt: null,
      costType: input.costType
    });
  }
  return create(input.tripid, {
    description: input.description ?? '',
    category: input.category,
    amountEstimate: input.amount,
    currency: input.currency,
    date: input.date ?? null,
    linkedType: input.linkedType,
    linkedId: input.linkedId,
    costType: input.costType
  });
}

/** Soft-delete the expense linked to a booking (called when a booking is removed). */
export async function removeLinkedExpense(
  tripid: string,
  linkedType: LinkedType,
  linkedId: string
): Promise<void> {
  const existing = await findLinked(tripid, linkedType, linkedId);
  if (existing) await softDelete(existing._id);
}

// --- Roll-ups & budget -------------------------------------------------------

async function tripContext(tripid: string): Promise<{ trip: Trip | null; home: string }> {
  const trip = await getDoc<Trip>(fullTripid(tripid));
  return { trip, home: trip?.homeCurrency ?? 'EUR' };
}

/** Headline figures: estimate, actual, spent, unpaid + budget comparison. */
export interface BudgetSummary extends MoneyTotals {
  homeCurrency: string;
  budgetTotal: number | null;
  remaining: number | null;
  usedFraction: number | null;
  /** Spent ÷ elapsed-or-total days, in home currency. */
  dailyAverage: number;
  travelerCount: number;
}

/** Compute the summary header figures for a trip. */
export async function summary(tripid: string, today: string = todayIso()): Promise<BudgetSummary> {
  const { trip, home } = await tripContext(tripid);
  const travelerCount = trip?.travelerCount ?? 1;
  const expenses = await byTrip(tripid);
  const totals = sumExpenses(expenses, home, travelerCount);
  const budgetTotal = trip?.budget?.total ?? null;

  let days = 1;
  if (trip?.startDate && trip?.endDate) {
    const total = tripDayCount(trip.startDate, trip.endDate);
    if (today < trip.startDate || today > trip.endDate) days = total;
    else days = Math.min(total, Math.max(1, dayDelta(trip.startDate, today) + 1));
  }

  return {
    ...totals,
    homeCurrency: home,
    budgetTotal,
    remaining: budgetRemaining(totals.spent, budgetTotal),
    usedFraction: budgetUsedFraction(totals.spent, budgetTotal),
    dailyAverage: totals.spent / days,
    travelerCount
  };
}

/** One day's budget row (totals + optional per-day target comparison). */
export interface DayBudgetRow {
  date: string;
  totals: MoneyTotals;
  target: number | null;
  overBudget: boolean;
}

/** Per-day roll-up across the whole trip span, plus the undated bucket. */
export interface ByDayBudget {
  homeCurrency: string;
  perDayTarget: number | null;
  days: DayBudgetRow[];
  undated: MoneyTotals;
  travelerCount: number;
}

/** Per-day totals (every trip date represented), with over-target flags. */
export async function byDayRollup(tripid: string): Promise<ByDayBudget> {
  const { trip, home } = await tripContext(tripid);
  const travelerCount = trip?.travelerCount ?? 1;
  const expenses = await byTrip(tripid);
  const rollup = rollupByDay(expenses, home, travelerCount);
  const target = trip?.budget?.perDay ?? null;
  const byDate = new Map(rollup.days.map((d) => [d.date, d.totals]));
  const dates: string[] =
    trip?.startDate && trip?.endDate
      ? eachDateInRange(trip.startDate, trip.endDate)
      : (rollup.days.map((d) => d.date).filter(Boolean) as string[]);
  // Include any dated expenses that fall outside the trip span.
  for (const d of rollup.days) if (d.date && !dates.includes(d.date)) dates.push(d.date);
  dates.sort();

  const days: DayBudgetRow[] = dates.map((date) => {
    const totals = byDate.get(date) ?? {
      estimate: 0,
      actual: 0,
      spent: 0,
      unpaid: 0,
      missingRateCount: 0
    };
    return { date, totals, target, overBudget: target !== null && totals.spent > target };
  });

  return { homeCurrency: home, perDayTarget: target, days, undated: rollup.undated, travelerCount };
}

/** One category's budget row. */
export interface CategoryBudgetRow {
  category: string;
  totals: MoneyTotals;
  cap: number | null;
  overCap: boolean;
}

/** Per-category totals with cap comparison. */
export async function byCategoryRollup(tripid: string): Promise<{
  homeCurrency: string;
  categories: CategoryBudgetRow[];
  travelerCount: number;
}> {
  const { trip, home } = await tripContext(tripid);
  const travelerCount = trip?.travelerCount ?? 1;
  const expenses = await byTrip(tripid);
  const rollup = rollupByCategory(expenses, home, travelerCount);
  const caps = trip?.budget?.byCategory ?? {};

  // Categories that have spend OR a budget cap - an unused cap must still be
  // visible (today it's invisible until first spend). Emit canonical categories
  // first (then any non-canonical keys), so the stable sort below keeps a
  // deterministic order for equal spend rows (including unused caps at 0).
  const present = new Set<string>([...Object.keys(rollup), ...Object.keys(caps)]);
  const ordered = [
    ...EXPENSE_CATEGORIES.filter((category) => present.has(category)),
    ...[...present]
      .filter((category) => !(EXPENSE_CATEGORIES as readonly string[]).includes(category))
      .sort()
  ];

  const categories: CategoryBudgetRow[] = ordered.map((category) => {
    const totals = rollup[category] ?? {
      estimate: 0,
      actual: 0,
      spent: 0,
      unpaid: 0,
      missingRateCount: 0
    };
    const cap = caps[category] ?? null;
    return { category, totals, cap, overCap: cap !== null && totals.spent > cap };
  });
  categories.sort((a, b) => b.totals.spent - a.totals.spent);

  return { homeCurrency: home, categories, travelerCount };
}

/** A combined budget snapshot for dashboards (overall + per-category + per-day). */
export interface BudgetReport {
  summary: BudgetSummary;
  byDay: ByDayBudget;
  byCategory: CategoryBudgetRow[];
}

/** Everything the Costs page and the Overview budget widget need, in one call. */
export async function report(tripid: string, today: string = todayIso()): Promise<BudgetReport> {
  const [s, d, c] = await Promise.all([
    summary(tripid, today),
    byDayRollup(tripid),
    byCategoryRollup(tripid)
  ]);
  return { summary: s, byDay: d, byCategory: c.categories };
}
