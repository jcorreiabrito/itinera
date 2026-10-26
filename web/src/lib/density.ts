/**
 * Display density: the compact preference for lists.
 *
 * Two values only. "Comfortable" is the app's existing look, and is therefore
 * also what an absent, unreadable or future value means: `parseDensity` narrows
 * whatever localStorage holds rather than trusting it, because any script on
 * the origin can write that key.
 *
 * The choice is stored in the settings document like every other preference and
 * mirrored to localStorage so the inline script in `app.html` can put it on
 * `<html>` before the first paint. Without that seed a compact user would see
 * the comfortable layout and then watch every list reflow under them once the
 * database opened.
 */

export type Density = 'comfortable' | 'compact';

/** Menu order for the settings control. */
export const DENSITIES: readonly Density[] = ['comfortable', 'compact'];

/** Today's look; also the fallback for anything unrecognised. */
export const DEFAULT_DENSITY: Density = 'comfortable';

/** localStorage key of the pre-paint seed in app.html — keep the two in sync. */
export const DENSITY_STORAGE_KEY = 'itinera_density';

/** Narrow a stored (or hostile) value to a density the app understands. */
export function parseDensity(value: unknown): Density {
	return value === 'compact' ? 'compact' : DEFAULT_DENSITY;
}

/**
 * Put the preference on `<html>`, where `app.css` keys the compact rules.
 *
 * The `doc` parameter is the no-document seam: server rendering and plain unit
 * tests have nothing to style, and asking for one must not throw.
 */
export function applyDensity(
	density: Density,
	doc: Document | null = typeof document === 'undefined' ? null : document
): void {
	if (!doc) return;
	doc.documentElement.dataset.density = density;
}

/**
 * Best-effort copy for the next load's pre-paint seed. The settings document
 * remains the source of truth; a browser that refuses storage simply starts the
 * next load unseeded.
 */
export function mirrorDensity(
	density: Density,
	storage: Pick<Storage, 'setItem'> | null = typeof localStorage === 'undefined'
		? null
		: localStorage
): void {
	try {
		storage?.setItem(DENSITY_STORAGE_KEY, density);
	} catch {
		/* storage disabled — the settings document still holds the choice */
	}
}
