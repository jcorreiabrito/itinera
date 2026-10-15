import { settings } from '$lib/db';
import { en } from './locales/en';
import { ptBR } from './locales/pt-BR';

export type Language = 'en' | 'pt-BR';

// Reactive language state using Svelte 5 runes (requires .svelte.ts extension to compile)
let currentLanguage = $state<Language>('en');

export function getLanguage(): Language {
  return currentLanguage;
}

export function setLanguage(lang: Language) {
  currentLanguage = lang;
}

/** Automatically load language from settings or browser locale */
export async function initLanguage() {
  try {
    const s = await settings.get();
    if (s.language === 'pt-BR' || s.language === 'en') {
      currentLanguage = s.language;
    } else if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('pt')) {
      currentLanguage = 'pt-BR';
    } else {
      currentLanguage = 'en';
    }
  } catch (e) {
    if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('pt')) {
      currentLanguage = 'pt-BR';
    } else {
      currentLanguage = 'en';
    }
  }
}

const DICTIONARY: Record<Language, Record<string, string>> = {
  'en': en,
  'pt-BR': ptBR
};

/**
 * Translate a key into the active language.
 * Accepts optional replacements like `{search}`.
 */
export function t(key: string, replacements?: Record<string, string>): string {
  const dict = DICTIONARY[currentLanguage] || DICTIONARY['en'];
  let val = dict[key] || DICTIONARY['en'][key] || key;
  if (replacements) {
    for (const [k, v] of Object.entries(replacements)) {
      val = val.replace(`{${k}}`, v);
    }
  }
  return val;
}
