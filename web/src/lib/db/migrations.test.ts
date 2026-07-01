/**
 * Unit tests for $lib/db/migrations.ts – pure document migration logic.
 */

import { describe, it, expect } from 'vitest';
import { migrateDoc } from './migrations';
import type { MigratableDoc } from './migrations';

const v0 = (type: string, extra: Record<string, unknown> = {}): MigratableDoc => ({
  _id: 'doc:01',
  type,
  ...extra
});

describe('migrateDoc', () => {
  it('returns unchanged with changed=false when already at target', () => {
    const doc = v0('trip', { schemaVersion: 1 });
    const result = migrateDoc(doc, 1);
    expect(result.changed).toBe(false);
    expect(result.doc).toBe(doc); // same reference
  });

  it('marks changed=true for outdated doc', () => {
    const doc = v0('trip');
    const result = migrateDoc(doc, 1);
    expect(result.changed).toBe(true);
  });

  it('v0 -> v1 trip: adds archived and deletedAt', () => {
    const doc = v0('trip');
    const { doc: migrated } = migrateDoc(doc, 1);
    expect(migrated.archived).toBe(false);
    expect(migrated.deletedAt).toBeNull();
    expect(migrated.schemaVersion).toBe(1);
  });

  it('v0 -> v1 itineraryItem: adds allDay', () => {
    const doc = v0('itineraryItem');
    const { doc: migrated } = migrateDoc(doc, 1);
    expect(migrated.allDay).toBe(false);
    expect(migrated.deletedAt).toBeNull();
  });

  it('v0 -> v1 checklistItem: adds done', () => {
    const doc = v0('checklistItem');
    const { doc: migrated } = migrateDoc(doc, 1);
    expect(migrated.done).toBe(false);
  });

  it('v0 -> v1 expense: adds paid', () => {
    const doc = v0('expense');
    const { doc: migrated } = migrateDoc(doc, 1);
    expect(migrated.paid).toBe(false);
  });

  it('v0 -> v1 unknown type: still sets deletedAt and schemaVersion', () => {
    const doc = v0('futureType');
    const { doc: migrated } = migrateDoc(doc, 1);
    expect(migrated.deletedAt).toBeNull();
    expect(migrated.schemaVersion).toBe(1);
  });

  it('does not overwrite existing non-default values', () => {
    const doc = v0('trip', { archived: true, deletedAt: '2026-01-01' });
    const { doc: migrated } = migrateDoc(doc, 1);
    // archived was already set, should not be overridden by migration
    // (migration only sets if undefined)
    expect(migrated.archived).toBe(true);
  });
});
