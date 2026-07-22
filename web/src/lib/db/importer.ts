/**
 * Ultra-resilient trip import parser and repository writer.
 *
 * Can parse per-trip exports (`itinera.trip-export`), full exports, raw JSON
 * payloads, or hand-crafted JSON files. Re-IDs all documents with fresh ULIDs,
 * re-links references, and writes directly into local PouchDB for immediate,
 * offline-first availability.
 */

import { ulid } from 'ulid';
import { bulkPut, getDoc, listTripDocs, nowIso } from './base';
import { SCHEMA_VERSION, TRIP_CHILD_TYPES } from './constants';
import { bareTripUid, fullTripid, parseId } from './ids';
import type { AnyDoc, Trip } from './schemas';

export interface ImportResult {
  trip: Trip;
  docCount: number;
}

const PREFIX_MAP: Record<string, string> = {
  tripDay: 'day',
  itineraryItem: 'itin',
  checklistItem: 'chk',
  flight: 'flt',
  reservation: 'res',
  expense: 'exp',
  attachment: 'att'
};

function inferTypeAndPrefix(doc: Record<string, unknown>): { type: string; prefix: string } {
  let type = typeof doc.type === 'string' ? doc.type : '';
  let prefix = '';

  const id = typeof doc._id === 'string' ? doc._id : typeof doc.id === 'string' ? doc.id : '';
  if (id.includes(':')) {
    prefix = id.split(':')[0];
  }

  if (!type && prefix) {
    const typeByPrefix: Record<string, string> = {
      trip: 'trip',
      day: 'tripDay',
      itin: 'itineraryItem',
      chk: 'checklistItem',
      flt: 'flight',
      res: 'reservation',
      exp: 'expense',
      att: 'attachment'
    };
    type = typeByPrefix[prefix] || 'unknown';
  }

  if (type && !prefix) {
    prefix = PREFIX_MAP[type] || 'doc';
  }

  return { type: type || 'unknown', prefix: prefix || 'doc' };
}

