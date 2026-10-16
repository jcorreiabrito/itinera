/**
 * "Has this form been edited?" — the question a sheet has to answer before it
 * lets a swipe or a stray Escape throw the user's typing away.
 *
 * The comparison is a string snapshot rather than a deep equal, so there is
 * exactly one rule to reason about: the form is dirty when its fields serialize
 * to something other than what they serialized to when they were loaded.
 *
 * ```ts
 * const fields = () => ({ title, notes });
 * let baseline = $state<string | null>(null);
 * const dirty = $derived(isDirty(baseline, fields()));
 *
 * function initForm() {
 *     title = trip.title ?? '';
 *     notes = trip.notes ?? '';
 *     baseline = snapshot(fields());   // last, once every field is set
 * }
 * ```
 *
 * `null` means "not loaded yet", and reports clean: a sheet that has not read
 * its record yet has nothing to lose, and a form that opened, loaded and was
 * closed without a keystroke must not prompt.
 */

/**
 * JSON with object keys in a fixed order, so two structures holding the same
 * fields compare equal however they were written.
 *
 * `JSON.stringify` alone is sensitive to key order, which would make a form
 * permanently "dirty" if its loader and its live fields happened to build the
 * object in different orders — a bug that shows up as a spurious prompt and
 * takes a while to place.
 */
function stable(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(stable);
	if (value !== null && typeof value === 'object') {
		const entries = Object.entries(value as Record<string, unknown>)
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
			.map(([key, inner]) => [key, stable(inner)]);
		return Object.fromEntries(entries);
	}
	return value;
}

/**
 * The baseline a form compares against.
 *
 * Values JSON cannot represent — a `Date`, a `Map`, a function — are compared as
 * `{}`, so a form's fields should be the plain strings, numbers and booleans the
 * inputs actually hold.
 */
export function snapshot(fields: unknown): string {
	// `JSON.stringify(undefined)` returns `undefined` rather than a string; the
	// sentinel keeps the return type honest for a caller that snapshots a scalar.
	return JSON.stringify(stable(fields)) ?? 'undefined';
}

/**
 * Whether `fields` differ from the snapshot taken when they were loaded.
 *
 * @param baseline the value {@link snapshot} returned at load, or `null` if the
 *   form has not loaded yet.
 */
export function isDirty(baseline: string | null, fields: unknown): boolean {
	if (baseline === null) return false;
	return snapshot(fields) !== baseline;
}
