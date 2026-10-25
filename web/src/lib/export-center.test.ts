import { describe, expect, it } from 'vitest';
import { EXPORT_DOCS, pdfFilename, printHref, printQuery, tripPdfPath } from './export-center';

/**
 * The export center and the printable route meet at a query string, and the
 * export center and the API meet at a PDF URL. Both are strings with no type
 * checking between the two sides, so they are pinned here.
 */

describe('print query', () => {
	it('writes the agreed keys in the agreed order', () => {
		expect(printQuery({ doc: 'all', paper: 'a4', lang: 'en' })).toBe('doc=all&paper=a4&lang=en');
	});

	it('leaves the Portuguese tag readable', () => {
		expect(printQuery({ doc: 'checklist', paper: 'letter', lang: 'pt-BR' })).toBe(
			'doc=checklist&paper=letter&lang=pt-BR'
		);
	});

	it('appends the query to the resolved print path', () => {
		expect(printHref('/trip/abc/print', { doc: 'costs', paper: 'a4', lang: 'en' })).toBe(
			'/trip/abc/print?doc=costs&paper=a4&lang=en'
		);
	});
});

describe('EXPORT_DOCS', () => {
	it('offers each document once, in card order', () => {
		expect(EXPORT_DOCS.map((doc) => doc.id)).toEqual([
			'all',
			'itinerary',
			'costs',
			'checklist',
			'bookings'
		]);
	});

	it('gives the booklet every count and each section only its own', () => {
		const counts = Object.fromEntries(EXPORT_DOCS.map((doc) => [doc.id, doc.counts]));
		expect(counts.all).toEqual([
			'days',
			'items',
			'expenses',
			'checklist',
			'flights',
			'reservations'
		]);
		expect(counts.itinerary).toEqual(['days', 'items']);
		expect(counts.costs).toEqual(['expenses']);
		expect(counts.checklist).toEqual(['checklist']);
		expect(counts.bookings).toEqual(['flights', 'reservations']);
	});
});

describe('server PDF', () => {
	it('points at the real API route, with the language on the query', () => {
		expect(tripPdfPath('trip:01ABC', 'pt-BR')).toBe('/trips/trip%3A01ABC/print.pdf?lang=pt-BR');
	});

	it('names the download the way the API client does', () => {
		expect(pdfFilename('trip:01ABC')).toBe('itinera-trip-01ABC.pdf');
	});
});
