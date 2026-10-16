import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPending, markPending, pendingWriteCount, pendingWrites } from './pending';
import { applyPendingCount, type SyncStatus } from './sync';

/**
 * The write path's tally, and the rule that turns it into a visible state.
 *
 * `'pending'` was in the `SyncState` union with an icon and a colour in the
 * status pill, and nothing ever set it: a device that was online and reachable
 * with unpushed edits still reported "Synced".
 */

function status(over: Partial<SyncStatus> = {}): SyncStatus {
	return {
		state: 'synced',
		lastSyncedAt: '2026-10-16T10:00:00Z',
		pendingChanges: false,
		pendingCount: 0,
		error: null,
		...over
	};
}

describe('pending write counter', () => {
	beforeEach(() => clearPending());

	it('starts at zero and counts writes', () => {
		expect(pendingWriteCount()).toBe(0);
		markPending();
		markPending();
		expect(pendingWriteCount()).toBe(2);
	});

	it('counts a bulk write in one go', () => {
		markPending(12);
		expect(pendingWriteCount()).toBe(12);
	});

	it('resets when the push completes', () => {
		markPending(3);
		clearPending();
		expect(pendingWriteCount()).toBe(0);
	});

	it('notifies subscribers', () => {
		const seen = vi.fn();
		const unsubscribe = pendingWrites.subscribe(seen);
		markPending(2);
		expect(seen).toHaveBeenLastCalledWith(2);
		unsubscribe();
	});
});

describe('applyPendingCount', () => {
	it('turns a finished sync into pending once a write is outstanding', () => {
		const next = applyPendingCount(status(), 1);
		expect(next.state).toBe('pending');
		expect(next.pendingChanges).toBe(true);
		expect(next.pendingCount).toBe(1);
	});

	it('returns to synced when the queue drains', () => {
		const next = applyPendingCount(
			status({ state: 'pending', pendingChanges: true, pendingCount: 1 }),
			0
		);
		expect(next.state).toBe('pending'); // the transition is done by the caller's markSynced
		expect(next.pendingChanges).toBe(false);
		expect(next.pendingCount).toBe(0);
	});

	it('does not mask an in-flight sync', () => {
		expect(applyPendingCount(status({ state: 'syncing' }), 4).state).toBe('syncing');
	});

	it('does not mask the reason writes are stuck', () => {
		expect(applyPendingCount(status({ state: 'offline', error: null }), 4).state).toBe('offline');
		expect(applyPendingCount(status({ state: 'error', error: 'nope' }), 4).state).toBe('error');
	});

	it('is a no-op when the count is unchanged', () => {
		const before = status();
		expect(applyPendingCount(before, 0)).toBe(before);
	});
});
