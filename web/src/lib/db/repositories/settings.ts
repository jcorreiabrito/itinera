/**
 * Settings repository – the app-wide singleton (`settings:app`).
 *
 * Holds defaults used across the app: default home currency for new trips, the
 * * default checklist template, theme, and first day of week
 * (`docs/04-data-model.md`). Read-through creates the document on first access.
 */

import { getRuntimeConfig } from '../../config';
import { applyDensity, DEFAULT_DENSITY, mirrorDensity, parseDensity } from '../../density';
import { createDoc, getDoc, patchDoc } from '../base';
import { SETTINGS_ID } from '../constants';
import type { DensityPref, Settings, ThemePref } from '../schemas';

/** Settings fields a caller may change. */
export interface SettingsPatch {
	homeCurrencyDefault?: string;
	defaultChecklistTemplateId?: string | null;
	theme?: ThemePref;
	density?: DensityPref;
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
	density: DEFAULT_DENSITY,
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

/**
 * Keep the compact stylesheet in step with the loaded document.
 *
 * `app.html` seeds `<html data-density>` from localStorage before first paint,
 * but the settings document is the source of truth and may have arrived by sync
 * holding a different value. Reading the preference is the one moment every
 * route passes through at boot (`initLanguage` calls `get`), so it is also the
 * moment to correct the attribute and refresh the seed for the next load.
 */
function syncDensity(doc: Settings): void {
	const density = parseDensity(doc.density);
	applyDensity(density);
	mirrorDensity(density);
}

/** Get the settings document, creating it with defaults on first access. */
export async function get(): Promise<Settings> {
	const existing = await getDoc<Settings>(SETTINGS_ID);
	if (existing) {
		syncDensity(existing);
		return existing;
	}
	const created = await createDoc<Settings>({
		_id: SETTINGS_ID,
		type: 'settings',
		...DEFAULTS,
		language: DEFAULTS.language
	});
	syncDensity(created);
	return created;
}

/** Update settings (ensuring the singleton exists first). */
export async function update(patch: SettingsPatch): Promise<Settings> {
	await get();
	const saved = await patchDoc<Settings>(SETTINGS_ID, patch as Partial<Settings>);
	syncDensity(saved);
	return saved;
}
