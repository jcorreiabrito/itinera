import { describe, expect, it } from 'vitest';
import { ensureDestinationId, formatDestinationRoute, getDestinationForDate } from './destinations';
import type { Destination } from './db';

describe('destinations helper', () => {
  it('ensureDestinationId preserves existing id or generates one', () => {
    const existing: Destination = { id: 'd123', name: 'Curitiba' };
    expect(ensureDestinationId(existing).id).toBe('d123');

    const missing: Destination = { name: 'Florianópolis' };
    const result = ensureDestinationId(missing);
    expect(result.id).toBeDefined();
    expect(result.name).toBe('Florianópolis');
  });

  it('formatDestinationRoute formats routes accurately', () => {
    expect(formatDestinationRoute([])).toBe('');

    const single: Destination[] = [{ name: 'Rome', country: 'IT' }];
    expect(formatDestinationRoute(single)).toBe('🇮🇹 Rome');

    const sameCountry: Destination[] = [
      { name: 'São Paulo', country: 'BR' },
      { name: 'Curitiba', country: 'BR' },
      { name: 'Florianópolis', country: 'BR' }
    ];
    expect(formatDestinationRoute(sameCountry)).toBe('🇧🇷 São Paulo → Curitiba → Florianópolis');
    expect(formatDestinationRoute(sameCountry, { compact: true })).toBe('🇧🇷 São Paulo +2');

    const multiCountry: Destination[] = [
      { name: 'Rome', country: 'IT' },
      { name: 'Paris', country: 'FR' }
    ];
    expect(formatDestinationRoute(multiCountry)).toBe('🇮🇹 Rome → 🇫🇷 Paris');
  });

  it('getDestinationForDate identifies active destination by date', () => {
    const dests: Destination[] = [
      { name: 'São Paulo', arriveDate: '2025-08-01', departDate: '2025-08-05' },
      { name: 'Curitiba', arriveDate: '2025-08-06', departDate: '2025-08-10' }
    ];

    expect(getDestinationForDate('2025-08-03', dests)?.name).toBe('São Paulo');
    expect(getDestinationForDate('2025-08-07', dests)?.name).toBe('Curitiba');
    expect(getDestinationForDate('2025-08-15', dests)).toBeNull();
  });
});
