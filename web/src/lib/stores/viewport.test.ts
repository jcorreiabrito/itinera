import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { viewport } from './viewport.svelte';

describe('ViewportState', () => {
	let origVV: VisualViewport | null;
	let origHeight: number;
	let origWidth: number;

	beforeEach(() => {
		origVV = window.visualViewport;
		origHeight = window.innerHeight;
		origWidth = window.innerWidth;
		viewport.destroy();
		document.documentElement.style.removeProperty('--visual-viewport-height');
		document.documentElement.style.removeProperty('--keyboard-inset-bottom');
	});

	afterEach(() => {
		viewport.destroy();
		Object.defineProperty(window, 'visualViewport', {
			value: origVV,
			writable: true,
			configurable: true
		});
		Object.defineProperty(window, 'innerHeight', {
			value: origHeight,
			writable: true,
			configurable: true
		});
		Object.defineProperty(window, 'innerWidth', {
			value: origWidth,
			writable: true,
			configurable: true
		});
		vi.restoreAllMocks();
	});

	it('initializes with fallback values when window.visualViewport is undefined', () => {
		// Save original visualViewport
		const originalVV = window.visualViewport;
		// Set visualViewport to undefined
		Object.defineProperty(window, 'visualViewport', {
			value: undefined,
			writable: true,
			configurable: true
		});

		Object.defineProperty(window, 'innerHeight', {
			value: 700,
			writable: true,
			configurable: true
		});
		Object.defineProperty(window, 'innerWidth', { value: 360, writable: true, configurable: true });

		viewport.init();

		expect(viewport.height).toBe(700);
		expect(viewport.width).toBe(360);
		expect(viewport.keyboardInset).toBe(0);
		expect(document.documentElement.style.getPropertyValue('--visual-viewport-height')).toBe(
			'700px'
		);
		expect(document.documentElement.style.getPropertyValue('--keyboard-inset-bottom')).toBe('0px');

		// Restore
		Object.defineProperty(window, 'visualViewport', {
			value: originalVV,
			writable: true,
			configurable: true
		});
	});

	it('initializes and updates with window.visualViewport', () => {
		const listeners: Record<string, Array<() => void>> = {};
		const mockVV = {
			height: 500,
			width: 375,
			addEventListener: vi.fn((event: string, cb: () => void) => {
				listeners[event] = listeners[event] || [];
				listeners[event].push(cb);
			}),
			removeEventListener: vi.fn((event: string, cb: () => void) => {
				if (listeners[event]) {
					listeners[event] = listeners[event].filter((fn) => fn !== cb);
				}
			})
		};

		Object.defineProperty(window, 'innerHeight', {
			value: 800,
			writable: true,
			configurable: true
		});
		Object.defineProperty(window, 'visualViewport', {
			value: mockVV,
			writable: true,
			configurable: true
		});

		viewport.init();

		expect(viewport.height).toBe(500);
		expect(viewport.width).toBe(375);
		expect(viewport.keyboardInset).toBe(300); // 800 - 500
		expect(document.documentElement.style.getPropertyValue('--visual-viewport-height')).toBe(
			'500px'
		);
		expect(document.documentElement.style.getPropertyValue('--keyboard-inset-bottom')).toBe(
			'300px'
		);
		expect(mockVV.addEventListener).toHaveBeenCalledWith('resize', viewport.update);
		expect(mockVV.addEventListener).toHaveBeenCalledWith('scroll', viewport.update);

		// Simulate keyboard dismiss (visual viewport expands)
		mockVV.height = 800;
		viewport.update();
		expect(viewport.height).toBe(800);
		expect(viewport.keyboardInset).toBe(0);
		expect(document.documentElement.style.getPropertyValue('--keyboard-inset-bottom')).toBe('0px');
	});

	it('is idempotent on multiple init calls and cleans up properly on destroy', () => {
		const mockVV = {
			height: 600,
			width: 400,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn()
		};
		Object.defineProperty(window, 'innerHeight', {
			value: 600,
			writable: true,
			configurable: true
		});
		Object.defineProperty(window, 'visualViewport', {
			value: mockVV,
			writable: true,
			configurable: true
		});

		const windowSpy = vi.spyOn(window, 'addEventListener');
		const windowRemoveSpy = vi.spyOn(window, 'removeEventListener');

		viewport.init();
		viewport.init(); // second call should do nothing

		expect(mockVV.addEventListener).toHaveBeenCalledTimes(2); // resize and scroll once each
		expect(windowSpy).toHaveBeenCalledTimes(1);

		viewport.destroy();

		expect(mockVV.removeEventListener).toHaveBeenCalledWith('resize', viewport.update);
		expect(mockVV.removeEventListener).toHaveBeenCalledWith('scroll', viewport.update);
		expect(windowRemoveSpy).toHaveBeenCalledWith('resize', viewport.update);
	});

	it('clamps keyboardInset to 0 when visualViewport height is greater than window.innerHeight', () => {
		const mockVV = {
			height: 900,
			width: 400,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn()
		};
		Object.defineProperty(window, 'innerHeight', {
			value: 800,
			writable: true,
			configurable: true
		});
		Object.defineProperty(window, 'visualViewport', {
			value: mockVV,
			writable: true,
			configurable: true
		});

		viewport.init();
		expect(viewport.keyboardInset).toBe(0);
		expect(document.documentElement.style.getPropertyValue('--keyboard-inset-bottom')).toBe('0px');
	});

	it('safely handles destroy when not initialized', () => {
		expect(() => viewport.destroy()).not.toThrow();
	});

	it('updates CSS custom properties on window resize when visualViewport is not available', () => {
		Object.defineProperty(window, 'visualViewport', {
			value: undefined,
			writable: true,
			configurable: true
		});
		Object.defineProperty(window, 'innerHeight', {
			value: 750,
			writable: true,
			configurable: true
		});
		Object.defineProperty(window, 'innerWidth', { value: 380, writable: true, configurable: true });

		viewport.init();
		expect(viewport.height).toBe(750);
		expect(viewport.width).toBe(380);

		// Simulate window resize
		Object.defineProperty(window, 'innerHeight', {
			value: 850,
			writable: true,
			configurable: true
		});
		Object.defineProperty(window, 'innerWidth', { value: 420, writable: true, configurable: true });
		viewport.update();

		expect(viewport.height).toBe(850);
		expect(viewport.width).toBe(420);
		expect(document.documentElement.style.getPropertyValue('--visual-viewport-height')).toBe(
			'850px'
		);
	});

	it('triggers update when visualViewport fires scroll event', () => {
		// Collected into an array rather than a `let`: a variable assigned only from
		// inside a callback stays narrowed to its initial `null` at the call site.
		const scrollCallbacks: Array<() => void> = [];
		const mockVV = {
			height: 480,
			width: 320,
			addEventListener: vi.fn((event: string, cb: () => void) => {
				if (event === 'scroll') scrollCallbacks.push(cb);
			}),
			removeEventListener: vi.fn()
		};

		Object.defineProperty(window, 'innerHeight', {
			value: 700,
			writable: true,
			configurable: true
		});
		Object.defineProperty(window, 'visualViewport', {
			value: mockVV,
			writable: true,
			configurable: true
		});

		viewport.init();
		expect(viewport.keyboardInset).toBe(220); // 700 - 480

		// Virtual viewport height changes during scroll (e.g. browser chrome changes)
		mockVV.height = 520;
		for (const cb of scrollCallbacks) cb();

		expect(viewport.height).toBe(520);
		expect(viewport.keyboardInset).toBe(180); // 700 - 520
		expect(document.documentElement.style.getPropertyValue('--keyboard-inset-bottom')).toBe(
			'180px'
		);
	});
});
