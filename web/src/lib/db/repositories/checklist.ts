/**
 * Checklist repository - grouped to-do lists, daily to-dos and templates
 * (`docs/99-page-checklist.md`).
 *
 * Items live in preset or custom groups; an item with a `date` is a daily to-do
 * that also surfaces on the itinerary. Provides the By-group / By-day / To-buy
 * views, progress, reorder, bulk actions, and the full template lifecycle
 * (`apply / save-as / default`).
 */

import { CHECKLIST_PRESET_GROUPS } from '../constants';
import { nowIso } from '../base';
import {
  bulkPut,
  createDoc,
  getDoc,
  listTripDocs,
  patchDoc,
  prefixScan,
  restoreDoc,
  softDeleteDoc
} from './base';
import { checklistItemId, fullTripid, templateId } from './ids';
import * as settings from './settings';
import type { ChecklistItem, ChecklistTemplate, ChecklistTemplateItem } from '../schemas';

const DAILY_GROUP = 'Daily to-dos';

/** Fields accepted when creating/updating a checklist item. */
export interface NewChecklistItemInput {
  text: string;
  group?: string;
  done?: boolean;
  dueDate?: string | null;
  date?: string | null;
  note?: string;
  quantity?: number;
  important?: boolean;
  order?: number;
}

/** All checklist items for a trip. */
export function byTrip(tripid: string): Promise<ChecklistItem[]> {
  return listTripDocs<ChecklistItem>('checklistItem', tripid);
}

/** Fetch one checklist item. */
export function get(id: string): Promise<ChecklistItem | null> {
  return getDoc<ChecklistItem>(id);
}

/** Create a checklist item. */
export function create(tripid: string, input: NewChecklistItemInput): Promise<ChecklistItem> {
  return createDoc<ChecklistItem>({
    _id: checklistItemId(tripid),
    type: 'checklistItem',
    tripid: fullTripid(tripid),
    text: input.text,
    group: input.group ?? 'Packing',
    done: input.done ?? false,
    doneAt: input.done ? nowIso() : null,
    dueDate: input.dueDate ?? null,
    date: input.date ?? null,
    note: input.note,
    quantity: input.quantity,
    important: input.important,
    order: input.order ?? 0
  });
}

/** Patch a checklist item. */
export function update(id: string, patch: Partial<NewChecklistItemInput>): Promise<ChecklistItem> {
  return patchDoc<ChecklistItem>(id, patch as Partial<ChecklistItem>);
}

/** Toggle (or set) an item's done state, stamping `doneAt`. */
export async function toggle(id: string, done?: boolean): Promise<ChecklistItem> {
  const current = await get(id);
  const next = done ?? !(current?.done ?? false);
  return patchDoc<ChecklistItem>(id, { done: next, doneAt: next ? nowIso() : null });
}

/** Soft-delete a checklist item. */
export function softDelete(id: string): Promise<ChecklistItem> {
  return softDeleteDoc<ChecklistItem>(id);
}

/** Restore a soft-deleted checklist item. */
export function restore(id: string): Promise<ChecklistItem> {
  return restoreDoc<ChecklistItem>(id);
}

/** Move an item to a different group. */
export function moveToGroup(id: string, group: string): Promise<ChecklistItem> {
  return patchDoc<ChecklistItem>(id, { group });
}

/** Reorder items within a group by assigning sequential `order` values. */
export async function reorderWithinGroup(orderedIds: string[]): Promise<void> {
  await Promise.all(orderedIds.map((id, index) => patchDoc<ChecklistItem>(id, { order: index })));
}

// --- Views ----------------------------------------------------------------

/** A group with its items and progress. */
export interface ChecklistGroupView {
  group: string;
  items: ChecklistItem[];
  done: number;
  total: number;
}

function groupKey(item: ChecklistItem): string {
  if (item.group) return item.group;
  return item.date ? DAILY_GROUP : 'Other';
}

