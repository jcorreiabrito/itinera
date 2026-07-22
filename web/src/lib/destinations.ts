import type { Destination } from '$lib/db';
import { flagEmoji } from '$lib/format';

/**
 * Generate a unique ID for a destination object.
 */
export function ensureDestinationId(d: Destination): Destination & { id: string } {
  if (d.id) return d as Destination & { id: string };
  return {
    ...d,
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `dest_${Math.random().toString(36).slice(2, 9)}`
  };
}

/**
 * Format a list of destinations into a readable route string.
 * Examples:
 * - Single: "🇮🇹 Rome"
 * - Same country: "🇧🇷 São Paulo → Curitiba → Florianópolis"
 * - Multi country: "🇮🇹 Rome → 🇫🇷 Paris"
 */
export function formatDestinationRoute(destinations: Destination[], options: { compact?: boolean } = {}): string {
  if (!destinations || destinations.length === 0) return '';
  
  const valid = destinations.filter((d) => d.name && d.name.trim().length > 0);
  if (valid.length === 0) return '';

  if (valid.length === 1) {
    const flag = flagEmoji(valid[0].country);
    return flag ? `${flag} ${valid[0].name}` : valid[0].name;
  }

  // Check if all destinations share the same country
  const firstCountry = valid[0].country?.trim().toLowerCase();
  const allSameCountry = firstCountry && valid.every((d) => d.country?.trim().toLowerCase() === firstCountry);

  if (options.compact && valid.length > 2) {
    const flag = flagEmoji(valid[0].country);
    const prefix = allSameCountry && flag ? `${flag} ` : '';
    return `${prefix}${valid[0].name} +${valid.length - 1}`;
  }

  if (allSameCountry) {
    const flag = flagEmoji(valid[0].country);
    const names = valid.map((d) => d.name).join(' → ');
    return flag ? `${flag} ${names}` : names;
  }

  // Different countries: include flag per item if present
  return valid
    .map((d) => {
      const flag = flagEmoji(d.country);
      return flag ? `${flag} ${d.name}` : d.name;
    })
    .join(' → ');
}

/**
 * Finds which destination matches a given date (ISO format YYYY-MM-DD).
 */
export function getDestinationForDate(dateIso: string, destinations: Destination[]): Destination | null {
  if (!dateIso || !destinations || destinations.length === 0) return null;

  for (const d of destinations) {
    if (d.arriveDate && d.departDate) {
      if (dateIso >= d.arriveDate && dateIso <= d.departDate) {
        return d;
      }
    } else if (d.arriveDate && !d.departDate) {
      if (dateIso >= d.arriveDate) {
        return d;
      }
    } else if (!d.arriveDate && d.departDate) {
      if (dateIso <= d.departDate) {
        return d;
      }
    }
  }

  return null;
}
