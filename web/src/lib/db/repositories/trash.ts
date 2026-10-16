/**
 * Trash repository – list / restore / purge soft-deleted documents
 * (`docs/04-data-model.md` "Trash / undo").
 *
 * Soft delete sets `deletedAt`; normal queries hide those docs. This view lists
 * them so the user can restore (clear `deletedAt`) or purge (hard delete, which
 * tombstones and replicates so every device converges).
 */

import { getDoc, listDeleted, purgeDoc, purgeManyDocs, restoreDoc } from '../base';
import type { AnyDoc } from '../schemas';
import * as trips from './trips';

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

/** Trash entries belonging to one trip, plus the trip itself when it is trashed. */
export interface TrashGroup {
	tripId: string;
	/** The trip's title, read from the trashed trip or from the live one. */
	title: string | null;
	/** The trashed trip document, when the trip itself was deleted. */
	trip: TrashEntry | null;
	/** Its children, newest deletion first. */
	entries: TrashEntry[];
	/** When the most recent thing in this group was deleted. */
	deletedAt: string | null;
}

export interface TrashListing {
	groups: TrashGroup[];
	/** Entries that belong to no trip: templates, settings, orphans. */
	loose: TrashEntry[];
}

/**
 * Group the Trash by trip.
 *
 * The list used to be flat and ordered by deletion time, so deleting a trip
 * scattered the trip and its two hundred documents into a wall of rows with no
 * indication of what went with what — and the trip's own row, the one whose
 * restore cascades, sat somewhere in the middle of it.
 *
 * An entry whose trip is still alive groups under that trip anyway: the trip
 * gives the row a name and a home. The title comes from the trashed trip when
 * there is one, and from the live trip otherwise.
 */
export async function listGrouped(): Promise<TrashListing> {
	const entries = await list();
	const groups = new Map<string, TrashGroup>();
	const loose: TrashEntry[] = [];

	for (const entry of entries) {
		const tripId = entry.type === 'trip' ? entry.id : entry.tripid;
		if (!tripId) {
			loose.push(entry);
			continue;
		}
		let group = groups.get(tripId);
		if (!group) {
			group = { tripId, title: null, trip: null, entries: [], deletedAt: null };
			groups.set(tripId, group);
		}
		if (entry.type === 'trip') {
			group.trip = entry;
			group.title = entry.label;
		} else {
			group.entries.push(entry);
		}
		if ((entry.deletedAt ?? '') > (group.deletedAt ?? '')) group.deletedAt = entry.deletedAt;
	}

	// A child whose trip is not itself in the Trash still needs a heading.
	for (const group of groups.values()) {
		if (!group.title) {
			const trip = await getDoc<AnyDoc>(group.tripId);
			group.title = trip ? ((trip as { title?: string }).title ?? null) : null;
		}
	}

	return {
		groups: [...groups.values()].sort((a, b) =>
			(b.deletedAt ?? '').localeCompare(a.deletedAt ?? '')
		),
		loose
	};
}

/**
 * Restore a soft-deleted document.
 *
 * A trip takes its children with it. Restoring a trip used to clear `deletedAt`
 * on the trip alone: the days, itinerary, flights, reservations and expenses
 * stayed deleted, and the user got back an empty shell that looked like data
 * loss — the one outcome this whole app exists to prevent.
 */
export async function restore(id: string): Promise<void> {
	if ((await getDoc<AnyDoc>(id))?.type === 'trip') {
		await trips.restore(id);
		return;
	}
	await restoreDoc(id);
}

/** Permanently delete a document, and a trip's children along with it. */
export async function purge(id: string): Promise<void> {
	if ((await getDoc<AnyDoc>(id))?.type === 'trip') {
		await trips.purge(id);
		return;
	}
	await purgeDoc(id);
}

/** Restore several documents. */
export async function restoreMany(ids: string[]): Promise<void> {
	// Sequential, not `Promise.all`: each call is a small write transaction
	// against the same PouchDB, and a batch of parallel patch retries on the
	// same store is how a partial restore ends up half-applied with no report.
	for (const id of ids) await restore(id);
}

/** Permanently delete several documents. */
export async function purgeMany(ids: string[]): Promise<void> {
	const tripIds: string[] = [];
	const plainIds: string[] = [];
	for (const id of ids) {
		if ((await getDoc<AnyDoc>(id))?.type === 'trip') tripIds.push(id);
		else plainIds.push(id);
	}
	await purgeManyDocs(plainIds);
	for (const id of tripIds) await trips.purge(id);
}

/** Empty the trash – permanently delete everything currently soft-deleted. */
export async function empty(): Promise<number> {
	const entries = await list();
	await purgeMany(entries.map((e) => e.id));
	return entries.length;
}
