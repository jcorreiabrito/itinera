import { describe, expect, it, beforeEach } from 'vitest';
import { getSuggestedFxRate, saveRates, getCachedRates, updateExchangeRates } from './currency';

describe('currency utility', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	describe('getSuggestedFxRate', () => {
		it('returns 1.0 when from and to currencies are the same', () => {
			expect(getSuggestedFxRate('USD', 'USD')).toBe(1.0);
			expect(getSuggestedFxRate('BRL', 'brl')).toBe(1.0);
		});

		it('returns null when currencies are invalid or empty', () => {
			expect(getSuggestedFxRate('', 'USD')).toBeNull();
			expect(getSuggestedFxRate('EUR', '')).toBeNull();
		});

		it('uses fallback bundled rates when no cache exists', () => {
			const rate = getSuggestedFxRate('USD', 'BRL');
			expect(rate).toBeDefined();
			expect(rate).toBe(5.65);
		});

		it('uses cached exchange rates when available in localStorage', () => {
			saveRates('USD', { BRL: 5.85, EUR: 0.95 });
			const rate = getSuggestedFxRate('USD', 'BRL');
			expect(rate).toBe(5.85);
		});

		it('inverts cached rates correctly when requested in opposite direction', () => {
			saveRates('USD', { BRL: 5.0 });
			const rate = getSuggestedFxRate('BRL', 'USD');
			expect(rate).toBeCloseTo(0.2, 4);
		});
	});

	describe('localStorage caching', () => {
		it('saves and retrieves cached exchange rates', () => {
			const rates = { EUR: 0.92, GBP: 0.78 };
			saveRates('USD', rates);
			const cached = getCachedRates('USD');
			expect(cached).toEqual(rates);
		});

		it('expires a cache entry older than the TTL', () => {
			saveRates('USD', { BRL: 5.85 });
			const key = 'itinera_fx_USD';
			const stale = JSON.parse(localStorage.getItem(key)!);
			stale.timestamp = Date.now() - 25 * 60 * 60 * 1000; // 25h ago
			localStorage.setItem(key, JSON.stringify(stale));

			expect(getCachedRates('USD')).toBeNull();
			// The stale entry is dropped, not merely ignored.
			expect(localStorage.getItem(key)).toBeNull();
			// ...so suggestions fall back to the bundled rates instead of stale ones.
			expect(getSuggestedFxRate('USD', 'BRL')).toBe(5.65);
		});

		it('keeps a cache entry inside the TTL', () => {
			saveRates('USD', { BRL: 5.85 });
			const key = 'itinera_fx_USD';
			const fresh = JSON.parse(localStorage.getItem(key)!);
			fresh.timestamp = Date.now() - 23 * 60 * 60 * 1000; // 23h ago
			localStorage.setItem(key, JSON.stringify(fresh));

			expect(getCachedRates('USD')).toEqual({ BRL: 5.85 });
		});

		it('ignores a corrupt cache entry rather than throwing', () => {
			localStorage.setItem('itinera_fx_USD', '{"rates":');
			expect(getCachedRates('USD')).toBeNull();

			localStorage.setItem('itinera_fx_EUR', JSON.stringify({ base: 'EUR' }));
			expect(getCachedRates('EUR')).toBeNull();
		});

		it('returns valid exchange rates when updateExchangeRates is called', async () => {
			const rates = await updateExchangeRates('USD');
			expect(rates).toBeDefined();
			expect(rates['BRL']).toBeGreaterThan(0);
			expect(rates['EUR']).toBeGreaterThan(0);
		});
	});
});
