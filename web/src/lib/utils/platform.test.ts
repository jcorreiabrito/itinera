import { describe, expect, it } from 'vitest';
import { isIos, isStandalone, shouldWarnAboutEviction, type PlatformEnv } from './platform';

/** The cases below can only be reproduced on hardware we cannot run tests on. */

const IPHONE =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_LEGACY =
	'Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1';
/** iPadOS 13+ asks for desktop sites unless the user turns it off. */
const IPAD_DESKTOP_UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const MAC =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const ANDROID =
	'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';

const env = (over: Partial<PlatformEnv>): PlatformEnv => ({ userAgent: '', ...over });

describe('isIos', () => {
	it('recognises an iPhone and an older iPad', () => {
		expect(isIos(env({ userAgent: IPHONE }))).toBe(true);
		expect(isIos(env({ userAgent: IPAD_LEGACY }))).toBe(true);
	});

	it('recognises an iPadOS 13+ iPad reporting itself as a Mac', () => {
		expect(isIos(env({ userAgent: IPAD_DESKTOP_UA, maxTouchPoints: 5 }))).toBe(true);
	});

	it('does not mistake a real Mac for an iPad', () => {
		// A laptop with a trackpad reports maxTouchPoints 0.
		expect(isIos(env({ userAgent: MAC, maxTouchPoints: 0 }))).toBe(false);
		expect(isIos(env({ userAgent: MAC }))).toBe(false);
	});

	it('leaves Android alone', () => {
		expect(isIos(env({ userAgent: ANDROID, maxTouchPoints: 5 }))).toBe(false);
	});
});

describe('isStandalone', () => {
	it('accepts either signal', () => {
		expect(isStandalone(env({ displayModeStandalone: true }))).toBe(true);
		expect(isStandalone(env({ navigatorStandalone: true }))).toBe(true);
		expect(isStandalone(env({ displayModeStandalone: false }))).toBe(false);
	});
});

describe('shouldWarnAboutEviction', () => {
	it('warns an iPhone in Safari that is holding trips', () => {
		expect(shouldWarnAboutEviction(env({ userAgent: IPHONE }), true)).toBe(true);
	});

	it('stays quiet once it is installed', () => {
		expect(
			shouldWarnAboutEviction(env({ userAgent: IPHONE, navigatorStandalone: true }), true)
		).toBe(false);
	});

	it('stays quiet before there is anything to lose', () => {
		expect(shouldWarnAboutEviction(env({ userAgent: IPHONE }), false)).toBe(false);
	});

	it('never warns on a platform that keeps its storage', () => {
		expect(shouldWarnAboutEviction(env({ userAgent: ANDROID }), true)).toBe(false);
		expect(shouldWarnAboutEviction(env({ userAgent: MAC }), true)).toBe(false);
	});
});
