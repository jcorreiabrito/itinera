import { test, expect, type Page } from '@playwright/test';

/**
 * Archiving and deleting are the two ways a trip leaves the Home list, and
 * both are driven from the card's actions menu. A regression here is silent
 * (the menu closes, the card stays), so this exercises the real write path in
 * PouchDB for a dated trip and a dream plan.
 */

interface SeedTrip {
	title: string;
	startDate?: string;
	endDate?: string;
	dateMode?: 'dated' | 'dream';
	dreamDayCount?: number;
}

/**
 * Seed a trip the way the JSON importer would: absent dates are written as
 * explicit `null`s, not omitted. That is the shape that used to read fine but
 * fail every later write (archive, edit, delete) on schema validation.
 */
async function seedTrip(page: Page, seed: SeedTrip): Promise<string> {
	await page.goto('/');
	// `initDb()` exposes the handle once the database is ready; seeding earlier
	// would race the boot sequence.
	await page.waitForFunction(() => !!(window as unknown as { db?: unknown }).db);
	const uid = await page.evaluate(async (seed) => {
		const db = (
			window as unknown as {
				db: { bulkDocs: (docs: unknown[]) => Promise<unknown>; allDocs: () => Promise<unknown> };
			}
		).db;
		// A ULID-shaped id keeps the app's id parser happy.
		const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
		let uid = '';
		for (let i = 0; i < 26; i++) uid += alphabet[Math.floor(Math.random() * alphabet.length)];
		const now = new Date().toISOString();
		const tripId = `trip:${uid}`;
		const docs: unknown[] = [
			{
				_id: tripId,
				type: 'trip',
				title: seed.title,
				startDate: seed.startDate ?? null,
				endDate: seed.endDate ?? null,
				dateMode: seed.dateMode ?? 'dated',
				dreamDayCount: seed.dreamDayCount,
				homeCurrency: 'EUR',
				destinations: [],
				tags: [],
				archived: false,
				stage: 'confirmed',
				travelerCount: 1,
				createdAt: now,
				updatedAt: now,
				deletedAt: null,
				schemaVersion: 1
			}
		];
		if (seed.dateMode === 'dream') {
			// The importer writes a placeholder `undated` day; deleting the trip
			// must carry it into the Trash too.
			docs.push({
				_id: `day:${uid}:undated`,
				type: 'tripDay',
				tripid: tripId,
				date: null,
				title: null,
				notes: null,
				createdAt: now,
				updatedAt: now,
				deletedAt: null,
				schemaVersion: 1
			});
		}
		await db.bulkDocs(docs);
		return uid;
	}, seed);
	await page.reload();
	await expect(page.getByRole('heading', { name: seed.title })).toBeVisible();
	return uid;
}

async function archiveFromCard(page: Page, title: string) {
	await page.getByRole('button', { name: `Actions for ${title}` }).click();
	await page.getByRole('button', { name: 'Archive', exact: true }).click();
}

async function deleteFromCard(page: Page, title: string) {
	await page.getByRole('button', { name: `Actions for ${title}` }).click();
	await page.getByRole('button', { name: 'Delete', exact: true }).click();
	await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
}

test('a dated trip can be archived and unarchived from its card', async ({ page }) => {
	// Database boot can take longer than the default 30s with a full parallel run.
	test.slow();
	const title = `Dated ${Date.now()}`;
	await seedTrip(page, { title, startDate: '2026-11-02', endDate: '2026-11-04' });

	await archiveFromCard(page, title);
	await expect(page.getByRole('heading', { name: title })).toHaveCount(0);

	await page.getByRole('button', { name: 'Archived' }).click();
	await expect(page.getByRole('heading', { name: title })).toBeVisible();

	await page.getByRole('button', { name: `Actions for ${title}` }).click();
	await page.getByRole('button', { name: 'Unarchive', exact: true }).click();
	await expect(page.getByRole('heading', { name: title })).toBeVisible();
});

test('a dream trip can be archived and deleted from its card', async ({ page }) => {
	test.slow();
	const title = `Dream ${Date.now()}`;
	await seedTrip(page, { title, dateMode: 'dream', dreamDayCount: 3 });

	await archiveFromCard(page, title);
	await expect(page.getByRole('heading', { name: title })).toHaveCount(0);

	await page.getByRole('button', { name: 'Archived' }).click();
	await expect(page.getByRole('heading', { name: title })).toBeVisible();

	await deleteFromCard(page, title);
	await expect(page.getByRole('heading', { name: title })).toHaveCount(0);
});
