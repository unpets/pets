import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
import { pathToFileURL } from 'node:url';
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  headless: true,
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(pathToFileURL(resolve('dist/index.html')).href);
  await page.waitForFunction(() => window.kernelViewer?.ready);
  await page.evaluate(() => {
    window.assetSerializations = 0;
    const stringify = JSON.stringify;
    JSON.stringify = function (value, ...args) {
      if (value?.ports && value?.states && value?.project)
        window.assetSerializations++;
      return stringify.call(JSON, value, ...args);
    };
  });
  assert.ok(
    (await page.locator('.studio-status').textContent()).includes(
      `${version} [`,
    ),
  );
  assert.doesNotMatch(
    await page.locator('.studio-status').textContent(),
    /\(dev\)|Space to play/,
  );
  await page.evaluate(() => {
    document.activeElement?.blur();
    document.body.focus();
  });
  await page.keyboard.press('Space');
  await page
    .getByRole('button', { name: 'Play animation', exact: true })
    .waitFor();
  await page.keyboard.press('Space');
  await page
    .getByRole('button', { name: 'Pause animation', exact: true })
    .waitFor();
  await page.getByRole('button', { name: 'Composition', exact: true }).click();
  await page.evaluate(() => window.kernelViewer.setMode('move'));
  const direction = () =>
    page.evaluate(() => {
      const m = window.kernelViewer.parts.body.matrixWorld.elements;
      return (Math.atan2(-m[4], m[5]) * 180) / Math.PI;
    });
  await page.getByLabel('Composition heading', { exact: true }).fill('90');
  await page.getByLabel('Composition heading', { exact: true }).press('Tab');
  assert.ok(Math.abs(await direction()) < 85, 'heading must not snap');
  await page.waitForFunction(() => {
    const m = window.kernelViewer.parts.body.matrixWorld.elements;
    return Math.abs((Math.atan2(-m[4], m[5]) * 180) / Math.PI - 90) < 2;
  });
  await page
    .getByLabel('Composition travel heading', { exact: true })
    .fill('180');
  await page
    .getByLabel('Composition travel heading', { exact: true })
    .press('Tab');
  await page.getByLabel('Composition walk speed', { exact: true }).fill('1.4');
  await page.getByLabel('Composition walk speed', { exact: true }).press('Tab');
  assert.equal(
    await page
      .getByLabel('Composition animation speed', { exact: true })
      .inputValue(),
    '1',
  );
  assert.equal(await page.evaluate(() => window.assetSerializations), 0);
  async function walkSpeed(speed) {
    const input = page.getByLabel('Composition walk speed', { exact: true });
    await input.fill(String(speed));
    await input.press('Tab');
    await page.waitForTimeout(800);
  }
  async function travelled() {
    const start = await page.evaluate(() => window.kernelViewer.travelDistance);
    await page.waitForTimeout(700);
    return (
      (await page.evaluate(() => window.kernelViewer.travelDistance)) - start
    );
  }
  await walkSpeed(0);
  assert.ok((await travelled()) < 0.02, 'zero walk speed stops translation');
  await walkSpeed(0.7);
  const slow = await travelled();
  await walkSpeed(1.4);
  const fast = await travelled();
  assert.ok(
    slow > 0.1 && fast > slow * 1.5,
    `walk speed changes actual travel: ${slow} m versus ${fast} m`,
  );
  await page.evaluate(() => window.kernelViewer.setPlaying(false));
  assert.equal(await travelled(), 0, 'paused playback stops travel');
  await page.evaluate(() => window.kernelViewer.seek(0));
  assert.equal(
    await page.evaluate(() => window.kernelViewer.travelDistance),
    0,
  );
  await page.getByRole('button', { name: 'Scene', exact: true }).click();
  await page.getByLabel('Preview travel', { exact: true }).uncheck();
  await page.evaluate(() => window.kernelViewer.setPlaying(true));
  assert.equal(await travelled(), 0, 'in-place preview disables translation');
  await page.getByLabel('Preview travel', { exact: true }).check();
  await page.getByRole('button', { name: 'Composition', exact: true }).click();
  await page.evaluate(() => window.kernelViewer.setMode('flying'));
  await page.waitForFunction(() =>
    window.kernelViewer.parts['foot.L'].children.some(
      (node) => node.isInstancedMesh && node.visible && node.count === 16,
    ),
  );
  for (const mode of ['climb-rope', 'climb-ladder', 'climb-border']) {
    await page.evaluate((mode) => window.kernelViewer.setMode(mode), mode);
    assert.equal(
      await page.getByLabel('Composition parent').inputValue(),
      'climbing',
    );
    assert.equal(
      await page.evaluate(
        () =>
          window.kernelViewer.parts['foot.L'].children.filter(
            (node) => node.isInstancedMesh && node.visible,
          ).length,
      ),
      0,
    );
  }
  await page
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('button', { name: 'Animation', exact: true })
    .click();
  await page.getByLabel('New animation name').fill('Custom trail');
  await page.getByRole('button', { name: 'Add FX layer', exact: true }).click();
  await page.getByLabel('Effect attachments').selectOption(['forearm.R']);
  await page.getByLabel('Effect count', { exact: true }).fill('24');
  await page.getByLabel('Effect count', { exact: true }).press('Tab');
  await page.waitForFunction(() =>
    window.kernelViewer.parts['forearm.R'].children.some(
      (node) => node.isInstancedMesh && node.visible && node.count === 24,
    ),
  );
  await mkdir('build/locomotion-checks', { recursive: true });
  await page.screenshot({ path: 'build/locomotion-checks/studio.png' });
  assert.deepEqual(errors, []);
  console.log(
    'Continuous heading, independent travel speed, flight FX, climbing inheritance, FX editing, build identity and Space shortcut passed.',
  );
} finally {
  await browser.close();
}
