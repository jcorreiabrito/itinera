/**
 * Currency Exchange Rates Utility with Offline Caching.
 *
 * Provides market exchange rates with automatic local storage caching.
 * Keeps expenses easy to record in foreign currencies without manual conversion math.
 */

export interface CachedRates {
	base: string;
	timestamp: number;
	rates: Record<string, number>;
}

// Sensible fallback rates (relative to USD) if completely offline on first launch
const FALLBACK_USD_RATES: Record<string, number> = {
	USD: 1.0,
	EUR: 0.92,
	BRL: 5.65,
	GBP: 0.77,
	JPY: 152.0,
	CAD: 1.38,
	AUD: 1.51,
	CHF: 0.87,
	CNY: 7.12,
	MXN: 19.8,
	ARS: 985.0,
	CLP: 940.0
};

const CACHE_PREFIX = 'itinera_fx_';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Cached rates for `base`, or `null` when absent, unreadable, or older than
 * `CACHE_TTL_MS`.
 *
 * The expiry matters: `updateExchangeRates` only re-fetches while the browser
 * reports itself online, so a cache with no TTL would pin whatever rate was
 * first seen and quietly price every later expense off stale data.
 */
export function getCachedRates(base: string): Record<string, number> | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		const raw = localStorage.getItem(`${CACHE_PREFIX}${base.toUpperCase()}`);
		if (!raw) return null;
		const data: CachedRates = JSON.parse(raw);
		if (!data?.rates || typeof data.timestamp !== 'number') return null;
		if (Date.now() - data.timestamp > CACHE_TTL_MS) {
			localStorage.removeItem(`${CACHE_PREFIX}${base.toUpperCase()}`);
			return null;
		}
		return data.rates;
	} catch {
		return null;
	}
}

export function saveRates(base: string, rates: Record<string, number>): void {
	if (typeof localStorage === 'undefined') return;
	try {
		const payload: CachedRates = {
			base: base.toUpperCase(),
			timestamp: Date.now(),
			rates
		};
		localStorage.setItem(`${CACHE_PREFIX}${base.toUpperCase()}`, JSON.stringify(payload));
	} catch {
		/* offline rate cache is best-effort; a failure just means one more fetch */
	}
}

/**
 * Fetch latest exchange rates for a base currency, using cache if valid.
 */
export async function updateExchangeRates(base: string = 'USD'): Promise<Record<string, number>> {
	const normBase = base.toUpperCase();
	const cached = getCachedRates(normBase);

	// If online, attempt to refresh in background or if expired
	if (typeof navigator !== 'undefined' && navigator.onLine) {
		try {
			const res = await fetch(`https://open.er-api.com/v6/latest/${normBase}`);
			if (res.ok) {
				const data = await res.json();
				if (data?.rates) {
					saveRates(normBase, data.rates);
					return data.rates;
				}
			}
		} catch {
			// network failure, proceed to cache or fallback
		}
	}

	if (cached) return cached;

	// Fallback conversion maths using bundled USD rates
	const baseRateToUsd = FALLBACK_USD_RATES[normBase] ?? 1.0;
	const synthesized: Record<string, number> = {};
	for (const [code, usdRate] of Object.entries(FALLBACK_USD_RATES)) {
		synthesized[code] = usdRate / baseRateToUsd;
	}
	return synthesized;
}

/**
 * Calculates how many units of `toCur` equal 1 unit of `fromCur`.
 * e.g. 1 EUR = ? BRL  => rate ~ 6.14
 */
export function getSuggestedFxRate(fromCur: string, toCur: string): number | null {
	const from = fromCur.toUpperCase().trim();
	const to = toCur.toUpperCase().trim();
	if (!from || !to) return null;
	if (from === to) return 1.0;

	// Try direct cached rates for 'from' base
	const fromRates = getCachedRates(from);
	if (fromRates && fromRates[to]) {
		return Number(fromRates[to].toFixed(6));
	}

	// Try cached rates for 'to' base
	const toRates = getCachedRates(to);
	if (toRates && toRates[from] && toRates[from] > 0) {
		return Number((1 / toRates[from]).toFixed(6));
	}

	// Fallback using USD cross-rate
	const fromToUsd = FALLBACK_USD_RATES[from];
	const toToUsd = FALLBACK_USD_RATES[to];
	if (fromToUsd && toToUsd) {
		// 1 FROM = (1 / fromToUsd) USD = (toToUsd / fromToUsd) TO
		return Number((toToUsd / fromToUsd).toFixed(6));
	}

	return null;
}
