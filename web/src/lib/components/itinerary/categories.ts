/**
 * Itinerary category metadata – label + icon for each {@link ItineraryCategory}.
 *
 * Shared by the timeline rows and the edit sheet so the same icon/label pair is
 * used everywhere (category is conveyed by text *and* icon, never colour alone).
 */

import { Bus, Camera, Coffee, MapPin, Ticket, BedDouble, Utensils } from 'lucide-svelte';
import type { ItineraryCategory } from '$lib/db';
import type { IconComponent } from '$lib/types';

export interface CategoryMeta {
    label: string;
    icon: IconComponent;
}

export const CATEGORY_META: Record<ItineraryCategory, CategoryMeta> = {
    sightseeing: { label: 'Sightseeing', icon: Camera },
    food: { label: 'Food', icon: Utensils },
    transport: { label: 'Transport', icon: Bus },
    lodging: { label: 'Lodging', icon: BedDouble },
    activity: { label: 'Activity', icon: Ticket },
    free: { label: 'Free time', icon: Coffee },
    other: { label: 'Other', icon: MapPin },
};

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
    return CATEGORY_META[category ?? 'other'] ?? CATEGORY_META.other;
}