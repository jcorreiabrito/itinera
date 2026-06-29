/**
 * Airport lookup & search API for the flights page – fully offline.
 *
 * The heavy dataset lives in `airports.data.ts` and is loaded **lazily** via a
 * dynamic import, so it is code-split into its own chunk (precached with the app
 * shell, fetched on first use) instead of inflating the initial bundle. Once
 * loaded it is cached in-module for the session.
 *
 * The ranking logic (`searchAirportsIn`) is a pure function so it can be unit
 * tested without loading the dataset.
 */

import type { AirportSnapshot } from './schemas';

/** One airport in the bundled dataset. */
export interface AirportRecord {
  /** IATA code, e.g. `FCO`. */
  code: string;
  /** Airport name, e.g. `Fiumicino`. */
  name: string;
  /** Primary city served, e.g. `Rome`. */
  city: string;
  /** Country name. */
  country: string;
  /** IANA time zone, e.g. `Europe/Rome`. */
  tz: string;
  /** Optional coordinates (not populated by the bundled subset). */
  lat?: number;
  lng?: number;
}

let cache: AirportRecord[] | null = null;
let loading: Promise<AirportRecord[]> | null = null;

/**
 * Load (and cache) the bundled airport dataset. Safe to call repeatedly – the
 * dynamic import resolves once and is reused for the rest of the session.
 */
export async function loadAirports(): Promise<AirportRecord[]> {
  if (cache) return cache;
  if (!loading) {
    loading = import('./airport.data').then((m) => {
      cache = m.AIRPORTS;
      return cache;
    });
  }
  return loading;
}

/** Synchronously read the dataset if it has already been loaded, else `null`. */
export function airportsLoaded(): AirportRecord[] | null {
  return cache;
}

function normalise(value: string): string {
  // Strip diacritics and lowercase so "Zürich" matches "zurich".
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Pure ranked search over a supplied airport list. Matches against IATA code,
 * city, name and country; ranks exact-code and prefix matches highest.
 *
 * @param list airports to search
 * @param query free text (`"FCO"`, `"rome"`, `"fiumic"`)
 * @param limit max results (default 8)
 */
export function searchAirportsIn(
  list: readonly AirportRecord[],
  query: string,
  limit = 8
): AirportRecord[] {
  const q = normalise(query);
  if (!q) return [];

  const scored: { rec: AirportRecord; score: number }[] = [];
  for (const rec of list) {
    const code = rec.code.toLowerCase();
    const city = normalise(rec.city);
    const name = normalise(rec.name);
    const country = normalise(rec.country);

    let score = 0;
    if (code === q) score = 100;
    else if (code.startsWith(q)) score = 90;
    else if (city === q) score = 80;
    else if (city.startsWith(q)) score = 70;
    else if (name.startsWith(q)) score = 60;
    else if (city.includes(q)) score = 50;
    else if (name.includes(q)) score = 40;
    else if (country.startsWith(q)) score = 30;
    else if (country.includes(q)) score = 20;

    if (score > 0) {
      // Tie-break shorter cities first (more "central" matches).
      scored.push({ rec, score: score - rec.city.length / 1000 });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.rec);
}

/** Ranked airport search over the bundled dataset (loads it on first call). */
export async function searchAirports(query: string, limit = 8): Promise<AirportRecord[]> {
  const list = await loadAirports();
  return searchAirportsIn(list, query, limit);
}

/** Look up a single airport by exact IATA code (case-insensitive). */
export async function getAirport(code: string): Promise<AirportRecord | undefined> {
  const list = await loadAirports();
  const target = code.toUpperCase();
  return list.find((a) => a.code === target);
}

/** Reduce a full record to the snapshot stored on a flight segment. */
export function toSegmentAirport(rec: AirportRecord): AirportSnapshot {
  return { code: rec.code, name: rec.name, city: rec.city, tz: rec.tz };
}
