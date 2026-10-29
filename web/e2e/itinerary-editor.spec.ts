import { test, expect, type Page } from '@playwright/test';

/**
 * The activity editor is a right-hand sheet below `xl` and a docked inspector
 * above it. Both used to spill past the viewport: the sheet inherited the
 * browser's dialog max-width (352px on a 390px phone), and the inspector sized
 * itself from `top-20` even though it starts below the search row, pushing its
 * Save footer below the fold. These tests pin the visible geometry.
 */

async function openEditorOnSeededItem(page: Page): Promise<void> {
	await page.goto('/');
	await page
		.getByRole('button', { name: /new trip/i })
		.first()
		.click();
	await page.getByRole('button', { name: /blank trip/i }).click();
	await page.locator('input[id^="new-title-"]').fill(`Editor ${Date.now()}`);
	await page.getByRole('button', { name: 'Dream trip' }).click();
	await page.locator('input[id^="new-days-"]').fill('2');
	await page.getByRole('button', { name: /create trip/i }).click();
	await expect(page.getByRole('banner').getByRole('heading', { name: /^Editor / })).toBeVisible();

	const tripId = page.url().split('/trip/')[1].split('/')[0];
	await page.evaluate(
		async ({ tripId }) => {
			const db = (window as unknown as { db: { bulkDocs: (docs: unknown[]) => Promise<unknown> } })
				.db;
			const now = new Date().toISOString();
			await db.bulkDocs([
				{
					_id: `itin:${tripId}:e2e-editor`,
					type: 'itineraryItem',
					tripId: `trip:${tripId}`,
					tripid: `trip:${tripId}`,
					title: 'Saturday market',
					allDay: false,
					startTime: '10:00',
					endTime: '12:00',
					date: null,
					dayOrdinal: 1,
					order: 0,
					createdAt: now,
					updatedAt: now,
					schemaVersion: 1
				}
			]);
		},
		{ tripId }
	);

	await page.goto(`/trip/${tripId}/itinerary`);
	await expect(page.getByRole('heading', { name: 'Day 1' })).toBeVisible();
	await page.getByText('Saturday market').click();
}

test('the phone editor sheet spans the viewport and keeps Save on screen', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await openEditorOnSeededItem(page);

	const dialog = page.locator('dialog[open]');
	await expect(dialog).toBeVisible();
	await expect.poll(async () => Math.round((await dialog.boundingBox())?.width ?? 0)).toBe(390);
	await expect(page.getByRole('button', { name: 'Save changes' })).toBeInViewport();
});

test('the docked inspector keeps its footer on screen at the top of the page', async ({ page }) => {
	await page.setViewportSize({ width: 1366, height: 768 });
	await openEditorOnSeededItem(page);

	const inspector = page.locator('aside[aria-labelledby="itinerary-inspector-heading"]');
	await expect(inspector).toBeVisible();
	// Clicking the item may have scrolled the page; the bug showed at scroll top,
	// where the inspector sits below the search row rather than at its sticky top.
	await page.evaluate(() => window.scrollTo(0, 0));
	await expect(page.getByRole('button', { name: 'Save changes' })).toBeInViewport();

	const box = await inspector.boundingBox();
	expect(box).not.toBeNull();
	expect(box!.y + box!.height).toBeLessThanOrEqual(768);
});
