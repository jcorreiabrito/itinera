import { describe, expect, it } from 'vitest';
import { deriveStatus } from './trips';
import type { Trip } from '../schemas';

describe('deriveStatus', () => {
  const baseTrip: Trip = {
    _id: 'trip:TEST123',
    type: 'trip',
    title: 'Viagem de Teste',
    startDate: '2026-08-01',
    endDate: '2026-08-10',
    homeCurrency: 'BRL',
    destinations: [],
    archived: false,
    stage: 'confirmed',
    tags: [],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    deletedAt: null,
    schemaVersion: 1,
    travelerCount: 1
  };

  const today = '2026-07-22';

  it('returns Archived if trip is archived, regardless of stage or dates', () => {
    const trip: Trip = {
      ...baseTrip,
      archived: true,
      stage: 'planning'
    };
    expect(deriveStatus(trip, today)).toBe('Archived');
  });

  it('returns Planning if stage is planning', () => {
    const trip: Trip = {
      ...baseTrip,
      stage: 'planning'
    };
    expect(deriveStatus(trip, today)).toBe('Planning');
  });

  it('returns Planning even if dates are in the past if stage is planning', () => {
    const trip: Trip = {
      ...baseTrip,
      startDate: '2025-01-01',
      endDate: '2025-01-10',
      stage: 'planning'
    };
    expect(deriveStatus(trip, today)).toBe('Planning');
  });

  it('returns Upcoming if stage is confirmed and trip starts in the future', () => {
    const trip: Trip = {
      ...baseTrip,
      startDate: '2026-08-01',
      endDate: '2026-08-10',
      stage: 'confirmed'
    };
    expect(deriveStatus(trip, today)).toBe('Upcoming');
  });

  it('returns Active if stage is confirmed and today is within trip dates', () => {
    const trip: Trip = {
      ...baseTrip,
      startDate: '2026-07-20',
      endDate: '2026-07-25',
      stage: 'confirmed'
    };
    expect(deriveStatus(trip, today)).toBe('Active');
  });

  it('returns Past if stage is confirmed and trip end date is in the past', () => {
    const trip: Trip = {
      ...baseTrip,
      startDate: '2026-07-01',
      endDate: '2026-07-10',
      stage: 'confirmed'
    };
    expect(deriveStatus(trip, today)).toBe('Past');
  });

  it('defaults to confirmed behavior if stage is omitted', () => {
    const trip: Trip = {
      ...baseTrip,
      stage: undefined as any,
      startDate: '2026-08-01',
      endDate: '2026-08-10'
    };
    expect(deriveStatus(trip, today)).toBe('Upcoming');
  });
});
