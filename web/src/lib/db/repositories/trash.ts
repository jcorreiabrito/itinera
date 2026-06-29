/**
 * Trash repository – list / restore / purge soft-deleted documents
 * (`docs/04-data-model.md` "Trash / undo").
 *
 * Soft delete sets `deletedAt`; normal queries hide those docs. This view lists
 * them so the user can restore (clear `deletedAt`) or purge (hard delete, which
 * tombstones and replicates so every device converges).
 */

import { listDeleted, purgeDoc, restoreDoc } from './base';
import type { AnyDoc } from '../schemas';

/** A soft-deleted document summarised for the Trash list. */
export interface TrashEntry {
  id: string;
  type?: string;
  tripid?: string;
  deletedAt: string | null;
  /** Human label derived from the document. */
  label: string;
  doc: AnyDoc;
}

function labelFor(doc: AnyDoc): string {
  const d = doc as Record<string, unknown>;
  switch (doc.type) {
    case 'trip':
      return (d.title as string) ?? 'Trip';
    case 'reservation':
      return (d.name as string) ?? 'Reservation';
    case 'flight':
      return 'Flight booking';
    case 'expense':
      return (d.description as string) ?? 'Expense';
    case 'checklistItem':
      return (d.text as string) ?? 'Checklist item';
    case 'itineraryItem':
      return (d.title as string) ?? 'Itinerary item';
    case 'attachment':
      return (d.filename as string) ?? 'Attachment';
    case 'tripDay':
      return `Day ${(d.date as string) ?? ''}`.trim();
    case 'checklistTemplate':
      return (d.name as string) ?? 'Template';
    default:
      return (doc.type as string | undefined) ?? (d._id as string);
  }
}

/** List all soft-deleted documents, most-recently-deleted first. */
export async function list(): Promise<TrashEntry[]> {
  const docs = await listDeleted();
  return docs
    .map((doc) => ({
      id: doc._id,
      type: doc.type,
      tripid: (doc as { tripid?: string }).tripid,
      deletedAt: doc.deletedAt ?? null,
      label: labelFor(doc),
      doc
    }))
    .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''));
}

/** Restore a soft-deleted document. */
export function restore(id: string): Promise<AnyDoc> {
  return restoreDoc<AnyDoc>(id);
}

/** Permanently delete a document. */
export function purge(id: string): Promise<void> {
  return purgeDoc(id);
}

/** Restore several documents. */
export async function restoreMany(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => restoreDoc(id)));
}

/** Permanently delete several documents. */
export async function purgeMany(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => purgeDoc(id)));
}

/** Empty the trash – permanently delete everything currently soft-deleted. */
export async function empty(): Promise<number> {
  const entries = await list();
  await purgeMany(entries.map((e) => e.id));
  return entries.length;
}