function sortItems(a: ChecklistItem, b: ChecklistItem): number {
  // important first, then manual order, then text.
  if (!!a.important !== !!b.important) return a.important ? -1 : 1;
  if ((a.order ?? 0) !== (b.order ?? 0)) return (a.order ?? 0) - (b.order ?? 0);
  return (a.text ?? '').localeCompare(b.text ?? '');
}

function groupRank(group: string): number {
  const idx = (CHECKLIST_PRESET_GROUPS as readonly string[]).indexOf(group);
  return idx === -1 ? CHECKLIST_PRESET_GROUPS.length : idx;
}

/** Grouped "By group" view; optionally hide completed items. */
export async function groups(
  tripid: string,
  opts?: { hideCompleted?: boolean }
): Promise<ChecklistGroupView[]> {
  const items = await byTrip(tripid);
  const map = new Map<string, ChecklistItem[]>();
  for (const item of items) {
    const key = groupKey(item);
    (map.get(key) ?? map.set(key, []).get(key)!).push(item);
  }
  const views: ChecklistGroupView[] = [...map.entries()].map(([group, groupItems]) => {
    const total = groupItems.length;
    const done = groupItems.filter((i) => i.done).length;
    const visible = (opts?.hideCompleted ? groupItems.filter((i) => !i.done) : groupItems).sort(
      sortItems
    );
    return { group, items: visible, done, total };
  });
  return views.sort((a, b) => {
    const ra = groupRank(a.group);
    const rb = groupRank(b.group);
    return ra !== rb ? ra - rb : a.group.localeCompare(b.group);
  });
}

/** A date with its daily to-dos. */
export interface ChecklistDayView {
  date: string;
  items: ChecklistItem[];
}

/** "By day" view – only items with a `date`, grouped by date ascending. */
export async function byDay(tripid: string): Promise<ChecklistDayView[]> {
  const items = (await byTrip(tripid)).filter((i) => i.date);
  const map = new Map<string, ChecklistItem[]>();
  for (const item of items) {
    const date = item.date!;
    (map.get(date) ?? map.set(date, []).get(date)!).push(item);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayItems]) => ({ date, items: dayItems.sort(sortItems) }));
}

/** Daily to-dos for one itinerary day (used by the itinerary merge). */
export async function todosForDay(tripid: string, date: string): Promise<ChecklistItem[]> {
  return (await byTrip(tripid)).filter((i) => i.date === date).sort(sortItems);
}

/** The "To buy" shopping view. */
export async function toBuy(tripid: string): Promise<ChecklistItem[]> {
  return (await byTrip(tripid)).filter((i) => i.group === 'To buy').sort(sortItems);
}

/** Overall checklist progress for a trip. */
export async function progress(
  tripid: string
): Promise<{ done: number; total: number; fraction: number }> {
  const items = await byTrip(tripid);
  const total = items.length;
  const done = items.filter((i) => i.done).length;
  return { done, total, fraction: total ? done / total : 0 };
}

// --- Bulk actions --------------------------------------------------------

/** Uncheck every item (reuse the list next trip). */
export async function resetChecks(tripid: string): Promise<void> {
  const items = await byTrip(tripid);
  const updated = items
    .filter((i) => i.done)
    .map((i) => ({ ...i, done: false, doneAt: null, updatedAt: nowIso() }));
  if (updated.length) await bulkPut(updated);
}

/** Check every item in a group. */
export async function checkAllInGroup(tripid: string, group: string): Promise<void> {
  const items = await byTrip(tripid);
  const now = nowIso();
  const updated = items
    .filter((i) => groupKey(i) === group && !i.done)
    .map((i) => ({ ...i, done: true, doneAt: now, updatedAt: now }));
  if (updated.length) await bulkPut(updated);
}

/** Soft-delete all completed items. */
export async function cleanCompleted(tripid: string): Promise<void> {
  const items = await byTrip(tripid);
  const now = nowIso();
  const updated = items
    .filter((i) => i.done)
    .map((i) => ({ ...i, deletedAt: now, updatedAt: now }));
  if (updated.length) await bulkPut(updated);
}

// --- Templates -----------------------------------------------------------

