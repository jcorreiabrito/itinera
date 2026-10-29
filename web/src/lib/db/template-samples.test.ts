/**
 * The dream template the import screen offers for download.
 *
 * It must be a valid dream plan (so the same file can be uploaded and creates
 * a trip) and must not carry document ids: a sample is a starter, not a
 * reference into someone else's plan.
 */

import { describe, expect, it } from 'vitest';
import { parseDreamTemplate } from './dream-template';
import { buildDreamTemplateSample } from './template-samples';

describe('buildDreamTemplateSample', () => {
	it('is a valid three-day dream plan with a wish and an Idea', () => {
		const sample = buildDreamTemplateSample({ defaultCurrency: 'BRL' });

		expect(sample.days.map((day) => day.day)).toEqual([1, 2, 3]);
		expect(sample.days[1].weekdayHint).toBe('sat');
		expect(sample.ideas).toHaveLength(1);
		expect(sample.days[0].items[1]).toMatchObject({ estCost: 35, currency: 'BRL' });
		expect(sample.days[1].items[0]).toMatchObject({ estCost: 20, currency: 'BRL' });
		expect(sample.ideas[0]).toMatchObject({ estCost: 18, currency: 'BRL' });

		// The starter teaches the cost shape by example as well as in prose.
		expect(sample.howTo).toMatch(/estCost/);
		expect(sample.fieldGuide?.['item.estCost']).toMatch(/total estimated cost/i);
		expect(sample.fieldGuide?.['item.currency']).toMatch(/ISO 4217/);

		const parsed = parseDreamTemplate(sample);
		expect(parsed.days).toHaveLength(3);
		expect(parsed.days[1].weekdayHint).toBe(6);
		expect(parsed.days[1].items[0].estCost).toBe(20);
		expect(parsed.ideas[0]).toMatchObject({ title: 'Museum visit for a rainy afternoon' });
		expect(parsed.ideas[0].currency).toBe('BRL');
	});

	it('carries no ids, so importing it creates fresh documents', () => {
		const sample = buildDreamTemplateSample();
		const entries = [...sample.days.flatMap((day) => day.items), ...sample.ideas];

		expect(entries.length).toBeGreaterThan(0);
		expect(entries.every((entry) => entry.id == null)).toBe(true);
	});
});
