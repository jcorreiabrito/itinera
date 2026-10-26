/**
 * Selection arithmetic for the day view's batch mode.
 *
 * The component owns the mode and the dialogs; these functions own the set
 * maths so "what is selected" has one tested answer instead of being spread
 * through template expressions.
 */

/** Toggle one row, returning a new set so the component's state assignment is reactive. */
export function toggleSelected(
	selected: ReadonlySet<string>,
	id: string,
	on: boolean
): Set<string> {
	const next = new Set(selected);
	if (on) next.add(id);
	else next.delete(id);
	return next;
}

/** Whether every row offered by the day is selected — false for an empty day. */
export function allSelected(selected: ReadonlySet<string>, ids: readonly string[]): boolean {
	return ids.length > 0 && ids.every((id) => selected.has(id));
}

/** The selected ids in day order; batch actions iterate this, not the set. */
export function selectedInOrder(selected: ReadonlySet<string>, ids: readonly string[]): string[] {
	return ids.filter((id) => selected.has(id));
}

export interface BatchSummary {
	total: number;
	succeeded: number;
	failed: number;
}

/** Tally a settled batch for the single message the day shows afterwards. */
export function summarizeBatch(results: readonly PromiseSettledResult<unknown>[]): BatchSummary {
	const succeeded = results.filter((result) => result.status === 'fulfilled').length;
	return {
		total: results.length,
		succeeded,
		failed: results.length - succeeded
	};
}
