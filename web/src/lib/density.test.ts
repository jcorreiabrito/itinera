import { describe, expect, it } from 'vitest';
import {
	applyDensity,
	DENSITIES,
	DEFAULT_DENSITY,
	DENSITY_STORAGE_KEY,
	mirrorDensity,
	parseDensity
} from './density';

describe('parseDensity', () => {
	it('accepts both values the control offers', () => {
		for (const density of DENSITIES) {
			expect(parseDensity(density)).toBe(density);
		}
	});

	it('treats a hostile stored value as comfortable', () => {
		const hostile: unknown[] = [
			null,
			undefined,
			'',
			'COMPACT',
			' compact',
			'compact ',
			'dense',
			'0',
			0,
			1,
			true,
			{},
			[],
			'<script>alert(1)</script>'
		];
		for (const value of hostile) {
			expect(parseDensity(value), `parseDensity(${String(value)})`).toBe(DEFAULT_DENSITY);
		}
	});
});

describe('applyDensity', () => {
	it('sets the attribute the compact stylesheet keys on', () => {
		applyDensity('compact', document);
		expect(document.documentElement.dataset.density).toBe('compact');

		applyDensity('comfortable', document);
		expect(document.documentElement.dataset.density).toBe('comfortable');
	});

	it('is a no-op when there is no document', () => {
		expect(() => applyDensity('compact', null)).not.toThrow();
	});

	it('writes to the live document by default', () => {
		applyDensity('compact');
		expect(document.documentElement.dataset.density).toBe('compact');
		applyDensity('comfortable');
	});
});

describe('mirrorDensity', () => {
	it('writes the key app.html reads', () => {
		const writes: [string, string][] = [];
		mirrorDensity('compact', {
			setItem: (key, value) => {
				writes.push([key, value]);
			}
		});
		expect(writes).toEqual([[DENSITY_STORAGE_KEY, 'compact']]);
	});

	it('swallows a storage failure', () => {
		expect(() =>
			mirrorDensity('compact', {
				setItem: () => {
					throw new Error('denied');
				}
			})
		).not.toThrow();
	});
});
