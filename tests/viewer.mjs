import { chromium, firefox } from '@playwright/test';
import { mkdtemp, copyFile, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { parseAnimationProject } from '../packages/three-runtime/src/project.ts';
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
    ...(engine === firefox
      ? { firefoxUserPrefs: { 'webgl.force-enabled': true } }
      : {}),
    executablePath:
      engine === chromium
        ? process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        : undefined,
    headless: engine === chromium || !process.env.DISPLAY,
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
    await page.waitForFunction(
      () =>
        window.kernelViewer?.ready || document.querySelector('[role="alert"]'),
      undefined,
      { timeout: 30000 },
    );
    assert.ok(
      await page.evaluate(() => window.kernelViewer?.ready),
      await page.locator('[role="alert"]').allTextContents(),
    );
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
      assert.equal(
        await page.evaluate(
          () =>
            window.kernelViewer.parts.keyboard.visible &&
            window.kernelViewer.parts['keyboard.L'].visible,
        ),
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
      const actual = await readFile(await download.path());
      const expected = await readFile(
        resolve('personas/kernel/generated/assets', name),
      );
      if (name.endsWith('.json')) {
        const document = JSON.parse(expected);
        document.project = parseAnimationProject(document.project);
        assert.deepEqual(
          JSON.parse(actual),
          JSON.parse(JSON.stringify(document)),
        );
      } else assert.deepEqual(actual, expected);
    }
    await page.locator('[data-view="back"]').click();
    assert.ok(
      (await page.evaluate(() => window.kernelViewer.camera.position.y)) > 0,
    );
    await page.locator('[data-view="home"]').click();
    await page.locator('#joints').check();
    await page.locator('#wireframe').check();
    await page.locator('#wireframe').uncheck();
    await page
      .getByRole('slider', { name: 'Field of view', exact: true })
      .fill('45');
    assert.equal(await page.evaluate(() => window.kernelViewer.camera.fov), 45);
    await page.getByRole('button', { name: 'Reset viewport settings' }).click();
    await page.evaluate(() => window.kernelViewer.seek(0.5));
    await page.getByRole('button', { name: 'Next frame', exact: true }).click();
    assert.match(await page.getByLabel('Current frame').textContent(), /062/);
    await page
      .getByRole('button', { name: 'Previous frame', exact: true })
      .click();
    assert.match(await page.getByLabel('Current frame').textContent(), /061/);
    await page.getByRole('button', { name: 'Loop animation' }).click();
    await page.evaluate(() => {
      window.kernelViewer.seek(0.99);
      window.kernelViewer.setPlaying(true);
    });
    await page.waitForFunction(
      () => document.querySelector('#timeline').value === '1000',
    );
    assert.equal(
      await page.locator('#play').getAttribute('aria-label'),
      'Play animation',
    );
    await page.getByRole('button', { name: 'Loop animation' }).click();
    await page.evaluate(() => window.kernelViewer.seek(0.25));

    await page.getByRole('button', { name: 'Screen', exact: true }).click();
    await page
      .getByLabel('Screen canvas', { exact: true })
      .waitFor({ state: 'visible' });
    await page.waitForFunction(
      () =>
        document.querySelector('#screen').getBoundingClientRect().width >= 288,
    );
    const previewBox = await page.locator('#screen').boundingBox();
    const inspectorBox = await page
      .getByRole('complementary', { name: 'Screen editor' })
      .boundingBox();
    assert.ok(previewBox.width >= 288);
    assert.ok(inspectorBox.x > previewBox.x + previewBox.width);
    await page.getByLabel('Layer horizontal offset', { exact: true }).fill('5');
    await page.getByLabel('Layer opacity', { exact: true }).fill('0.45');
    await page
      .getByRole('button', { name: 'Undo screen edit', exact: true })
      .click();
    assert.equal(
      await page.getByLabel('Layer opacity', { exact: true }).inputValue(),
      '1',
    );
    assert.equal(
      await page
        .getByLabel('Layer horizontal offset', { exact: true })
        .inputValue(),
      '5',
    );
    await page
      .getByRole('button', { name: 'Redo screen edit', exact: true })
      .click();
    assert.equal(
      await page.getByLabel('Layer opacity', { exact: true }).inputValue(),
      '0.45',
    );
    await page
      .getByRole('button', { name: 'Reset selected layer', exact: true })
      .click();
    assert.equal(
      await page
        .getByLabel('Layer horizontal offset', { exact: true })
        .inputValue(),
      '0',
    );
    await page
      .getByRole('button', { name: 'Terminal palette', exact: true })
      .click();
    assert.equal(
      await page.getByLabel('Screen lines color', { exact: true }).inputValue(),
      '#74ef9a',
    );
    assert.equal(
      await page.getByLabel('Screen text color', { exact: true }).inputValue(),
      '#74ef9a',
    );
    await page
      .getByLabel('Screen lines color', { exact: true })
      .fill('#cc9944');
    assert.equal(
      await page.getByLabel('Screen text color', { exact: true }).inputValue(),
      '#cc9944',
    );
    await page
      .getByRole('button', { name: 'Solo eyes layer', exact: true })
      .click();
    const savedProject = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Import and export', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Save screen', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Close project files', exact: true })
      .click();
    const projectDownload = await savedProject;
    const project = JSON.parse(
      await readFile(await projectDownload.path(), 'utf8'),
    );
    assert.ok(Object.values(project.layers).every((layer) => layer.visible));
    assert.equal(project.palette.lines, '#cc9944');
    await page
      .getByRole('button', { name: 'Solo eyes layer', exact: true })
      .click();
    project.layers.eyes.x = -4;
    await page
      .getByLabel('Import project file', { exact: true })
      .setInputFiles({
        name: 'screen.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(project)),
      });
    await page.waitForFunction(
      () =>
        document.querySelector('[aria-label="Layer horizontal offset"]')
          .value === '-4',
    );
    assert.equal(
      await page
        .getByLabel('Layer horizontal offset', { exact: true })
        .inputValue(),
      '-4',
    );
    await page
      .getByRole('button', { name: 'Undo screen edit', exact: true })
      .click();
    assert.equal(
      await page
        .getByLabel('Layer horizontal offset', { exact: true })
        .inputValue(),
      '0',
    );
    await page
      .getByLabel('Import project file', { exact: true })
      .setInputFiles({
        name: 'invalid.json',
        mimeType: 'application/json',
        buffer: Buffer.from('{}'),
      });
    await page.getByRole('alert').waitFor({ state: 'visible' });
    assert.equal(await page.getByRole('alert').count(), 1);
    assert.equal(
      await page
        .getByLabel('Layer horizontal offset', { exact: true })
        .inputValue(),
      '0',
    );
    await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
    await page
      .getByRole('button', { name: 'Reset screen project', exact: true })
      .click();
    await page.getByRole('button', { name: 'Pixel grid', exact: true }).click();
    await page.screenshot({ path: `build/viewer-${transport}-screen.png` });
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
      `${transport}: all modes, frame stepping, camera, screen history, palette, imports, exports and mobile checks passed without external requests.`,
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
