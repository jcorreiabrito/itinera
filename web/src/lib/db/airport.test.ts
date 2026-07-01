/**
 * Unit tests for the pure parts of $lib/db/airport.ts.
 * Uses a small fixture list to avoid loading the full bundled dataset.
 */

import { describe, it, expect } from 'vitest';
import { searchAirportsIn } from './airport';
import type { AirportRecord } from './airport';

const FIXTURES: AirportRecord[] = [
  { code: 'FCO', name: 'Fiumicino', city: 'Rome', country: 'Italy', tz: 'Europe/Rome' },
  { code: 'LHR', name: 'Heathrow', city: 'London', country: 'United Kingdom', tz: 'Europe/London' },
  { code: 'CDG', name: 'Charles de Gaulle', city: 'Paris', country: 'France', tz: 'Europe/Paris' },
  { code: 'ZRH', name: 'Zürich Airport', city: 'Zürich', country: 'Switzerland', tz: 'Europe/Zurich' },
  { code: 'JFK', name: 'John F. Kennedy', city: 'New York', country: 'United States', tz: 'America/New_York' },
  { code: 'LAX', name: 'Los Angeles International', city: 'Los Angeles', country: 'United States', tz: 'America/Los_Angeles' },
  { code: 'MAD', name: 'Adolfo Suárez Madrid-Barajas', city: 'Madrid', country: 'Spain', tz: 'Europe/Madrid' }
];

describe('searchAirportsIn', () => {
  it('returns empty array for empty query', () => {
    expect(searchAirportsIn(FIXTURES, '')).toEqual([]);
  });

  it('exact IATA code match returns that airport first', () => {
    const results = searchAirportsIn(FIXTURES, 'FCO');
    expect(results[0].code).toBe('FCO');
  });

  it('is case-insensitive for IATA code', () => {
    const results = searchAirportsIn(FIXTURES, 'fco');
    expect(results[0].code).toBe('FCO');
  });

  it('matches by city prefix', () => {
    const results = searchAirportsIn(FIXTURES, 'pari');
    expect(results[0].code).toBe('CDG');
  });

  it('matches by city substring', () => {
    const results = searchAirportsIn(FIXTURES, 'ork');
    expect(results.some((r) => r.code === 'JFK')).toBe(true);
  });

  it('respects the limit parameter', () => {
    const results = searchAirportsIn(FIXTURES, 'a', 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('handles diacritic normalisation (Zürich matches zurich)', () => {
    const results = searchAirportsIn(FIXTURES, 'zurich');
    expect(results[0].code).toBe('ZRH');
  });

  it('returns empty when no match', () => {
    const results = searchAirportsIn(FIXTURES, 'xyzzy');
    expect(results).toEqual([]);
  });

  it('matches country name', () => {
    const results = searchAirportsIn(FIXTURES, 'France');
    expect(results.some((r) => r.code === 'CDG')).toBe(true);
  });
});
