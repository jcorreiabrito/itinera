import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';

/**
 * A dream trip moves between numbered days and real calendar dates without
 * losing the plan: create Day 1..N, put an item on Day 2, set dates, then make
 * the dates flexible again. Each step is asserted in the UI and in PouchDB.
 */

async function createDreamTrip(page: Page, title: string, days: number) {
	await page.goto('/');
	await page
		.getByRole('button', { name: /new trip/i })
		.first()
		.click();
	await page.getByRole('button', { name: /blank trip/i }).click();

	await page.locator('input[id^="new-title-"]').fill(title);
	await page.getByRole('button', { name: 'Dream trip' }).click();
	await page.locator('input[id^="new-days-"]').fill(String(days));

	await page.getByRole('button', { name: /create trip/i }).click();
	await expect(page.getByRole('banner').getByRole('heading', { name: title })).toBeVisible();

	return page.url().split('/trip/')[1].split('/')[0];
}

async function seedDayTwoItem(page: Page, tripId: string) {
	// The URL carries the bare ULID; stored ids are prefixed with `trip:`.
	const uid = tripId.replace(/^trip:/, '');
	await page.evaluate(
		async ({ uid }) => {
			const db = (window as unknown as { db: { bulkDocs: (docs: unknown[]) => Promise<unknown> } })
				.db;
			const now = new Date().toISOString();
			await db.bulkDocs([
				{
					_id: `itin:${uid}:e2e-market`,
					type: 'itineraryItem',
					tripId: `trip:${uid}`,
					tripid: `trip:${uid}`,
					title: 'Market',
					allDay: true,
					date: null,
					dayOrdinal: 2,
					order: 0,
					createdAt: now,
					updatedAt: now,
					schemaVersion: 1
				}
			]);
		},
		{ uid }
	);
}

async function placementOf(page: Page, tripId: string, item: string, field: 'date' | 'dayOrdinal') {
	return page.evaluate(
		async ({ tripId, item, field }) => {
			const db = (
				window as unknown as { db: { get: (id: string) => Promise<Record<string, unknown>> } }
			).db;
			const uid = tripId.replace(/^trip:/, '');
			const doc = await db.get(`itin:${uid}:${item}`);
			return doc[field] ?? null;
		},
		{ tripId, item, field }
	);
}

