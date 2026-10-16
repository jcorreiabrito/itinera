import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { copyToClipboard } from './clipboard';

describe('copyToClipboard', () => {
	let origClipboard: typeof navigator.clipboard | undefined;
	let origExecCommand: typeof document.execCommand | undefined;

	beforeEach(() => {
		origClipboard = navigator.clipboard;
		origExecCommand = document.execCommand;
		// jsdom does not implement document.execCommand, and `vi.spyOn` throws if the
		// property is absent. Define a stub so each test can wrap it.
		if (typeof document.execCommand !== 'function') {
			Object.defineProperty(document, 'execCommand', {
				value: () => false,
				writable: true,
				configurable: true
			});
		}
	});

	afterEach(() => {
		Object.defineProperty(navigator, 'clipboard', {
			value: origClipboard,
			writable: true,
			configurable: true
		});
		Object.defineProperty(document, 'execCommand', {
			value: origExecCommand,
			writable: true,
			configurable: true
		});
		vi.restoreAllMocks();
	});

	it('copies text using navigator.clipboard when available', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, 'clipboard', {
			value: { writeText },
			writable: true,
			configurable: true
		});

		const result = await copyToClipboard('PNR123');
		expect(result).toBe(true);
		expect(writeText).toHaveBeenCalledWith('PNR123');
	});

	it('falls back to execCommand when navigator.clipboard is unavailable', async () => {
		Object.defineProperty(navigator, 'clipboard', {
			value: undefined,
			writable: true,
			configurable: true
		});

		const execSpy = vi.spyOn(document, 'execCommand').mockReturnValue(true);
		const appendSpy = vi.spyOn(document.body, 'appendChild');
		const removeSpy = vi.spyOn(document.body, 'removeChild');

		const result = await copyToClipboard('PNR456');

		expect(result).toBe(true);
		expect(execSpy).toHaveBeenCalledWith('copy');
		expect(appendSpy).toHaveBeenCalled();
		expect(removeSpy).toHaveBeenCalled();
	});

	it('falls back to execCommand when navigator.clipboard.writeText throws', async () => {
		const writeText = vi.fn().mockRejectedValue(new Error('Permission denied'));
		Object.defineProperty(navigator, 'clipboard', {
			value: { writeText },
			writable: true,
			configurable: true
		});

		const execSpy = vi.spyOn(document, 'execCommand').mockReturnValue(true);

		const result = await copyToClipboard('PNR789');

		expect(result).toBe(true);
		expect(writeText).toHaveBeenCalledWith('PNR789');
		expect(execSpy).toHaveBeenCalledWith('copy');
	});

	it('returns false when both methods fail', async () => {
		Object.defineProperty(navigator, 'clipboard', {
			value: undefined,
			writable: true,
			configurable: true
		});

		vi.spyOn(document, 'execCommand').mockImplementation(() => {
			throw new Error('execCommand disabled');
		});

		const result = await copyToClipboard('FAIL');
		expect(result).toBe(false);
	});
});
