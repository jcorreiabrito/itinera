import { describe, expect, it } from 'vitest';
import {
	classifyAxis,
	clampSwipeOffset,
	dropInsertionIndex,
	insertionToIndex,
	moveItem,
	swipeDirection,
	type RowRect
} from './gestures';

const rects: RowRect[] = [
	{ top: 0, height: 40 },
	{ top: 40, height: 40 },
	{ top: 80, height: 40 }
];

describe('classifyAxis', () => {
	it('stays undecided below the threshold', () => {
		expect(classifyAxis(0, 0, 8)).toBeNull();
		expect(classifyAxis(3, -4, 8)).toBeNull();
		expect(classifyAxis(-7, 0, 8)).toBeNull();
		expect(classifyAxis(0, 7, 8)).toBeNull();
	});

	it('locks to the dominant axis once the threshold is met', () => {
		expect(classifyAxis(30, 4, 8)).toBe('x');
		expect(classifyAxis(-30, -4, 8)).toBe('x');
		expect(classifyAxis(4, 30, 8)).toBe('y');
		expect(classifyAxis(-4, -30, 8)).toBe('y');
	});

	it('treats a perfect diagonal as vertical', () => {
		expect(classifyAxis(12, 12, 8)).toBe('y');
	});
});

describe('dropInsertionIndex', () => {
	it('returns the gap before the first row above it', () => {
		expect(dropInsertionIndex(-20, rects)).toBe(0);
		expect(dropInsertionIndex(0, rects)).toBe(0);
		expect(dropInsertionIndex(19, rects)).toBe(0);
	});

	it('returns the gap between rows in the pointer order', () => {
		expect(dropInsertionIndex(30, rects)).toBe(1);
		expect(dropInsertionIndex(60, rects)).toBe(2);
	});

	it('returns the append gap below every row', () => {
		expect(dropInsertionIndex(100, rects)).toBe(3);
		expect(dropInsertionIndex(500, rects)).toBe(3);
	});

	it('is 0 for an empty lane', () => {
		expect(dropInsertionIndex(120, [])).toBe(0);
	});
});

describe('insertionToIndex', () => {
	it('moves upward when the gap is above the source', () => {
		expect(insertionToIndex(0, 2)).toBe(0);
		expect(insertionToIndex(1, 2)).toBe(1);
	});

	it('moves downward when the gap is below the source', () => {
		expect(insertionToIndex(3, 0)).toBe(2);
		expect(insertionToIndex(4, 0)).toBe(3);
	});

	it('accepts both edges of the list', () => {
		expect(insertionToIndex(0, 0)).toBe(0);
		expect(insertionToIndex(4, 3)).toBe(3);
		expect(insertionToIndex(3, 3)).toBe(3);
	});

	it('returns the source index when it would be dropped on itself', () => {
		expect(insertionToIndex(1, 1)).toBe(1);
		expect(insertionToIndex(2, 1)).toBe(1);
	});
});

describe('moveItem', () => {
	const list = ['a', 'b', 'c', 'd'];

	it('moves upward and downward, returning a new array', () => {
		const upward = moveItem(list, 2, 0);
		const downward = moveItem(list, 1, 3);

		expect(upward).toEqual(['c', 'a', 'b', 'd']);
		expect(downward).toEqual(['a', 'c', 'd', 'b']);
		expect(upward).not.toBe(list);
		expect(list).toEqual(['a', 'b', 'c', 'd']);
	});

	it('handles both edges', () => {
		expect(moveItem(list, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
		expect(moveItem(list, 0, 3)).toEqual(['b', 'c', 'd', 'a']);
	});

	it('leaves the order alone when the target is the source', () => {
		expect(moveItem(list, 1, 1)).toEqual(list);
	});

	it('clamps an out-of-range target and copies an out-of-range source', () => {
		expect(moveItem(list, 1, 99)).toEqual(['a', 'c', 'd', 'b']);
		expect(moveItem(list, -1, 2)).toEqual(list);
		expect(moveItem(list, 4, 0)).toEqual(list);
		expect(moveItem([], 0, 0)).toEqual([]);
	});
});

describe('swipeDirection', () => {
	it('needs the horizontal axis itself to clear the threshold', () => {
		expect(swipeDirection(47, 0, 48)).toBeNull();
		expect(swipeDirection(-47, 0, 48)).toBeNull();
		expect(swipeDirection(48, 0, 48)).toBe('right');
		expect(swipeDirection(-48, 0, 48)).toBe('left');
	});

	it('rejects vertical and diagonal gestures', () => {
		expect(swipeDirection(10, 80, 48)).toBeNull();
		expect(swipeDirection(-10, -80, 48)).toBeNull();
		expect(swipeDirection(60, 60, 48)).toBeNull();
	});

	it('accepts a clearly horizontal gesture even with some vertical drift', () => {
		expect(swipeDirection(90, 20, 48)).toBe('right');
		expect(swipeDirection(-90, 20, 48)).toBe('left');
	});
});

describe('clampSwipeOffset', () => {
	it('keeps the offset within the reveal area', () => {
		expect(clampSwipeOffset(30, 72)).toBe(30);
		expect(clampSwipeOffset(-30, 72)).toBe(-30);
		expect(clampSwipeOffset(500, 72)).toBe(72);
		expect(clampSwipeOffset(-500, 72)).toBe(-72);
	});
});

describe('a drag from pointer position to the new order', () => {
	const lane = ['a', 'b', 'c', 'd'];
	const laneRects: RowRect[] = lane.map((_, index) => ({ top: index * 40, height: 40 }));

	function drop(pointerY: number, from: number): string[] {
		const insertion = dropInsertionIndex(pointerY, laneRects);
		return moveItem(lane, from, insertionToIndex(insertion, from));
	}

	it('lands the first item below the last row', () => {
		expect(drop(500, 0)).toEqual(['b', 'c', 'd', 'a']);
	});

	it('lands the last item above the first row', () => {
		expect(drop(-10, 3)).toEqual(['d', 'a', 'b', 'c']);
	});

	it('keeps the order when the pointer never leaves its own row', () => {
		expect(drop(45, 1)).toEqual(lane);
	});

	it('changes nothing before the threshold is crossed', () => {
		const axis = classifyAxis(2, 3, 8);
		expect(axis).toBeNull();
		expect(drop(45, 1)).toEqual(lane);
	});
});
