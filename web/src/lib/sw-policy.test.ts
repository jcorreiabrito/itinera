import { describe, expect, it } from 'vitest';
import { isCacheableResponse, shouldBypass } from './sw-policy';

/**
 * Two rules the service worker gets wrong quietly. Bypassing the wrong path
 * breaks sync convergence; caching the wrong response breaks the app until the
 * cache is cleared by hand — and in both cases nothing on screen says why.
 */

const ORIGIN = 'https://itinera.example';

const url = (href: string) => new URL(href, ORIGIN);
const ok = (body = 'x', type?: string) =>
	new Response(body, { status: 200, headers: type ? { 'content-type': type } : undefined });

describe('shouldBypass', () => {
	it('bypasses the PouchDB replication channel', () => {
		expect(shouldBypass(url('/db/itinera/_changes'), ORIGIN)).toBe(true);
		expect(shouldBypass(url('/db/itinera/_local/checkpoint'), ORIGIN)).toBe(true);
	});

	it('bypasses the API', () => {
		expect(shouldBypass(url('/api/trips/abc/pdf'), ORIGIN)).toBe(true);
	});

	it('bypasses a path that merely starts with the same letters', () => {
		// `/database` and `/apidocs` are not the replication channel.
		expect(shouldBypass(url('/database'), ORIGIN)).toBe(false);
		expect(shouldBypass(url('/apidocs'), ORIGIN)).toBe(false);
	});

	it('does not bypass the app shell', () => {
		expect(shouldBypass(url('/'), ORIGIN)).toBe(false);
		expect(shouldBypass(url('/trip/abc/itinerary'), ORIGIN)).toBe(false);
		expect(shouldBypass(url('/_app/immutable/entry/x.js'), ORIGIN)).toBe(false);
	});

	it('does not bypass another origin that happens to use the same paths', () => {
		expect(shouldBypass(url('https://other.example/db/x'), ORIGIN)).toBe(false);
	});
});

describe('isCacheableResponse', () => {
	it('keeps map tiles', () => {
		expect(
			isCacheableResponse(url('https://tile.openstreetmap.org/12/1/2.png'), ok('', 'image/png'))
		).toBe(true);
		expect(
			isCacheableResponse(url('https://a.tile.openstreetmap.org/12/1/2.png'), ok('', 'image/png'))
		).toBe(true);
		expect(
			isCacheableResponse(
				url('https://basemaps.cartocdn.com/light_all/12/1/2.png'),
				ok('', 'image/png')
			)
		).toBe(true);
	});

	it('keeps exchange rates', () => {
		expect(
			isCacheableResponse(
				url('https://open.er-api.com/v6/latest/EUR'),
				ok('{}', 'application/json')
			)
		).toBe(true);
	});

	it('refuses a same-origin response, however ordinary', () => {
		// A static host that rewrites unknown paths to index.html answers a
		// missing chunk with a 200 and HTML. Storing that under the chunk's URL
		// is what made the app break in a way a reload could not fix.
		expect(
			isCacheableResponse(url('/_app/immutable/chunks/abc.js'), ok('<!doctype html>', 'text/html'))
		).toBe(false);
		expect(isCacheableResponse(url('/'), ok('<!doctype html>', 'text/html'))).toBe(false);
	});

	it('refuses a lookup host that only looks like a tile host', () => {
		// `tile.openstreetmap.org.evil.example` must not match.
		expect(
			isCacheableResponse(
				url('https://tile.openstreetmap.org.evil.example/1/2/3.png'),
				ok('', 'image/png')
			)
		).toBe(false);
		expect(isCacheableResponse(url('https://notopenstreetmap.org/x.png'), ok())).toBe(false);
	});

	it('refuses a failed response even from a cacheable host', () => {
		expect(
			isCacheableResponse(
				url('https://tile.openstreetmap.org/12/1/2.png'),
				new Response('nope', { status: 404 })
			)
		).toBe(false);
		expect(
			isCacheableResponse(
				url('https://tile.openstreetmap.org/12/1/2.png'),
				new Response('', { status: 500 })
			)
		).toBe(false);
	});
});
