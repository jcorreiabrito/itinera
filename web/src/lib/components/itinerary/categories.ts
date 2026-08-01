import { Bus, Camera, Coffee, MapPin, Ticket, BedDouble, Utensils } from 'lucide-svelte';
import type { ItineraryCategory } from '$lib/db';
import type { IconComponent } from '$lib/types';
import { t } from '$lib/i18n.svelte';

export interface CategoryMeta {
    label: string;
    icon: IconComponent;
}

const CATEGORY_ICONS: Record<ItineraryCategory, IconComponent> = {
    sightseeing: Camera,
    food: Utensils,
    transport: Bus,
    lodging: BedDouble,
    activity: Ticket,
    free: Coffee,
    other: MapPin,
};

const CATEGORY_KEYS: Record<ItineraryCategory, string> = {
    sightseeing: 'cat_sightseeing',
    food: 'cat_food',
    transport: 'cat_transport',
    lodging: 'cat_lodging',
    activity: 'cat_activity',
    free: 'cat_free',
    other: 'cat_other'
};

export const CATEGORY_META: Record<ItineraryCategory, CategoryMeta> = new Proxy({} as any, {
    get(_target, prop: string) {
        const cat = prop as ItineraryCategory;
        if (CATEGORY_ICONS[cat]) {
            return {
                label: t(CATEGORY_KEYS[cat]),
                icon: CATEGORY_ICONS[cat]
            };
        }
        return undefined;
    }
});

/** Display order for the category picker. */
export const CATEGORY_ORDER: ItineraryCategory[] = [
    'sightseeing',
    'food',
    'transport',
    'lodging',
    'activity',
    'free',
    'other'
];

/** Label + Icon for a (possibly missing) category, falling back to "Other". */
export function categoryMeta(category: ItineraryCategory | undefined | null): CategoryMeta {
    const key = category ?? 'other';
    return CATEGORY_META[key] ?? CATEGORY_META.other;
}