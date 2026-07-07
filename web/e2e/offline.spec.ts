import { test, expect } from '@playwright/test';

test('offline planned trip interaction test', async ({ page, context }) => {
  // Capture console messages
  page.on('console', (msg) => {
    console.log(`[BROWSER LOG] [${msg.type()}] ${msg.text()}`);
  });

  // Capture page errors
  page.on('pageerror', (err) => {
    console.error(`[BROWSER ERROR] ${err.stack || err.message}`);
  });

  // 1. Go to homepage (online)
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // 2. Wait for the service worker to take control
  console.log('Waiting for service worker controller...');
  await page.evaluate(async () => {
    if (navigator.serviceWorker.controller) return;
    return new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve());
    });
  });
  console.log('Service worker is controlling the page.');

  // 3. Set the browser context to offline
  await context.setOffline(true);
  console.log('Browser context set to OFFLINE.');

  // 4. Create a planned trip (dates in the future relative to today) while offline
  const newTripBtn = page.getByRole('button', { name: /new trip/i }).first();
  await expect(newTripBtn).toBeVisible();
  await newTripBtn.click();

  // Click the "Blank trip" choice in the NewTripSheet
  const blankTripChoice = page.getByRole('button', { name: /blank trip/i });
  await expect(blankTripChoice).toBeVisible();
  await blankTripChoice.click();

  // Wait for the input to be visible and fill the form
  const titleInput = page.locator('input[id^="new-title-"]');
  await titleInput.waitFor({ state: 'visible' });
  await titleInput.fill('Test Offline Planned Trip');
  
  await page.locator('input[id^="new-start-"]').fill('2026-07-15');
  await page.locator('input[id^="new-end-"]').fill('2026-07-22');
  
  // Click the "Create trip" button in the footer of the sheet
  const createTripBtn = page.getByRole('button', { name: /create trip/i });
  await createTripBtn.click();

  // Wait for the overview page to load (it automatically navigates on save)
  const headerHeading = page.getByRole('banner').getByRole('heading', { name: 'Test Offline Planned Trip' });
  await expect(headerHeading).toBeVisible();
  console.log('Successfully navigated to planned trip overview while offline.');

  // Get the tripid from the URL
  const currentUrl = page.url();
  const tripid = currentUrl.split('/trip/')[1].split('/')[0];
  console.log(`Created tripid: ${tripid}`);

  // Seed checklist item, flight, and reservation using the exposed dbRepo in browser
  await page.evaluate(async (tid) => {
    const repo = (window as any).dbRepo;
    if (!repo) {
      console.error('dbRepo not found on window!');
      return;
    }
    console.log('Seeding flights, reservations, and checklist items...');
    
    // Create reservation
    await repo.reservations.create(tid, {
      kind: 'lodging',
      name: 'Grand Hotel Rome',
      start: '2026-07-16T12:00:00',
      end: '2026-07-20T10:00:00',
      costType: 'total'
    });

    // Create flight
    await repo.flights.create(tid, {
      segments: [{
        departLocal: '2026-07-15T08:00:00',
        arriveLocal: '2026-07-15T11:00:00',
        airline: 'ITA Airways',
        flightNo: 'AZ123'
      }],
      costType: 'total'
    });

    // Create checklist items
    await repo.checklist.create(tid, {
      text: 'Passport',
      important: true
    });
    await repo.checklist.create(tid, {
      text: 'Charger',
      important: false
    });
    
    console.log('Seeding complete.');
  }, tripid);

  // 5. Reload the page while offline so it queries PouchDB with these documents
  console.log('Reloading page offline...');
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  
  // Wait a bit to let any async loaders and effects run
  await page.waitForTimeout(3000);

  // Try to click the "Checklist" tab in the sidebar
  const checklistLink = page.getByRole('link', { name: /checklist/i }).first();
  console.log('Clicking Checklist sidebar link...');
  await checklistLink.click();

  // Wait a bit to see if navigation succeeds
  await page.waitForTimeout(2000);
  
  console.log(`Current URL after click: ${page.url()}`);
  expect(page.url()).toContain('/checklist');
});
