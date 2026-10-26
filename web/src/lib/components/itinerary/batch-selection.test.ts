import { describe, expect, it } from 'vitest';
import {
	allSelected,
	selectedInOrder,
	summarizeBatch,
	toggleSelected,
	type BatchSummary
} from './batch-selection';

describe('batch selection', () => {
	it('toggles one row without mutating the set it was given', () => {
		const before = new Set(['a']);
		const after = toggleSelected(before, 'b', true);

		expect([...before]).toEqual(['a']);
		expect([...after]).toEqual(['a', 'b']);
		expect([...toggleSelected(after, 'a', false)]).toEqual(['b']);
	});

	it('counts a selection only when every offered row is selected', () => {
		expect(allSelected(new Set(), [])).toBe(false);
		expect(allSelected(new Set(['a']), ['a'])).toBe(true);
		expect(allSelected(new Set(['a']), ['a', 'b'])).toBe(false);
	});

	it('returns selected ids in day order, ignoring stale ids', () => {
		const selected = new Set(['c', 'a', 'gone']);
		expect(selectedInOrder(selected, ['a', 'b', 'c'])).toEqual(['a', 'c']);
	});

	it('summarises a batch that partly failed', () => {
		const results: PromiseSettledResult<unknown>[] = [
			{ status: 'fulfilled', value: 'a' },
			{ status: 'rejected', reason: new Error('offline') },
			{ status: 'fulfilled', value: 'c' }
		];

		const summary: BatchSummary = summarizeBatch(results);
		expect(summary).toEqual({ total: 3, succeeded: 2, failed: 1 });
	});

	it('summarises an all-failed batch', () => {
		const results: PromiseSettledResult<unknown>[] = [
			{ status: 'rejected', reason: new Error('offline') },
			{ status: 'rejected', reason: new Error('offline') }
		];

		expect(summarizeBatch(results)).toEqual({ total: 2, succeeded: 0, failed: 2 });
	});
});
