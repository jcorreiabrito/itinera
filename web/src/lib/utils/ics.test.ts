import { describe, it, expect } from 'vitest';
import { generateTripICS } from './ics';
import type { Trip, ItineraryItem } from '$lib/db';

describe('generateTripICS', () => {
  it('generates valid VCALENDAR content for a trip with RFC 5545 exclusive DTEND', () => {
    const trip: Trip = {
      _id: 'trip:01H1234567890ABCDEFGHJKMNP',
      type: 'trip',
      schemaVersion: 1,
      createdAt: '2026-07-26T00:00:00Z',
      updatedAt: '2026-07-26T00:00:00Z',
      deletedAt: null,
      archived: false,
      stage: 'planning',
      title: 'Summer in Kyoto',
      destinations: [{ name: 'Kyoto, Japan' }],
      startDate: '2026-08-01',
      endDate: '2026-08-07',
      notes: 'Exciting trip to Japan',
      tags: [],
      travelerCount: 1,
    };

    const items: ItineraryItem[] = [
      {
        _id: 'itin:01H1234567890ABCDEFGHJKMNQ',
        type: 'itineraryItem',
        schemaVersion: 1,
        createdAt: '2026-07-26T00:00:00Z',
        updatedAt: '2026-07-26T00:00:00Z',
        deletedAt: null,
        allDay: false,
        order: 0,
        tripId: '01H1234567890ABCDEFGHJKMNP',
        title: 'Visit Fushimi Inari Shrine',
        date: '2026-08-02',
        startTime: '09:00',
        location: { name: 'Fushimi Inari Taisha' },
        notes: 'Arrive early to avoid crowds',
      },
    ];

    const ics = generateTripICS(trip, items);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).toContain('SUMMARY:✈️ Summer in Kyoto');
    expect(ics).toContain('SUMMARY:Visit Fushimi Inari Shrine');
    expect(ics).toContain('LOCATION:Fushimi Inari Taisha');
    expect(ics).toContain('DTSTART;VALUE=DATE:20260801');
    expect(ics).toContain('DTEND;VALUE=DATE:20260808');
  });
});
