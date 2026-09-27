import { chromium, firefox } from '@playwright/test';
import { mkdtemp, copyFile, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const port = 4173;
const server = spawn('bun', ['run', 'preview', '--', '--port', String(port)], {
  stdio: 'pipe',
});
let browser;
const standalone = await mkdtemp(join(tmpdir(), 'kernel-viewer-'));
await copyFile('dist/index.html', join(standalone, 'Kernel.html'));
assert.deepEqual(await readdir('dist'), ['index.html']);
const engine =
  process.env.PLAYWRIGHT_BROWSER === 'firefox' ? firefox : chromium;
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
  browser = await engine.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    headless: true,
    args:
      engine === chromium
        ? [
            '--no-sandbox',
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
          ]
        : [],
  });
  for (const [transport, url] of [
    ['http', `http://127.0.0.1:${port}/`],
    ['file', pathToFileURL(join(standalone, 'Kernel.html')).href],
  ]) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const requests = [];
    await page.route('**/*', (route) => {
      const requested = route.request().url();
      if (requested === url || /^(data|blob):/.test(requested))
        return route.continue();
      requests.push(requested);
      return route.abort();
    });
    await page.goto(url);
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
    await page.screenshot({ path: `build/viewer-${transport}-desktop.png` });
    const display = await page
      .locator('#screen')
      .evaluate((canvas) => canvas.toDataURL());
    await page.locator('#play').click();
    await page.waitForFunction(
      (previous) => document.querySelector('#screen').toDataURL() !== previous,
      display,
    );
    await page.locator('#play').click();
    await page.locator('#speed').selectOption('2');
    assert.equal(await page.locator('#speed').inputValue(), '2');
    await page.locator('#timeline').fill('500');
    assert.equal(await page.locator('#timeline').inputValue(), '500');
    for (const [label, name] of [
      ['Download 3D model', 'kernel.glb'],
      ['Animation data', 'animations.json'],
    ]) {
      const pending = page.waitForEvent('download');
      await page.getByRole('link', { name: label, exact: true }).click();
      const download = await pending;
      assert.equal(download.suggestedFilename(), name);
      assert.deepEqual(
        await readFile(await download.path()),
        await readFile(resolve('web/public/assets', name)),
      );
    }
    await page.locator('[data-view="back"]').click();
    assert.ok(
      (await page.evaluate(() => window.kernelViewer.camera.position.y)) > 0,
    );
    await page.locator('[data-view="home"]').click();
    await page.locator('#joints').check();
    await page.locator('#wireframe').check();
    await page.locator('#wireframe').uncheck();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: `build/viewer-${transport}-mobile.png`,
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
    await page.close();
    console.log(
      `${transport}: all modes, playback, screen, scrubbing, camera, downloads and mobile checks passed without external requests.`,
    );
  }
  console.log(
    'Viewer checks passed: 10 modes, playback state, server visibility, camera, controls, mobile overflow, no browser errors.',
  );
} finally {
  await browser?.close();
  server.kill();
  await rm(standalone, { recursive: true, force: true });
}