export function parseAndPrepareTripImport(payload: unknown): {
  newTripId: string;
  tripDoc: Trip;
  preparedDocs: AnyDoc[];
} {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid JSON: payload must be a JSON object');
  }

  const p = payload as Record<string, unknown>;

  // Gather candidate documents
  let rawTripDoc: Record<string, unknown> | null = null;
  const rawChildDocs: Record<string, unknown>[] = [];

  // Check top-level `trip`
  if (p.trip && typeof p.trip === 'object' && !Array.isArray(p.trip)) {
    rawTripDoc = p.trip as Record<string, unknown>;
  }

  // Check `documents` or `docs` or `items`
  const docsContainer = p.documents ?? p.docs ?? p.items;

  if (docsContainer && typeof docsContainer === 'object') {
    if (Array.isArray(docsContainer)) {
      for (const d of docsContainer) {
        if (d && typeof d === 'object' && !Array.isArray(d)) {
          const item = d as Record<string, unknown>;
          if (!rawTripDoc && (item.type === 'trip' || (typeof item._id === 'string' && item._id.startsWith('trip:')))) {
            rawTripDoc = item;
          } else {
            rawChildDocs.push(item);
          }
        }
      }
    } else {
      // Object grouped by type (e.g. { tripDay: [...], itineraryItem: [...] })
      for (const [key, val] of Object.entries(docsContainer)) {
        if (Array.isArray(val)) {
          for (const d of val) {
            if (d && typeof d === 'object' && !Array.isArray(d)) {
              const item = d as Record<string, unknown>;
              if (!rawTripDoc && (key === 'trip' || item.type === 'trip')) {
                rawTripDoc = item;
              } else if (item.type !== 'trip') {
                rawChildDocs.push(item);
              }
            }
          }
        }
      }
    }
  }

  // Fallback: If payload itself is a trip document
  if (!rawTripDoc && (p.type === 'trip' || p.title || p.startDate)) {
    rawTripDoc = p;
  }

  // Ultimate fallback: Create a default trip document
  if (!rawTripDoc) {
    rawTripDoc = {
      type: 'trip',
      title: typeof p.title === 'string' ? p.title : 'Imported Trip',
      startDate: typeof p.startDate === 'string' ? p.startDate : '',
      endDate: typeof p.endDate === 'string' ? p.endDate : '',
      homeCurrency: typeof p.homeCurrency === 'string' ? p.homeCurrency : 'EUR'
    };
  }

  const newTripUid = ulid();
  const newTripId = `trip:${newTripUid}`;
  const now = nowIso();
  const idMap: Record<string, string> = {};

  const oldTripId = typeof rawTripDoc._id === 'string' ? rawTripDoc._id : typeof rawTripDoc.id === 'string' ? rawTripDoc.id : '';
  if (oldTripId) {
    idMap[oldTripId] = newTripId;
  }

  // First pass: assign new IDs
  const allRaw = [rawTripDoc, ...rawChildDocs];
  const intermediateDocs: Record<string, unknown>[] = [];

  for (let i = 0; i < allRaw.length; i++) {
    const raw = { ...allRaw[i] };
    const oldId = typeof raw._id === 'string' ? raw._id : typeof raw.id === 'string' ? raw.id : '';
    const { type, prefix } = inferTypeAndPrefix(raw);

    let newId: string;
    if (i === 0 || type === 'trip') {
      newId = newTripId;
      raw.type = 'trip';
    } else if (type === 'tripDay') {
      const datePart = typeof raw.date === 'string' && raw.date ? raw.date : 'undated';
      newId = `day:${newTripUid}:${datePart}`;
      raw.type = 'tripDay';
    } else {
      newId = `${prefix}:${newTripUid}:${ulid()}`;
      raw.type = type;
    }

    if (oldId) {
      idMap[oldId] = newId;
    }

    // Clean internal/stale fields
    raw._id = newId;
    delete raw._rev;
    delete raw._conflicts;
    delete raw._attachments;
    delete raw.deletedAt;
    delete raw.archivedAt;

    raw.createdAt = now;
    raw.updatedAt = now;
    raw.schemaVersion = SCHEMA_VERSION;

    if (raw.type === 'trip') {
      raw.archived = false;
    } else {
      raw.tripId = newTripId;
      raw.tripid = newTripId;
    }

    intermediateDocs.push(raw);
  }

  // Second pass: remap cross-references
  const preparedDocs: AnyDoc[] = [];

  for (const doc of intermediateDocs) {
    if (typeof doc.coverImageAttId === 'string' && idMap[doc.coverImageAttId]) {
      doc.coverImageAttId = idMap[doc.coverImageAttId];
    }
    if (typeof doc.linkedFlightId === 'string' && idMap[doc.linkedFlightId]) {
      doc.linkedFlightId = idMap[doc.linkedFlightId];
    }
    if (typeof doc.linkedReservationId === 'string' && idMap[doc.linkedReservationId]) {
      doc.linkedReservationId = idMap[doc.linkedReservationId];
    }
    if (typeof doc.linkedId === 'string' && idMap[doc.linkedId]) {
      doc.linkedId = idMap[doc.linkedId];
    }
    if (typeof doc.ownerId === 'string' && idMap[doc.ownerId]) {
      doc.ownerId = idMap[doc.ownerId];
    }
    if (Array.isArray(doc.attachmentIds)) {
      doc.attachmentIds = doc.attachmentIds.map((attId) =>
        typeof attId === 'string' && idMap[attId] ? idMap[attId] : attId
      );
    }

    preparedDocs.push(doc as unknown as AnyDoc);
  }

  const tripDoc = preparedDocs.find((d) => d.type === 'trip') as unknown as Trip;

  return {
    newTripId,
    tripDoc,
    preparedDocs
  };
}

/**
 * Import a trip JSON payload directly into local PouchDB.
 * Works 100% offline, instantly available without waiting for network replication.
 */
export async function importTripToLocalDb(payload: unknown): Promise<ImportResult> {
  const { tripDoc, preparedDocs } = parseAndPrepareTripImport(payload);
  await bulkPut(preparedDocs);
  return {
    trip: tripDoc,
    docCount: preparedDocs.length
  };
}

function normalizeDocForCompare(doc: Record<string, unknown>): Record<string, unknown> {
  const clone = { ...doc };
  delete clone._rev;
  delete clone.createdAt;
  delete clone.updatedAt;
  delete clone.deletedAt;
  delete clone._conflicts;
  delete clone._attachments;
  delete clone.schemaVersion;
  return clone;
}

