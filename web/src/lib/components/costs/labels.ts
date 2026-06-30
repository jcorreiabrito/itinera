/**
 * Static metadata + tiny pure helpers for the Costs & Budget views.
 *
 * Keeps the components declarative: category labels/icons/order, the offline
 * currency list, source-badge labels for linked expenses, and small formatting
 * helpers. No domain maths lives here – all roll-ups come from $lib/db.
 */

import {
    BedDouble,
    Bus,
    CalendarDays,
    MapPin,
    Plane,
    Receipt,
    ShoppingBag,
    Tag,
    Ticket,
    Utensils
} from 'lucide-svelte';
import type { ExpenseCategory, LinkedType } from '$lib/db';
import type { IconComponent } from '$lib/types';

export interface CategoryMeta {
    label: string;
    icon: IconComponent;
}

/** Display order matching the data-model category enum. */
export const CATEGORY_ORDER: ExpenseCategory[] = [
    'transport',
    'lodging',
    'food',
    'activities',
    'shopping',
    'fees',
    'other'
];

export const CATEGORY_META: Record<ExpenseCategory, CategoryMeta> = {
    transport: { label: 'Transport', icon: Bus },
    lodging: { label: 'Lodging', icon: BedDouble },
    food: { label: 'Food', icon: Utensils },
    activities: { label: 'Activities', icon: Ticket },
    shopping: { label: 'Shopping', icon: ShoppingBag },
    fees: { label: 'Fees', icon: Receipt },
    other: { label: 'Other', icon: Tag },
};

/** Label for an arbitrary category string (rollups key by string). */
export function categoryLabel(category: string): string {
    return CATEGORY_META[category as ExpenseCategory]?.label ?? 'Other';
}

/** Icon for an arbitrary category string. */
export function categoryIcon(category: string): IconComponent {
    return CATEGORY_META[category as ExpenseCategory]?.icon ?? Tag;
}

export interface SourceMeta {
    label: string;
    icon: IconComponent;
}

/** Source-badge metadata for a linked (auto-created) expense. */
export const SOURCE_META: Record<LinkedType, SourceMeta> = {
    flight: { label: 'From flight', icon: Plane },
    reservation: { label: 'From booking', icon: BedDouble },
    itineraryItem: { label: 'From itinerary', icon: CalendarDays },
    trip: { label: 'From trip', icon: MapPin }
};

export function sourceMeta(linkedType: LinkedType | null | undefined): SourceMeta | null {
    return linkedType ? SOURCE_META[linkedType] : null;
}

/**
 * A modest set of common travel currencies for the manual-FX selectors. The
 * trip's home currency is always merged in (see `currencyOptions`).
 */
const CURRENCIES = [
    'EUR',
    'USD',
    'GBP',
    'JPY',
    'CHF',
    'CAD',
    'AUD',
    'SEK',
    'NOK',
    'DKK',
    'PLN',
    'CZK',
    'HUF',
    'MXN',
    'BRL',
    'CLP',
    'THB',
    'SGD',
    'INR',
    'AED',
    'ZAR',
    'MAD',
    'TRY'
];

/** Currency list with the trip's home currency guaranteed present and first. */
export function currencyOptions(home: string): string[] {
    const up = home.toUpperCase();
    const rest = CURRENCIES.filter((c) => c !== up);
    return [up, ...rest];
}

/** A bar/gauge tone from a used fraction (spent ÷ target). */
export function fractionTone(fraction: number | null): 'primary' | 'warning' | 'danger' {
    if (fraction == null) return 'primary';
    if (fraction > 1) return 'danger';
    if (fraction > 0.85) return 'warning';
    return 'primary';
}

/** Tailwind `fill-` class for an SVG bar tone. */
export const TONE_FILL: Record<'primary' | 'success' | 'warning' | 'danger', string> = {
    primary: 'fill-primary-600',
    success: 'fill-success',
    warning: 'fill-warning',
    danger: 'fill-danger',
};