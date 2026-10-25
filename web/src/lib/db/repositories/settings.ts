/**
 * Settings repository – the app-wide singleton (`settings:app`).
 *
 * Holds defaults used across the app: default home currency for new trips, the
 * * default checklist template, theme, and first day of week
 * (`docs/04-data-model.md`). Read-through creates the document on first access.
 */

import { getRuntimeConfig } from '../../config';
import { createDoc, getDoc, patchDoc } from '../base';
import { SETTINGS_ID } from '../constants';
import type { Settings, ThemePref } from '../schemas';

/** Settings fields a caller may change. */
export interface SettingsPatch {
	homeCurrencyDefault?: string;
	defaultChecklistTemplateId?: string | null;
	theme?: ThemePref;
	firstDayOfWeek?: number;
	language?: string;
	cartoApiKey?: string;
	trashRetentionDays?: number;
}

const DEFAULTS = {
	/*
	 * The deployment's `config.js` can change what a *new* install starts with.
	 * A getter, not a literal, so the value is read when the singleton is created
	 * rather than when this module is first imported.
	 */
	get homeCurrencyDefault(): string {
		return getRuntimeConfig().defaultCurrency;
	},
	defaultChecklistTemplateId: null,
	theme: 'system' as ThemePref,
	firstDayOfWeek: 1,
	cartoApiKey: '',
	// Keep deleted documents forever until the user says otherwise.
	trashRetentionDays: 0,
	get language() {
		if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('pt')) {
			return 'pt-BR';
		}
		return 'en';
	}
};

/** Get the settings document, creating it with defaults on first access. */
export async function get(): Promise<Settings> {
	const existing = await getDoc<Settings>(SETTINGS_ID);
	if (existing) return existing;
	return createDoc<Settings>({
		_id: SETTINGS_ID,
		type: 'settings',
		...DEFAULTS,
		language: DEFAULTS.language
	});
}

/** Update settings (ensuring the singleton exists first). */
export async function update(patch: SettingsPatch): Promise<Settings> {
	await get();
	return patchDoc<Settings>(SETTINGS_ID, patch as Partial<Settings>);
}
