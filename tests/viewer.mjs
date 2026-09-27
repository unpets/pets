import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const port = 4173;
const server = spawn(
  process.execPath,
  ['run', 'preview', '--', '--port', String(port)],
  { stdio: 'pipe' },
);
let browser;
try {
  await new Promise((resolve, reject) => {
    let log = '';
    server.stdout.on('data', (b) => {
      log += b;
      if (log.includes('4173')) resolve();
    });
    server.stderr.on('data', (b) => {
      log += b;
    });
    server.on('exit', (code) => reject(Error(log + ' exit ' + code)));
    setTimeout(
      () => reject(Error('Vite preview did not start: ' + log)),
      20000,
    ).unref();
  });
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.kernelViewer?.ready, undefined, {
    timeout: 30000,
  });
  assert.equal(
    await page.locator('main').evaluate((el) => getComputedStyle(el).display),
    'grid',
  );
  assert.ok(
    (await page.locator('#viewport').evaluate((el) => el.clientHeight)) > 450,
  );
  await page.evaluate(() => window.kernelViewer.seek(0.25));
  assert.equal(
    await page.evaluate(() => window.kernelViewer.serverVisible),
    true,
  );
  assert.equal(await page.locator('#speed').inputValue(), '1');
  for (const state of [
    'idle',
    'running-right',
    'running-left',
    'waving',
    'jumping',
    'failed',
    'waiting',
    'running',
    'review',
    'look',
  ]) {
    await page.locator(`[data-state="${state}"]`).click();
    await page.evaluate(() => window.kernelViewer.seek(0.5));
    assert.equal(await page.evaluate(() => window.kernelViewer.state), state);
    assert.equal(
      await page
        .locator(`[data-state="${state}"]`)
        .getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(
      await page.evaluate(() => window.kernelViewer.serverVisible),
      state === 'running',
    );
  }
  await page.locator('[data-state="running"]').click();
  await page.evaluate(() => window.kernelViewer.seek(0.25));
  await page.screenshot({ path: 'build/viewer-desktop.png' });
  await page.locator('[data-view="back"]').click();
  assert.ok(
    (await page.evaluate(() => window.kernelViewer.camera.position.y)) > 0,
  );
  await page.locator('[data-view="home"]').click();
  await page.locator('#joints').check();
  await page.locator('#wireframe').check();
  await page.locator('#wireframe').uncheck();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'build/viewer-mobile.png', fullPage: true });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    'Viewer checks passed: 10 modes, playback state, server visibility, camera, controls, mobile overflow, no browser errors.',
  );
} finally {
  await browser?.close();
  server.kill();
}
