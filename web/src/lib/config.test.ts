import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	DEFAULT_CONFIG,
	configSchema,
	flagEnabled,
	getRuntimeConfig,
	resetRuntimeConfigForTests
} from './config';
import { DB_NAME, REMOTE_URL } from './db/constants';

/**
 * Runtime configuration is a boot-time contract: a deployment edits one file and
 * the app must either honour it or fall back to documented defaults. These
 * tests pin the fallback direction in both cases, because a config error that
 * throws during boot leaves a blank screen with no way back to Settings.
 */

function setWindowConfig(value: unknown): void {
	(window as unknown as { __ITINERA_CONFIG__?: unknown }).__ITINERA_CONFIG__ = value;
}

describe('runtime config', () => {
	beforeEach(() => {
		resetRuntimeConfigForTests();
	});

	afterEach(() => {
		setWindowConfig(undefined);
		resetRuntimeConfigForTests();
		vi.restoreAllMocks();
	});

	it('uses the documented defaults when config.js is absent', () => {
		expect(getRuntimeConfig()).toEqual(DEFAULT_CONFIG);
		expect(DEFAULT_CONFIG.dbName).toBe(DB_NAME);
		expect(DEFAULT_CONFIG.remoteUrl).toBe(REMOTE_URL);
		expect(DEFAULT_CONFIG.weatherEnabled).toBe(true);
	});

	it('reads the deployment values that are present', () => {
		setWindowConfig({ dbName: 'household', remoteUrl: '/db/household', weatherEnabled: false });
		const config = getRuntimeConfig();
		expect(config.dbName).toBe('household');
		expect(config.remoteUrl).toBe('/db/household');
		expect(config.weatherEnabled).toBe(false);
		// Unspecified keys still fall back rather than becoming undefined.
		expect(config.defaultCurrency).toBe('EUR');
	});

	it('normalises the default currency', () => {
		setWindowConfig({ defaultCurrency: ' usd ' });
		expect(getRuntimeConfig().defaultCurrency).toBe('USD');
	});

	it('rejects a currency that is not a three-letter code', () => {
		expect(configSchema.safeParse({ defaultCurrency: 'EURO' }).success).toBe(false);
	});

	it('does not throw on a broken file, and warns exactly once', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		setWindowConfig({ dbName: '', flags: 'yes please' });
		expect(() => getRuntimeConfig()).not.toThrow();
		expect(getRuntimeConfig()).toEqual(DEFAULT_CONFIG);
		expect(warn).toHaveBeenCalledTimes(1);
	});

	it('treats an unknown flag as on, so a typo never hides a feature', () => {
		expect(flagEnabled('notARealFlag')).toBe(true);
	});

	it('honours a flag that is explicitly false', () => {
		setWindowConfig({ flags: { wallet: false } });
		expect(flagEnabled('wallet')).toBe(false);
		expect(flagEnabled('today')).toBe(true);
	});

	it('parses once and returns the same object afterwards', () => {
		setWindowConfig({ dbName: 'first' });
		const first = getRuntimeConfig();
		setWindowConfig({ dbName: 'second' });
		expect(getRuntimeConfig()).toBe(first);
		expect(getRuntimeConfig().dbName).toBe('first');
	});
});
