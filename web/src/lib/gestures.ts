/**
 * Pure pointer-gesture geometry.
 *
 * The components own the DOM, the capture and the persistence; this module owns
 * the arithmetic so a drag can be tested without a browser. Every coordinate is
 * a client coordinate (CSS pixels), the same space as `PointerEvent.clientX` and
 * `DOMRect`.
 */

export type GestureAxis = 'x' | 'y';

/** The part of a row rectangle a drag needs. */
export interface RowRect {
	top: number;
	height: number;
}

/**
 * Which axis a gesture has locked to, or `null` while it is still a tap.
 *
 * Distance, not the larger component, is what crosses the threshold: a diagonal
 * push should start a drag just as readily as a straight one. A perfect diagonal
 * is classified as vertical, because the lanes this feeds are vertical lists.
 */
export function classifyAxis(dx: number, dy: number, threshold: number): GestureAxis | null {
	if (dx === 0 && dy === 0) return null;
	if (Math.hypot(dx, dy) < threshold) return null;
	return Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
}

/**
 * The gap the pointer would drop into, from its Y and the row rectangles.
 *
 * Rows are compared at their vertical midpoint: above the first midpoint is gap
 * 0, between two midpoints is the index of the lower row, and below every
 * midpoint is `rects.length`. The result is therefore in `0..rects.length` and
 * still counts the dragged row, which `insertionToIndex` accounts for.
 */
export function dropInsertionIndex(pointerY: number, rects: readonly RowRect[]): number {
	for (let index = 0; index < rects.length; index += 1) {
		const rect = rects[index];
		if (pointerY < rect.top + rect.height / 2) return index;
	}
	return rects.length;
}

/**
 * The moved item's final index once its source row has been removed.
 *
 * `insertion` is a gap in the list that still contains the source. Removing the
 * source shifts every gap below it up by one, while the two gaps either side of
 * it both collapse to the same final index — a drop on either edge of the row's
 * own space means "stay put".
 */
export function insertionToIndex(insertion: number, from: number): number {
	const index = insertion > from ? insertion - 1 : insertion;
	return Math.max(0, index);
}

/**
 * Move one item, returning a new array.
 *
 * Out-of-range sources yield a copy unchanged; an out-of-range target is clamped
 * to the ends, which is what a drop above the first row or below the last means.
 */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
	const next = [...list];
	if (from < 0 || from >= next.length) return next;
	const item = next.splice(from, 1)[0];
	const target = Math.max(0, Math.min(to, next.length));
	next.splice(target, 0, item);
	return next;
}

export type SwipeDirection = 'left' | 'right';

/**
 * Whether a finished gesture is a horizontal swipe, and which way.
 *
 * Unlike a drag, a swipe has to clear the threshold on the horizontal axis
 * itself — a 45° push that just happens to clear `threshold` in distance is a
 * scroll attempt, not a deliberate swipe. Vertical gestures return `null` so the
 * page keeps scrolling.
 */
export function swipeDirection(dx: number, dy: number, threshold: number): SwipeDirection | null {
	if (Math.abs(dx) < threshold) return null;
	if (classifyAxis(dx, dy, threshold) !== 'x') return null;
	return dx > 0 ? 'right' : 'left';
}

/** Keep the live drag offset inside the reveal area, so the row cannot escape. */
export function clampSwipeOffset(dx: number, max: number): number {
	return Math.max(-max, Math.min(max, dx));
}
