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

    it('returns valid exchange rates when updateExchangeRates is called', async () => {
      const rates = await updateExchangeRates('USD');
      expect(rates).toBeDefined();
      expect(rates['BRL']).toBeGreaterThan(0);
      expect(rates['EUR']).toBeGreaterThan(0);
    });
  });
});
