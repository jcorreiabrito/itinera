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
import { t } from '$lib/i18n.svelte';

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

const CATEGORY_ICONS: Record<ExpenseCategory, IconComponent> = {
    transport: Bus,
    lodging: BedDouble,
    food: Utensils,
    activities: Ticket,
    shopping: ShoppingBag,
    fees: Receipt,
    other: Tag
};

const CATEGORY_KEYS: Record<ExpenseCategory, string> = {
    transport: 'cat_transport',
    lodging: 'cat_lodging',
    food: 'cat_food',
    activities: 'cat_activities',
    shopping: 'cat_shopping',
    fees: 'cat_fees',
    other: 'cat_other'
};

export const CATEGORY_META: Record<ExpenseCategory, CategoryMeta> = new Proxy({} as any, {
    get(_target, prop: string) {
        const cat = prop as ExpenseCategory;
        if (CATEGORY_ICONS[cat]) {
            return {
                label: t(CATEGORY_KEYS[cat]),
                icon: CATEGORY_ICONS[cat]
            };
        }
        return undefined;
    }
});

/** Label for an arbitrary category string (rollups key by string). */
export function categoryLabel(category: string): string {
    const key = CATEGORY_KEYS[category as ExpenseCategory];
    return key ? t(key) : t('cat_other');
}

/** Icon for an arbitrary category string. */
export function categoryIcon(category: string): IconComponent {
    return CATEGORY_ICONS[category as ExpenseCategory] ?? Tag;
}

export interface SourceMeta {
    label: string;
    icon: IconComponent;
}

const SOURCE_ICONS: Record<LinkedType, IconComponent> = {
    flight: Plane,
    reservation: BedDouble,
    itineraryItem: CalendarDays,
    trip: MapPin
};

const SOURCE_KEYS: Record<LinkedType, string> = {
    flight: 'from_flight',
    reservation: 'from_booking',
    itineraryItem: 'from_itinerary',
    trip: 'from_trip'
};

export const SOURCE_META: Record<LinkedType, SourceMeta> = new Proxy({} as any, {
    get(_target, prop: string) {
        const linked = prop as LinkedType;
        if (SOURCE_ICONS[linked]) {
            return {
                label: t(SOURCE_KEYS[linked]),
                icon: SOURCE_ICONS[linked]
            };
        }
        return undefined;
    }
});

export function sourceMeta(linkedType: LinkedType | null | undefined): SourceMeta | null {
    return linkedType ? SOURCE_META[linkedType] : null;
}

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