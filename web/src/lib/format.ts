/**
 * Small, pure presentation helpers for the UI (dates, money, flags, gradients).
 *
 * These format already-derived values for display only – all domain maths lives
 * in `$lib/db`. Kept dependency-light (luxon for locale-aware dates) and free of
 * any PouchDB import so they are easy to reason about and reuse.
 */

import { DateTime } from 'luxon';

/** "12-19 Sep 2026" / "28 Sep – 3 Oct 2026" / "12 Sep 2026". */
export function formatDateRange(start?: string | null, end?: string | null): string {
  const s = start ? DateTime.fromISO(start) : null;
  const e = end ? DateTime.fromISO(end) : null;

  if (s?.isValid && e?.isValid) {
    if (s.hasSame(e, 'day')) return s.toFormat('d LLL yyyy');
    const sameYear = s.year === e.year;
    const sameMonth = sameYear && s.month === e.month;
    if (sameMonth) return `${s.toFormat('d')} – ${e.toFormat('d LLL yyyy')}`;
    if (sameYear) return `${s.toFormat('d LLL')} – ${e.toFormat('d LLL yyyy')}`;
    return `${s.toFormat('d LLL yyyy')} – ${e.toFormat('d LLL yyyy')}`;
  }
  const one = s?.isValid ? s : e?.isValid ? e : null;
  return one ? one.toFormat('d LLL yyyy') : '';
}

/** "Sat 12 Sep" – a compact weekday + date label. */
export function formatWeekdayDate(iso?: string | null): string {
  if (!iso) return '';
  const dt = DateTime.fromISO(iso);
  return dt.isValid ? dt.toFormat('ccc d LLL') : '';
}

/** "12 Sep 2026". */
export function formatDate(iso?: string | null): string {
  if (!iso) return '';
  const dt = DateTime.fromISO(iso);
  return dt.isValid ? dt.toFormat('d LLL yyyy') : '';
}

/** "08:40" from an ISO datetime or a bare `HH:mm`. */
export function formatTime(value?: string | null): string {
  if (!value) return '';
  const m = /^(?:T|)(\d{2}):(\d{2})/.exec(value);
  return m ? `${m[1]}:${m[2]}` : '';
}

/** Relative phrase like "in 3 days" / "2 hours ago" (locale-aware). */
export function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const dt = DateTime.fromISO(iso, { setZone: true });
  return dt.isValid ? (dt.toRelative() ?? '') : '';
}

/** "7 nights" / "1 night". */
export function formatNights(nights: number): string {
  return `${nights} ${nights === 1 ? 'night' : 'nights'}`;
}

/**
 * Locale-aware currency string. `compact` yields "€1.2K"-style figures for the
 * dense trip cards; the default shows whole units (travel budgets rarely need
 * cents in summaries).
 */
export function formatMoney(
  amount: number,
  currency = 'EUR',
  opts: { compact?: boolean } = {}
): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      notation: opts.compact ? 'compact' : 'standard',
      maximumFractionDigits: opts.compact ? 1 : 0
    }).format(safeAmount);
  } catch {
    // Unknown currency code → fall back to a plain amount + code.
    return `${currency} ${Math.round(safeAmount)}`;
  }
}

/**
 * A modest map of common travel-country names → ISO 3166-1 alpha-2 codes, so a
 * free-text destination country can still show a flag, ISO-2 codes are handled
 * directly; anything unknown simply renders without a flag.
 */
const COUNTRY_CODE: Record<string, string> = {
  'united states': 'US',
  usa: 'US',
  'united kingdom': 'GB',
  uk: 'GB',
  england: 'GB',
  scotland: 'GB',
  ireland: 'IE',
  france: 'FR',
  spain: 'ES',
  portugal: 'PT',
  italy: 'IT',
  germany: 'DE',
  netherlands: 'NL',
  belgium: 'BE',
  switzerland: 'CH',
  austria: 'AT',
  greece: 'GR',
  croatia: 'HR',
  'czech republic': 'CZ',
  czechia: 'CZ',
  poland: 'PL',
  hungary: 'HU',
  sweden: 'SE',
  norway: 'NO',
  denmark: 'DK',
  finland: 'FI',
  iceland: 'IS',
  morocco: 'MA',
  egypt: 'EG',
  turkey: 'TR',
  'united arab emirates': 'AE',
  uae: 'AE',
  japan: 'JP',
  china: 'CN',
  thailand: 'TH',
  vietnam: 'VN',
  india: 'IN',
  indonesia: 'ID',
  singapore: 'SG',
  australia: 'AU',
  'new zealand': 'NZ',
  canada: 'CA',
  mexico: 'MX',
  brazil: 'BR',
  argentina: 'AR',
  peru: 'PE',
  chile: 'CL'
};

/** Flag emoji from an ISO-2 code or a known country name (`` when unknown). */
export function flagEmoji(country?: string | null): string {
  if (!country) return '';
  const raw = country.trim();
  const code = /^[a-z]{2}$/i.test(raw)
    ? raw.toUpperCase()
    : (COUNTRY_CODE[raw.toLowerCase()] ?? '');
  if (!code) return '';
  return String.fromCodePoint(...[...code].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

/**
 * Deterministic warm gradient derived from a string (the trip title), used as a
 * cover-photo fallback so every trip has a stable, recognisable color.
 * Returns a CSS `linear-gradient(...)` value for an inline `background-image`.
 */
export function gradientFromString(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) % 360;
  const h1 = hash;
  const h2 = (hash + 40) % 360;
  return `linear-gradient(135deg, hsl(${h1} 44% 52%), hsl(${h2} 40% 38%))`;
}
