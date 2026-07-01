/**
 * Unit tests for $lib/db/ids.ts – document id builders and parsers.
 */

import { describe, it, expect } from 'vitest';
import {
  bareTripUid,
  fullTripid,
  tripid,
  dayId,
  itineraryItemId,
  checklistItemId,
  flightId,
  reservationId,
  expenseId,
  attachmentId,
  templateId,
  parseId,
  belongsToTrip,
  prefixRange,
  tripTypeRange,
  allTripsRange
} from './ids';
import { HIGH_KEY } from './constants';

const TRIP_UID = '01ABCDEFGHIJKLMNOPQRSTUVWX';
const FULL_TRIP_ID = `trip:${TRIP_UID}`;

describe('bareTripUid', () => {
  it('strips trip: prefix', () => {
    expect(bareTripUid(FULL_TRIP_ID)).toBe(TRIP_UID);
  });

  it('leaves bare UID unchanged', () => {
    expect(bareTripUid(TRIP_UID)).toBe(TRIP_UID);
  });
});

describe('fullTripid', () => {
  it('adds trip: prefix to bare UID', () => {
    expect(fullTripid(TRIP_UID)).toBe(FULL_TRIP_ID);
  });

  it('leaves full id unchanged', () => {
    expect(fullTripid(FULL_TRIP_ID)).toBe(FULL_TRIP_ID);
  });
});

describe('tripid', () => {
  it('builds trip:{id}', () => {
    expect(tripid(TRIP_UID)).toBe(FULL_TRIP_ID);
  });

  it('generates a ULID when no id provided', () => {
    const id = tripid();
    expect(id).toMatch(/^trip:[A-Z0-9]+$/);
  });
});

describe('dayId', () => {
  it('builds day:{tripUid}:{date}', () => {
    expect(dayId(FULL_TRIP_ID, '2026-06-01')).toBe(`day:${TRIP_UID}:2026-06-01`);
  });

  it('accepts bare trip uid', () => {
    expect(dayId(TRIP_UID, '2026-06-01')).toBe(`day:${TRIP_UID}:2026-06-01`);
  });
});

describe('child id builders', () => {
  it('itineraryItemId builds itin: prefix', () => {
    const id = itineraryItemId(FULL_TRIP_ID, 'CHILD');
    expect(id).toBe(`itin:${TRIP_UID}:CHILD`);
  });

  it('checklistItemId builds chk: prefix', () => {
    expect(checklistItemId(FULL_TRIP_ID, 'CHILD')).toBe(`chk:${TRIP_UID}:CHILD`);
  });

  it('flightId builds flt: prefix', () => {
    expect(flightId(FULL_TRIP_ID, 'CHILD')).toBe(`flt:${TRIP_UID}:CHILD`);
  });

  it('reservationId builds res: prefix', () => {
    expect(reservationId(FULL_TRIP_ID, 'CHILD')).toBe(`res:${TRIP_UID}:CHILD`);
  });

  it('expenseId builds exp: prefix', () => {
    expect(expenseId(FULL_TRIP_ID, 'CHILD')).toBe(`exp:${TRIP_UID}:CHILD`);
  });

  it('attachmentId builds att: prefix', () => {
    expect(attachmentId(FULL_TRIP_ID, 'CHILD')).toBe(`att:${TRIP_UID}:CHILD`);
  });

  it('templateId builds tpl: prefix', () => {
    expect(templateId('TPL')).toBe('tpl:TPL');
  });
});

describe('parseId', () => {
  it('parses trip id', () => {
    const p = parseId(FULL_TRIP_ID);
    expect(p.prefix).toBe('trip');
    expect(p.type).toBe('trip');
    expect(p.tripUid).toBe(TRIP_UID);
    expect(p.tripid).toBe(FULL_TRIP_ID);
    expect(p.id).toBe(TRIP_UID);
  });

  it('parses expense id', () => {
    const id = `exp:${TRIP_UID}:CHILD`;
    const p = parseId(id);
    expect(p.prefix).toBe('exp');
    expect(p.type).toBe('expense');
    expect(p.tripUid).toBe(TRIP_UID);
    expect(p.id).toBe('CHILD');
  });

  it('parses day id', () => {
    const id = `day:${TRIP_UID}:2026-06-01`;
    const p = parseId(id);
    expect(p.prefix).toBe('day');
    expect(p.type).toBe('tripDay');
    expect(p.id).toBe('2026-06-01');
  });

  it('parses template id', () => {
    const id = 'tpl:ABCD';
    const p = parseId(id);
    expect(p.prefix).toBe('tpl');
    expect(p.type).toBe('checklistTemplate');
    expect(p.tripUid).toBeUndefined();
  });

  it('parses settings id', () => {
    const p = parseId('settings:app');
    expect(p.prefix).toBe('settings');
    expect(p.type).toBe('settings');
  });

  it('returns undefined type for unknown prefix', () => {
    const p = parseId('unknown:foo:bar');
    expect(p.type).toBeUndefined();
  });
});

describe('belongsToTrip', () => {
  it('returns true when expense belongs to trip', () => {
    const expId = `exp:${TRIP_UID}:CHILD`;
    expect(belongsToTrip(expId, FULL_TRIP_ID)).toBe(true);
  });

  it('returns true with bare trip uid', () => {
    const expId = `exp:${TRIP_UID}:CHILD`;
    expect(belongsToTrip(expId, TRIP_UID)).toBe(true);
  });

  it('returns false for different trip', () => {
    const expId = `exp:${TRIP_UID}:CHILD`;
    expect(belongsToTrip(expId, 'trip:ZYXW')).toBe(false);
  });
});

describe('prefixRange', () => {
  it('returns startkey = prefix and endkey = prefix + HIGH_KEY', () => {
    const range = prefixRange('exp:');
    expect(range.startkey).toBe('exp:');
    expect(range.endkey).toBe(`exp:${HIGH_KEY}`);
  });
});

describe('tripTypeRange', () => {
  it('builds range for expense type', () => {
    const range = tripTypeRange('expense', FULL_TRIP_ID);
    expect(range.startkey).toBe(`exp:${TRIP_UID}:`);
    expect(range.endkey).toBe(`exp:${TRIP_UID}:${HIGH_KEY}`);
  });
});

describe('allTripsRange', () => {
  it('covers all trip: ids', () => {
    const range = allTripsRange();
    expect(range.startkey).toBe('trip:');
    expect(range.endkey).toBe(`trip:${HIGH_KEY}`);
  });
});
