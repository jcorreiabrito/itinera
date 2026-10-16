import { settings } from '$lib/db';
import { en } from './locales/en';
import { ptBR } from './locales/pt-BR';

export type Language = 'en' | 'pt-BR';

/**
 * Every valid translation key. `t()` accepts only these, so a typo or a key that
 * was never added fails `svelte-check` instead of silently rendering the raw key
 * in the UI (which is how "edit_flight" became a dialog title).
 */
export type TranslationKey = keyof typeof en;

/** localStorage key for the pre-paint language seed (mirrors `itinera_theme`). */
export const LANG_STORAGE_KEY = 'itinera_lang';

function isLanguage(value: unknown): value is Language {
	return value === 'en' || value === 'pt-BR';
}

/** Best-effort read of the persisted language; never throws (private mode, etc.). */
function readStoredLanguage(): Language | null {
	try {
		const v = globalThis.localStorage?.getItem(LANG_STORAGE_KEY);
		return isLanguage(v) ? v : null;
	} catch {
		return null;
	}
}

/** Best-effort persist so the inline script in app.html can seed the next load. */
function persistLanguage(lang: Language) {
	try {
		globalThis.localStorage?.setItem(LANG_STORAGE_KEY, lang);
	} catch {
		/* storage unavailable — the async settings read still drives the language */
	}
}

/**
 * Keep `<html lang>` in sync. Required by WCAG 3.1.1 (Language of Page): without
 * it a screen reader pronounces Portuguese with English phonetics and the
 * browser applies the wrong hyphenation and translation offer.
 */
function applyDocumentLanguage(lang: Language) {
	if (typeof document !== 'undefined') {
		document.documentElement.lang = lang;
	}
}

// Seed synchronously from storage so the first paint is already in the right
// language; `initLanguage()` still overrides from the settings doc once loaded.
let currentLanguage = $state<Language>(readStoredLanguage() ?? 'en');

export function getLanguage(): Language {
	return currentLanguage;
}

export function setLanguage(lang: Language) {
	if (currentLanguage === lang) return;
	currentLanguage = lang;
	applyDocumentLanguage(lang);
	persistLanguage(lang);
}

/** Automatically load language from settings or browser locale */
export async function initLanguage() {
	let next: Language;
	try {
		const s = await settings.get();
		if (isLanguage(s.language)) {
			next = s.language;
		} else if (
			typeof navigator !== 'undefined' &&
			navigator.language?.toLowerCase().startsWith('pt')
		) {
			next = 'pt-BR';
		} else {
			next = 'en';
		}
	} catch {
		if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('pt')) {
			next = 'pt-BR';
		} else {
			next = 'en';
		}
	}
	currentLanguage = next;
	applyDocumentLanguage(next);
	persistLanguage(next);
}

const DICTIONARY: Record<Language, Record<string, string>> = {
	en: en,
	'pt-BR': ptBR
};

/**
 * Translate a key into the active language.
 * Accepts optional replacements like `{search}`.
 */
export function t(key: TranslationKey, replacements?: Record<string, string>): string {
	const dict = DICTIONARY[currentLanguage] || DICTIONARY['en'];
	let val = dict[key] || DICTIONARY['en'][key] || key;
	if (replacements) {
		for (const [k, v] of Object.entries(replacements)) {
			val = val.replace(`{${k}}`, v);
		}
	}
	return val;
}
