import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { pauseToast, resumeToast, toast, toasts } from './toast';

/**
 * When a toast goes away.
 *
 * An actionable toast is an offer to undo something, and the offer is only worth
 * making if it survives the seconds it takes to act on it. These tests cover the
 * clock, not the pixels: the pointer and keyboard handlers in `Toaster.svelte`
 * are thin wrappers over `pauseToast`/`resumeToast`.
 */

const messages = () => get(toasts).map((item) => item.message);

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	toast.clear();
	vi.useRealTimers();
});

describe('toast countdown', () => {
	it('dismisses an ordinary toast on its own', () => {
		toast.success('Saved');
		expect(messages()).toEqual(['Saved']);

		vi.advanceTimersByTime(3999);
		expect(messages()).toEqual(['Saved']);

		vi.advanceTimersByTime(1);
		expect(messages()).toEqual([]);
	});

	it('gives an actionable toast longer, so the button can be reached', () => {
		toast.success('Deleted', { action: { label: 'Undo', onClick: () => {} } });

		vi.advanceTimersByTime(4000);
		expect(messages()).toEqual(['Deleted']);

		vi.advanceTimersByTime(4000);
		expect(messages()).toEqual([]);
	});

	it('holds a toast open while the pointer is over it', () => {
		const id = toast.success('Deleted', { action: { label: 'Undo', onClick: () => {} } });

		vi.advanceTimersByTime(1000);
		pauseToast(id);
		// Far longer than the whole window: a paused toast has no deadline.
		vi.advanceTimersByTime(60_000);
		expect(messages()).toEqual(['Deleted']);
	});

	it('charges only the time that was left when it resumes', () => {
		const id = toast.success('Deleted', { action: { label: 'Undo', onClick: () => {} } });

		// Three seconds of the eight spent, then paused for a minute.
		vi.advanceTimersByTime(3000);
		pauseToast(id);
		vi.advanceTimersByTime(60_000);
		resumeToast(id);

		// Five seconds were left, so it survives four more and not five.
		vi.advanceTimersByTime(4999);
		expect(messages()).toEqual(['Deleted']);
		vi.advanceTimersByTime(1);
		expect(messages()).toEqual([]);
	});

	it('keeps the remaining time when paused twice over', () => {
		// A `mouseenter` is followed by a `focusin` on the button inside. The
		// second pause must not restart the clock the first one stopped.
		const id = toast.success('Deleted', { action: { label: 'Undo', onClick: () => {} } });

		vi.advanceTimersByTime(1000);
		pauseToast(id);
		vi.advanceTimersByTime(5000);
		pauseToast(id);
		resumeToast(id);

		vi.advanceTimersByTime(6999);
		expect(messages()).toEqual(['Deleted']);
		vi.advanceTimersByTime(1);
		expect(messages()).toEqual([]);
	});

	it('ignores a resume for a toast that was never paused', () => {
		const id = toast.success('Saved');

		vi.advanceTimersByTime(1000);
		resumeToast(id);
		expect(messages()).toEqual(['Saved']);

		// Still the original four seconds, not four more.
		vi.advanceTimersByTime(3000);
		expect(messages()).toEqual([]);
	});

	it('does not let a dismissed toast take a later one with it', () => {
		const id = toast.success('Saved');
		toast.dismiss(id);
		expect(messages()).toEqual([]);

		// The dismissed toast's timer would have fired at 4000. The one shown in
		// its place is still going then, and must not be swept up with it.
		toast.info('Later', { duration: 8000 });
		vi.advanceTimersByTime(4000);
		expect(messages()).toEqual(['Later']);

		vi.advanceTimersByTime(4000);
		expect(messages()).toEqual([]);
	});

	it('lets a toast live until it is dismissed when given no duration', () => {
		const id = toast.error('Fix this', { duration: 0 });

		vi.advanceTimersByTime(600_000);
		expect(messages()).toEqual(['Fix this']);

		toast.dismiss(id);
		expect(messages()).toEqual([]);
	});

	it('clears every timer on clear', () => {
		toast.success('One');
		toast.warning('Two');
		toast.clear();

		vi.advanceTimersByTime(600_000);
		expect(messages()).toEqual([]);
	});
});
