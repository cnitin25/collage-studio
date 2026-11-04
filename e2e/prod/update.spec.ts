import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

// Taking a new version, with real service workers: the build, served by a
// little server here that can "release" a new sw.js. The store-driven specs
// (tests/app-update.spec.ts) run on the dev server, which has no worker, so
// they can't tell whether the worker's handover actually reloads the page.

test.skip(!!process.env.PROD_URL, 'releases a new version locally, so it needs the local build');

const dist = fileURLToPath(new URL('../../dist', import.meta.url));
const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

let server: Server;
let origin: string;
let release = 1;
let context: BrowserContext;

test.beforeAll(async () => {
  server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    const file = path === '/' ? '/index.html' : path;
    readFile(join(dist, file))
      .then((body) => {
        // Any change to sw.js makes it a new version to the browser.
        const out = file === '/sw.js' ? `${body.toString()}\n// release ${release}\n` : body;
        res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
        res.end(out);
      })
      .catch(() => {
        res.writeHead(404);
        res.end();
      });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  origin = `http://localhost:${(server.address() as AddressInfo).port}/`;
});

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test.beforeEach(async ({ browser }: { browser: Browser }) => {
  release = 1;
  context = await browser.newContext();
});

test.afterEach(async () => {
  await context.close();
});

const notice = (page: Page) => page.locator('.update-banner');
const isControlled = (page: Page) => page.evaluate(() => !!navigator.serviceWorker.controller);

/** A tab on the current release, its worker active and in control. */
async function openControlledTab(): Promise<Page> {
  const page = await context.newPage();
  await page.goto(origin);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  expect(await isControlled(page)).toBe(true);
  return page;
}

/** Publish a new version, and have `page` find it: it installs and waits. */
async function releaseNewVersion(page: Page) {
  release += 1;
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration())!.update();
  });
  await expect
    .poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())!.waiting))
    .toBe(true);
}

async function clickReload(page: Page) {
  await Promise.all([
    page.waitForEvent('load', { timeout: 15_000 }),
    notice(page).getByRole('button', { name: 'Reload' }).click(),
  ]);
  await expect(notice(page)).toHaveCount(0);
  await expect.poll(() => isControlled(page), 'the new worker runs the reloaded page').toBe(true);
}

test('Reload takes the new version', async () => {
  const page = await openControlledTab();
  await releaseNewVersion(page);
  await expect(notice(page)).toContainText('new version');
  await clickReload(page);
});

test('Reload also works on a page no worker controls: a hard reload, with another tab open', async () => {
  // The other tab keeps the old worker in place, so the new one stays waiting.
  const other = await openControlledTab();
  await releaseNewVersion(other);

  const page = await context.newPage();
  await page.goto(origin);
  const cdp = await context.newCDPSession(page);
  await Promise.all([page.waitForEvent('load'), cdp.send('Page.reload', { ignoreCache: true })]);
  expect(await isControlled(page), 'a hard reload bypasses the worker').toBe(false);
  await expect(notice(page)).toContainText('new version');

  await clickReload(page);
});