export function parseAndPrepareTripUpdateDocs(
  payload: unknown,
  targetTripId: string
): {
  tripDoc: Trip;
  preparedDocs: AnyDoc[];
} {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid JSON: payload must be a JSON object');
  }

  const fullTargetTripId = fullTripid(targetTripId);
  const targetTripUid = bareTripUid(fullTargetTripId);

  const p = payload as Record<string, unknown>;
  let rawTripDoc: Record<string, unknown> | null = null;
  const rawChildDocs: Record<string, unknown>[] = [];

  if (p.trip && typeof p.trip === 'object' && !Array.isArray(p.trip)) {
    rawTripDoc = p.trip as Record<string, unknown>;
  }

  const docsContainer = p.documents ?? p.docs ?? p.items;
  if (docsContainer && typeof docsContainer === 'object') {
    if (Array.isArray(docsContainer)) {
      for (const d of docsContainer) {
        if (d && typeof d === 'object' && !Array.isArray(d)) {
          const item = d as Record<string, unknown>;
          if (
            !rawTripDoc &&
            (item.type === 'trip' || (typeof item._id === 'string' && item._id.startsWith('trip:')))
          ) {
            rawTripDoc = item;
          } else {
            rawChildDocs.push(item);
          }
        }
      }
    } else {
      for (const [key, val] of Object.entries(docsContainer)) {
        if (Array.isArray(val)) {
          for (const d of val) {
            if (d && typeof d === 'object' && !Array.isArray(d)) {
              const item = d as Record<string, unknown>;
              if (!rawTripDoc && (key === 'trip' || item.type === 'trip')) {
                rawTripDoc = item;
              } else if (item.type !== 'trip') {
                rawChildDocs.push(item);
              }
            }
          }
        }
      }
    }
  }

  if (!rawTripDoc && (p.type === 'trip' || p.title || p.startDate)) {
    rawTripDoc = p;
  }

  if (!rawTripDoc) {
    rawTripDoc = {
      type: 'trip',
      title: typeof p.title === 'string' ? p.title : 'Updated Trip',
      startDate: typeof p.startDate === 'string' ? p.startDate : '',
      endDate: typeof p.endDate === 'string' ? p.endDate : '',
      homeCurrency: typeof p.homeCurrency === 'string' ? p.homeCurrency : 'EUR'
    };
  }

  const oldTripId =
    typeof rawTripDoc._id === 'string'
      ? rawTripDoc._id
      : typeof rawTripDoc.id === 'string'
        ? rawTripDoc.id
        : '';
  const oldTripUid = oldTripId ? bareTripUid(oldTripId) : '';
  const idMap: Record<string, string> = {};
  if (oldTripId) {
    idMap[oldTripId] = fullTargetTripId;
  }

  const allRaw = [rawTripDoc, ...rawChildDocs];
  const intermediateDocs: Record<string, unknown>[] = [];

  for (let i = 0; i < allRaw.length; i++) {
    const raw = { ...allRaw[i] };
    const oldId =
      typeof raw._id === 'string' ? raw._id : typeof raw.id === 'string' ? raw.id : '';
    const { type, prefix } = inferTypeAndPrefix(raw);

    let newId: string;
    if (i === 0 || type === 'trip') {
      newId = fullTargetTripId;
      raw.type = 'trip';
    } else if (oldId) {
      if (oldTripUid && oldId.includes(`:${oldTripUid}:`)) {
        newId = oldId.replace(`:${oldTripUid}:`, `:${targetTripUid}:`);
      } else {
        const parts = parseId(oldId);
        newId = `${prefix}:${targetTripUid}:${parts.id || ulid()}`;
      }
      raw.type = type;
    } else if (type === 'tripDay') {
      const datePart = typeof raw.date === 'string' && raw.date ? raw.date : 'undated';
      newId = `day:${targetTripUid}:${datePart}`;
      raw.type = 'tripDay';
    } else {
      newId = `${prefix}:${targetTripUid}:${ulid()}`;
      raw.type = type;
    }

    if (oldId) {
      idMap[oldId] = newId;
    }

    raw._id = newId;
    delete raw._rev;
    delete raw._conflicts;
    delete raw._attachments;
    delete raw.deletedAt;
    delete raw.archivedAt;

    raw.schemaVersion = SCHEMA_VERSION;

    if (raw.type === 'trip') {
      raw.archived = raw.archived ?? false;
    } else {
      raw.tripId = fullTargetTripId;
      raw.tripid = fullTargetTripId;
    }

    intermediateDocs.push(raw);
  }

  const preparedDocs: AnyDoc[] = [];

  for (const doc of intermediateDocs) {
    if (typeof doc.coverImageAttId === 'string' && idMap[doc.coverImageAttId]) {
      doc.coverImageAttId = idMap[doc.coverImageAttId];
    }
    if (typeof doc.linkedFlightId === 'string' && idMap[doc.linkedFlightId]) {
      doc.linkedFlightId = idMap[doc.linkedFlightId];
    }
    if (typeof doc.linkedReservationId === 'string' && idMap[doc.linkedReservationId]) {
      doc.linkedReservationId = idMap[doc.linkedReservationId];
    }
    if (typeof doc.linkedId === 'string' && idMap[doc.linkedId]) {
      doc.linkedId = idMap[doc.linkedId];
    }
    if (typeof doc.ownerId === 'string' && idMap[doc.ownerId]) {
      doc.ownerId = idMap[doc.ownerId];
    }
    if (Array.isArray(doc.attachmentIds)) {
      doc.attachmentIds = doc.attachmentIds.map((attId) =>
        typeof attId === 'string' && idMap[attId] ? idMap[attId] : attId
      );
    }

    preparedDocs.push(doc as unknown as AnyDoc);
  }

  const tripDoc = preparedDocs.find((d) => d.type === 'trip') as unknown as Trip;

  return {
    tripDoc,
    preparedDocs
  };
}

