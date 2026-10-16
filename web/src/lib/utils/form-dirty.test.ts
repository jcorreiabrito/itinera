import { describe, expect, it } from 'vitest';
import { isDirty, snapshot } from './form-dirty';

/**
 * The dirty check decides whether a sheet asks before discarding. Getting it
 * wrong in one direction loses the user's typing; wrong in the other nags them
 * about a form they never touched.
 */

describe('isDirty', () => {
	it('reports clean before the form has loaded', () => {
		expect(isDirty(null, { title: 'anything' })).toBe(false);
	});

	it('reports clean when nothing changed', () => {
		const fields = { title: 'Lisbon', notes: '' };
		expect(isDirty(snapshot(fields), { title: 'Lisbon', notes: '' })).toBe(false);
	});

	it('reports dirty when a field changed', () => {
		expect(isDirty(snapshot({ title: 'Lisbon' }), { title: 'Porto' })).toBe(true);
	});

	it('reports dirty when a field was added or removed', () => {
		expect(isDirty(snapshot({ title: 'Lisbon' }), { title: 'Lisbon', notes: 'x' })).toBe(true);
		expect(isDirty(snapshot({ title: 'Lisbon', notes: 'x' }), { title: 'Lisbon' })).toBe(true);
	});

	it('does not care about the key order the fields are built in', () => {
		expect(isDirty(snapshot({ a: 1, b: 2 }), { b: 2, a: 1 })).toBe(false);
	});

	it('compares numbers and the strings that look like them as different', () => {
		// A number input writes `'12'`; the record held `12`. The user did retype
		// the field, and treating it as clean would discard their edit silently.
		expect(isDirty(snapshot({ amount: 12 }), { amount: '12' })).toBe(true);
	});

	it('follows nested changes', () => {
		const baseline = snapshot({ legs: [{ from: 'LIS' }] });
		expect(isDirty(baseline, { legs: [{ from: 'LIS' }] })).toBe(false);
		expect(isDirty(baseline, { legs: [{ from: 'OPO' }] })).toBe(true);
		expect(isDirty(baseline, { legs: [] })).toBe(true);
	});

	it('treats an edit and its undo as clean', () => {
		const fields = { title: 'Lisbon' };
		const baseline = snapshot(fields);
		expect(isDirty(baseline, { title: 'Port' })).toBe(true);
		expect(isDirty(baseline, { title: 'Lisbon' })).toBe(false);
	});

	it('distinguishes an empty field from a missing one only as far as JSON does', () => {
		// `JSON.stringify` drops `undefined` values, so `{ notes: undefined }` and
		// `{}` both serialize to `{}`. That is the behaviour the sheets rely on:
		// a cleared optional field and an absent one compare equal.
		expect(isDirty(snapshot({ notes: undefined }), {})).toBe(false);
		expect(isDirty(snapshot({ notes: undefined }), { notes: '' })).toBe(true);
	});
});

describe('snapshot', () => {
	it('is stable for equal input', () => {
		expect(snapshot({ a: 1, b: [2, 3] })).toBe(snapshot({ a: 1, b: [2, 3] }));
	});
});
