/**
 * Starter JSON templates offered by the import screen.
 *
 * The dated sample lives in `NewTripSheet` next to its create flow; this module
 * holds the dream-plan sample. Both are ordinary files the user can edit
 * outside Itinera and upload again.
 */

import {
	DREAM_TEMPLATE_FIELD_GUIDE,
	DREAM_TEMPLATE_HOW_TO,
	DREAM_TEMPLATE_SCHEMA,
	DREAM_TEMPLATE_VERSION,
	type DreamTemplatePayload
} from './dream-template';

export const DREAM_TEMPLATE_SAMPLE_FILENAME = 'itinera-dream-plan-template.json';

export interface DreamTemplateSampleOptions {
	/** Home currency stamped into the sample's costs. */
	defaultCurrency?: string;
}

/**
 * A three-day dream plan with a weekday wish and one Idea, used as the
 * downloadable starter for a new dream trip.
 *
 * It carries no document ids on purpose — uploading it creates fresh items
 * rather than pointing at documents in someone else's trip.
 */
export function buildDreamTemplateSample(
	options: DreamTemplateSampleOptions = {}
): DreamTemplatePayload {
	const currency = options.defaultCurrency || 'EUR';
	return {
		schema: DREAM_TEMPLATE_SCHEMA,
		version: DREAM_TEMPLATE_VERSION,
		howTo: DREAM_TEMPLATE_HOW_TO,
		fieldGuide: { ...DREAM_TEMPLATE_FIELD_GUIDE },
		trip: { title: 'My Dream Trip' },
		days: [
			{
				day: 1,
				title: 'Arrival & first impressions',
				items: [
					{
						title: 'Settle in and wander the old town',
						category: 'free',
						allDay: true,
						order: 0
					},
					{
						title: 'Welcome dinner',
						category: 'food',
						startTime: '19:00',
						endTime: '21:00',
						order: 1,
						estCost: 35,
						currency
					}
				]
			},
			{
				day: 2,
				title: 'Market day',
				weekdayHint: 'sat',
				items: [
					{
						title: 'Saturday market',
						category: 'food',
						startTime: '09:00',
						endTime: '11:00',
						order: 0,
						estCost: 20,
						currency
					}
				]
			},
			{
				day: 3,
				title: 'A slow day',
				items: [
					{
						title: 'Free day — follow your mood',
						category: 'free',
						allDay: true,
						order: 0
					}
				]
			}
		],
		ideas: [
			{
				title: 'Museum visit for a rainy afternoon',
				category: 'sightseeing',
				order: 0,
				estCost: 18,
				currency
			}
		]
	};
}

/** Trigger a browser download for a JSON payload. */
export function downloadJsonTemplate(payload: unknown, filename: string): void {
	const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.rel = 'noopener';
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 0);
}
