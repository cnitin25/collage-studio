import { test, expect, type Page } from '@playwright/test';

// The export file name follows the project name while it is still the default
// (blank, or exactly what the project name produces), and stops following once
// the user has typed their own.

async function openExportSettings(page: Page) {
  await page.locator('[data-panel-title="Export settings"] .panel-toggle').click();
  return page.getByLabel('Export file name');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('defaults: project and file name are both "Collage"', async ({ page }) => {
  await expect(page.getByLabel('Project name')).toHaveValue('Collage');
  await expect(await openExportSettings(page)).toHaveValue('Collage');
});

test('a default file name follows the project name as it is typed', async ({ page }) => {
  const fileName = await openExportSettings(page);
  await page.getByLabel('Project name').fill('Goa trip 2026');
  await expect(fileName).toHaveValue('Goa trip 2026');
  await page.getByLabel('Project name').pressSequentially(' final');
  await expect(fileName).toHaveValue('Goa trip 2026 final');
});

test('a user-defined file name is left alone when the project is renamed', async ({ page }) => {
  const fileName = await openExportSettings(page);
  await fileName.fill('my-print');
  await page.getByLabel('Project name').fill('Birthday');
  await expect(fileName).toHaveValue('my-print');
  await expect(page.getByLabel('Project name')).toHaveValue('Birthday');
});

test('clearing the file name makes it follow the project name again', async ({ page }) => {
  const fileName = await openExportSettings(page);
  await fileName.fill('my-print');
  await fileName.fill('');
  await page.getByLabel('Project name').fill('Wedding');
  await expect(fileName).toHaveValue('Wedding');
});

test('characters not allowed in file names are replaced', async ({ page }) => {
  const fileName = await openExportSettings(page);
  await page.getByLabel('Project name').fill('Trip: Goa/Kerala?');
  await expect(fileName).toHaveValue('Trip- Goa-Kerala-');
});