/** Input for creating a checklist template. */
export interface NewTemplateInput {
  name: string;
  items: ChecklistTemplateItem[];
  isDefault?: boolean;
}

/** How template items combine with an existing checklist. */
export type ApplyTemplateMode = 'merge' | 'replace';

export const templates = {
  /** All checklist templates (trip-independent). */
  list(): Promise<ChecklistTemplate[]> {
    return prefixScan<ChecklistTemplate>('tpl:');
  },

  /** Fetch one template. */
  get(id: string): Promise<ChecklistTemplate | null> {
    return getDoc<ChecklistTemplate>(id);
  },

  /** Create a template. */
  create(input: NewTemplateInput): Promise<ChecklistTemplate> {
    return createDoc<ChecklistTemplate>({
      _id: templateId(),
      type: 'checklistTemplate',
      name: input.name,
      items: input.items,
      isDefault: input.isDefault
    });
  },

  /** Patch a template. */
  update(id: string, patch: Partial<NewTemplateInput>): Promise<ChecklistTemplate> {
    return patchDoc<ChecklistTemplate>(id, patch as Partial<ChecklistTemplate>);
  },

  /** Soft-delete a template. */
  remove(id: string): Promise<ChecklistTemplate> {
    return softDeleteDoc<ChecklistTemplate>(id);
  },

  /** Mark one template the default (clearing the flag on the others). */
  async setDefault(id: string): Promise<void> {
    const all = await templates.list();
    const now = nowIso();
    const updated = all
      .filter((t) => !!t.isDefault !== (t._id === id))
      .map((t) => ({ ...t, isDefault: t._id === id, updatedAt: now }));
    if (updated.length) await bulkPut(updated);
    await settings.update({ defaultChecklistTemplateId: id });
  },

  /** The default template (from the flag, falling back to settings). */
  async getDefault(): Promise<ChecklistTemplate | null> {
    const all = await templates.list();
    const flagged = all.find((t) => t.isDefault);
    if (flagged) return flagged;
    const cfg = await settings.get();
    if (cfg.defaultChecklistTemplateId) {
      return all.find((t) => t._id === cfg.defaultChecklistTemplateId) ?? null;
    }
    return null;
  }
};

/** Apply a template's items to a trip's checklist (merge skips duplicates). */
export async function applyTemplate(
  tripid: string,
  templateId: string,
  mode: ApplyTemplateMode = 'merge'
): Promise<number> {
  const template = await templates.get(templateId);
  if (!template) throw new Error(`applyTemplate: template not found: ${templateId}`);

  const existing = await byTrip(tripid);
  if (mode === 'replace') {
    const now = nowIso();
    const removed = existing.map((i) => ({ ...i, deletedAt: now, updatedAt: now }));
    if (removed.length) await bulkPut(removed);
  }

  const seen = new Set(
    (mode === 'merge' ? existing : []).map((i) => `${i.group ?? ''}|${i.text ?? ''}`)
  );

  const now = nowIso();
  const additions: ChecklistItem[] = [];
  for (const item of template.items ?? []) {
    const key = `${item.group ?? 'Packing'}|${item.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    additions.push({
      _id: checklistItemId(tripid),
      type: 'checklistItem',
      tripid: fullTripid(tripid),
      text: item.text,
      group: item.group ?? 'Packing',
      done: false,
      doneAt: null,
      dueDate: null,
      date: null,
      note: item.note,
      quantity: item.quantity,
      important: item.important,
      order: item.order ?? 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      schemaVersion: 1
    } as ChecklistItem);
  }
  if (additions.length) await bulkPut(additions);
  return additions.length;
}

/** Snapshot a trip's current checklist as a reusable template. */
export async function saveAsTemplate(
  tripid: string,
  name: string,
  isDefault = false
): Promise<ChecklistTemplate> {
  const items = await byTrip(tripid);
  const templateItems: ChecklistTemplateItem[] = items.map((i) => ({
    text: i.text ?? '',
    group: i.group,
    order: i.order,
    note: i.note,
    quantity: i.quantity,
    important: i.important
  }));
  return templates.create({ name, items: templateItems, isDefault });
}