export interface TripUpdateDiff {
  targetTripId: string;
  added: AnyDoc[];
  updated: AnyDoc[];
  removed: AnyDoc[];
  unchanged: AnyDoc[];
  isNoOp: boolean;
  readyToSaveDocs: AnyDoc[];
}

export async function prepareTripUpdateDiff(
  targetTripId: string,
  payload: unknown
): Promise<TripUpdateDiff> {
  const fullId = fullTripid(targetTripId);
  const currentTripDoc = await getDoc<Trip>(fullId);
  if (!currentTripDoc) {
    throw new Error(`Trip not found: ${targetTripId}`);
  }

  const existingDocsMap = new Map<string, AnyDoc & { _rev?: string }>();
  existingDocsMap.set(currentTripDoc._id, currentTripDoc);

  for (const type of TRIP_CHILD_TYPES) {
    const docs = await listTripDocs<AnyDoc>(type, fullId);
    for (const doc of docs) {
      existingDocsMap.set(doc._id, doc);
    }
  }

  const { preparedDocs: incomingDocs } = parseAndPrepareTripUpdateDocs(payload, fullId);

  const added: AnyDoc[] = [];
  const updated: AnyDoc[] = [];
  const unchanged: AnyDoc[] = [];
  const incomingIds = new Set<string>();
  const now = nowIso();

  for (const incomingDoc of incomingDocs) {
    incomingIds.add(incomingDoc._id);
    const existing = existingDocsMap.get(incomingDoc._id);

    if (!existing) {
      const docWithAudit = {
        ...incomingDoc,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        schemaVersion: SCHEMA_VERSION
      } as AnyDoc;
      delete (docWithAudit as any)._rev;
      added.push(docWithAudit);
    } else {
      const normalizedExisting = normalizeDocForCompare(existing as unknown as Record<string, unknown>);
      const normalizedIncoming = normalizeDocForCompare(incomingDoc as unknown as Record<string, unknown>);

      const toSave = {
        ...incomingDoc,
        _rev: existing._rev,
        createdAt: existing.createdAt || now,
        updatedAt: now,
        deletedAt: null,
        schemaVersion: SCHEMA_VERSION
      } as AnyDoc;

      if (JSON.stringify(normalizedExisting) === JSON.stringify(normalizedIncoming)) {
        unchanged.push(toSave);
      } else {
        updated.push(toSave);
      }
    }
  }

  const removed: AnyDoc[] = [];
  for (const [id, existingDoc] of existingDocsMap.entries()) {
    if (!incomingIds.has(id)) {
      const softDeletedDoc = {
        ...existingDoc,
        updatedAt: now,
        deletedAt: now
      } as AnyDoc;
      removed.push(softDeletedDoc);
    }
  }

  const readyToSaveDocs = [...added, ...updated, ...removed];
  const isNoOp = added.length === 0 && updated.length === 0 && removed.length === 0;

  return {
    targetTripId: fullId,
    added,
    updated,
    removed,
    unchanged,
    isNoOp,
    readyToSaveDocs
  };
}

export async function executeTripUpdate(readyToSaveDocs: AnyDoc[]) {
  if (!readyToSaveDocs.length) return;
  return bulkPut(readyToSaveDocs);
}
