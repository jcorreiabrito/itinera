/**
 * Export center: the documents it offers and the URLs the print side reads.
 *
 * The query string is the contract with `/trip/[id]/print` — one pure builder
 * here, with a test, rather than an `href` template per card that drifts. The
 * server PDF path mirrors `api/app/routers/pdf.py` for the same reason: the
 * language has to travel with the request, because the server cannot see this
 * device's setting.
 */

import type { Language, TranslationKey } from '$lib/i18n.svelte';

/** The documents the printable route builds. */
export type ExportDocId = 'all' | 'itinerary' | 'costs' | 'checklist' | 'bookings';

/** Paper sizes the printable route understands. */
export type PaperSize = 'a4' | 'letter';

/** Everything a card can count, so a document lists only what it carries. */
export type ExportCountKey =
	'days' | 'items' | 'expenses' | 'checklist' | 'flights' | 'reservations';

/** How much of each thing this trip holds. */
export type ExportCounts = Record<ExportCountKey, number>;

/** One printable document, as the export center lists it. */
export interface ExportDocDefinition {
	id: ExportDocId;
	titleKey: TranslationKey;
	descriptionKey: TranslationKey;
	counts: readonly ExportCountKey[];
}

/** The choices a Print button makes. */
export interface PrintOptions {
	doc: ExportDocId;
	paper: PaperSize;
	lang: Language;
}

/**
 * The query the printable route parses:
 * `?doc=all|itinerary|costs|checklist|bookings&paper=a4|letter&lang=en|pt-BR`.
 */
export function printQuery(options: PrintOptions): string {
	const params = new URLSearchParams();
	params.set('doc', options.doc);
	params.set('paper', options.paper);
	params.set('lang', options.lang);
	return params.toString();
}

/** The resolved `/trip/[id]/print` path with the query the print side reads. */
export function printHref(path: string, options: PrintOptions): string {
	return `${path}?${printQuery(options)}`;
}

/**
 * One trip's server-rendered PDF, relative to the API base.
 *
 * `GET /api/v1/trips/{trip_id}/print.pdf?lang=` — the endpoint takes only the
 * language; it always renders the whole booklet.
 */
export function tripPdfPath(tripId: string, lang: Language): string {
	return `/trips/${encodeURIComponent(tripId)}/print.pdf?lang=${encodeURIComponent(lang)}`;
}

/** The filename `$lib/api` gives the same download, so the two do not disagree. */
export function pdfFilename(tripId: string): string {
	return `itinera-${tripId.replace(/:/g, '-')}.pdf`;
}

const EVERY_COUNT: readonly ExportCountKey[] = [
	'days',
	'items',
	'expenses',
	'checklist',
	'flights',
	'reservations'
];

/** Card order: the whole booklet first, then the four sections on their own. */
export const EXPORT_DOCS: readonly ExportDocDefinition[] = [
	{
		id: 'all',
		titleKey: 'export_center_doc_all_title',
		descriptionKey: 'export_center_doc_all_desc',
		counts: EVERY_COUNT
	},
	{
		id: 'itinerary',
		titleKey: 'export_center_doc_itinerary_title',
		descriptionKey: 'export_center_doc_itinerary_desc',
		counts: ['days', 'items']
	},
	{
		id: 'costs',
		titleKey: 'export_center_doc_costs_title',
		descriptionKey: 'export_center_doc_costs_desc',
		counts: ['expenses']
	},
	{
		id: 'checklist',
		titleKey: 'export_center_doc_checklist_title',
		descriptionKey: 'export_center_doc_checklist_desc',
		counts: ['checklist']
	},
	{
		id: 'bookings',
		titleKey: 'export_center_doc_bookings_title',
		descriptionKey: 'export_center_doc_bookings_desc',
		counts: ['flights', 'reservations']
	}
];