test('a dream trip becomes dated and flexible again without losing its plan', async ({ page }) => {
	// Create → set dates → make flexible → download/edit/upload is a long flow;
	// under a fully parallel run it needs more than the default budget.
	test.slow();
	const tripId = await createDreamTrip(page, `Dream ${Date.now()}`, 2);
	await seedDayTwoItem(page, tripId);

	await page.goto(`/trip/${tripId}/itinerary`);
	await expect(page.getByRole('heading', { name: 'Day 1' })).toBeVisible();
	await expect(page.locator('button[data-drop-key="dream-2"]')).toBeVisible();

	// The seeded activity sits on Day 2, not on the selected Day 1.
	await page.locator('button[data-drop-key="dream-2"]').click();
	await expect(page.getByRole('heading', { name: 'Day 2' })).toBeVisible();
	await expect(page.getByText('Market')).toBeVisible();

	await page.getByRole('button', { name: 'Set trip dates' }).first().click();
	await page.locator('#set-dates-start').fill('2026-11-02');
	await page.getByRole('button', { name: 'Set dates' }).click();

	// Day 1 was a Monday, so the plan now reads as a real date.
	await expect(page.getByRole('heading', { name: 'Mon 2 Nov' })).toBeVisible();
	await expect(page.locator('button[data-drop-key="2026-11-03"]')).toBeVisible();
	await expect.poll(() => placementOf(page, tripId, 'e2e-market', 'date')).toBe('2026-11-03');
	await expect.poll(() => placementOf(page, tripId, 'e2e-market', 'dayOrdinal')).toBeNull();

	await page.locator('button[data-drop-key="2026-11-03"]').click();
	await expect(page.getByRole('heading', { name: 'Tue 3 Nov' })).toBeVisible();
	await expect(page.getByText('Market')).toBeVisible();

	await page
		.getByRole('button', { name: /Change dates/ })
		.first()
		.click();
	await page.getByRole('button', { name: /Make dates flexible again/ }).click();
	await page.getByRole('button', { name: 'Make flexible' }).click();

	await expect(page.getByRole('heading', { name: 'Day 1' })).toBeVisible();
	await expect(page.locator('button[data-drop-key="dream-2"]')).toBeVisible();
	await expect.poll(() => placementOf(page, tripId, 'e2e-market', 'dayOrdinal')).toBe(2);
	await expect.poll(() => placementOf(page, tripId, 'e2e-market', 'date')).toBeNull();

	// Download the hand-editable template, edit it outside Itinera, upload it.
	await page.getByRole('button', { name: 'Trip data and exports' }).click();
	const [download] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('button', { name: 'Download dream plan template' }).click()
	]);
	const file = await download.path();
	expect(file).not.toBeNull();

	const template = JSON.parse(await readFile(file as string, 'utf8')) as {
		days: { day: number; items: { title: string }[] }[];
	};
	const dayTwo = template.days.find((day) => day.day === 2);
	expect(dayTwo?.items[0]?.title).toBe('Market');
	dayTwo!.items[0].title = 'Night market';

	await page.getByRole('button', { name: 'Trip data and exports' }).click();
	const [chooser] = await Promise.all([
		page.waitForEvent('filechooser'),
		page.getByRole('button', { name: 'Update from JSON file' }).click()
	]);
	await chooser.setFiles({
		name: 'itinera-dream-plan.json',
		mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify(template))
	});
	// The sheet slides in from the right over 320ms; while it is still offscreen
	// Playwright refuses the click, so wait for it to settle into the viewport.
	const confirm = page.getByRole('button', { name: 'Confirm Update' });
	await expect(confirm).toBeInViewport();
	await confirm.click();

	await expect(page.getByRole('heading', { name: 'Day 1' })).toBeVisible();
	await page.locator('button[data-drop-key="dream-2"]').click();
	await expect(page.getByText('Night market')).toBeVisible();
	await expect(page.getByText('Market', { exact: true })).toHaveCount(0);
});

test('the import screen offers a standard and a dream template', async ({ page }) => {
	await page.goto('/');
	await page
		.getByRole('button', { name: /new trip/i })
		.first()
		.click();
	await page.getByRole('button', { name: /import from json/i }).click();

	await expect(page.getByRole('button', { name: 'Standard trip', exact: true })).toBeVisible();

	const [download] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('button', { name: 'Dream trip', exact: true }).click()
	]);
	expect(download.suggestedFilename()).toBe('itinera-dream-plan-template.json');
	const file = await download.path();
	expect(file).not.toBeNull();
	const payload = JSON.parse(await readFile(file as string, 'utf8')) as {
		schema: string;
		fieldGuide?: Record<string, string>;
		days: { items: { estCost?: number; currency?: string }[] }[];
	};
	expect(payload.schema).toBe('itinera.dream-plan');
	// The starter shows how costs are written, both in prose and by example.
	expect(payload.fieldGuide?.['item.estCost']).toMatch(/total estimated cost/i);
	expect(payload.days[0].items.some((item) => typeof item.estCost === 'number')).toBe(true);

	// The sample is a starter: uploading it creates a new dream trip.
	await page.locator('input[type="file"]').setInputFiles(file as string);
	await expect(page.getByRole('button', { name: 'Import trip' })).toBeEnabled();
	await page.getByRole('button', { name: 'Import trip' }).click();

	await expect(
		page.getByRole('banner').getByRole('heading', { name: 'My Dream Trip' })
	).toBeVisible();
	await page
		.getByRole('navigation', { name: 'Trip sections' })
		.getByRole('link', { name: 'Itinerary' })
		.click();
	await expect(page.getByRole('heading', { name: 'Day 1' })).toBeVisible();
	await expect(page.locator('button[data-drop-key="dream-2"]')).toBeVisible();
});
