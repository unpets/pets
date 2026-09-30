import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const workspace = (name) =>
  page
    .getByRole('navigation', { name: 'Workspace', exact: true })
    .getByRole('button', { name, exact: true })
    .click();
async function save() {
  await page.getByRole('menuitem', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page
    .getByRole('menuitem', { name: 'Save complete project', exact: true })
    .click();
  return JSON.parse(await readFile(await (await pending).path(), 'utf8'));
}
try {
  await page.clock.install();
  await page.goto(pathToFileURL(resolve('dist/index.html')).href);
  await page.waitForFunction(() => window.kernelViewer?.ready);
  await workspace('Composition');
  await page.locator('[data-state="climb-ladder"]').click();
  assert.equal(
    await page
      .getByRole('button', { name: 'Rename composition', exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(
    await page
      .getByRole('button', { name: 'Delete composition', exact: true })
      .isDisabled(),
    true,
  );
  await page.getByLabel('Supported motion').uncheck();
  assert.equal(
    (await save()).animations.compositions['climb-ladder'].enabled,
    false,
  );
  await page.getByLabel('Supported motion').check();
  await page.getByLabel('New composition name').fill('Custom climb');
  await page.getByRole('button', { name: 'Create child', exact: true }).click();
  await page
    .getByRole('button', { name: 'Rename composition', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Rename composition' });
  await dialog.waitFor();
  const panel = await page
    .getByRole('complementary', { name: 'Compositions library' })
    .boundingBox();
  const modal = await dialog.boundingBox();
  assert.ok(modal.x > panel.x + panel.width);
  await dialog.getByLabel('Composition name').fill('Custom ascent');
  await dialog.getByRole('button', { name: 'Save name' }).click();
  const project = await save();
  assert.equal(
    project.animations.compositions['custom-climb'].label,
    'Custom ascent',
  );
  assert.equal(
    project.animations.compositions['custom-climb'].parent,
    'climb-ladder',
  );
  await workspace('Animation');
  await page.getByLabel('Animation component').selectOption('rig/arm.R');
  await page.getByText('Individual joint authoring', { exact: true }).click();
  await page.getByLabel('Extract joint').selectOption('hand.R');
  await page
    .getByRole('button', { name: 'Extract joint layer', exact: true })
    .click();
  const separated = await save();
  assert.deepEqual(separated.animations.components['rig-hand-r'].data.nodes, [
    'hand.R',
  ]);
  assert.ok(
    !separated.animations.components['rig/arm.R'].data.nodes.includes('hand.R'),
  );
  assert.ok(separated.animations.compositions.idle.bindings['rig-hand-r']);
  await workspace('Scene');
  await page.getByLabel('Environment object').selectOption('rope');
  await page.getByLabel('Environment position X').fill('2');
  await page.getByLabel('Environment position X').press('Tab');
  const pending = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Export environment', exact: true })
    .click();
  const environment = JSON.parse(
    await readFile(await (await pending).path(), 'utf8'),
  );
  assert.equal(environment.objects.rope.position[0], 2);
  assert.equal(environment.format, 'pets-environment');
  await workspace('Persona');
  await page
    .getByRole('button', { name: 'Duplicate persona', exact: true })
    .click();
  await page
    .getByLabel('Persona name', { exact: true })
    .fill('Environment independence');
  await page.getByRole('button', { name: 'Save persona', exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('.studio-shell').getAttribute('aria-busy') ===
      'false',
  );
  await workspace('Scene');
  await page.getByLabel('Environment object').selectOption('rope');
  assert.equal(
    await page.getByLabel('Environment position X').inputValue(),
    '2',
  );
  await page.getByLabel('Environment position X').fill('0');
  await page.getByLabel('Environment position X').press('Tab');
  await page.evaluate(() => {
    window.kernelViewer.setMode('climb-rope');
    window.kernelViewer.setPlaying(false);
    window.kernelViewer.seek(0.999);
  });
  await page.clock.pauseAt(
    await page.evaluate(() => new Date(Date.now() + 60_000)),
  );
  const before = await page.evaluate(
    () => window.kernelViewer.parts.body.matrixWorld.elements[14],
  );
  await page.evaluate(() => window.kernelViewer.setPlaying(true));
  await page.clock.fastForward(100);
  const after = await page.evaluate(
    () => window.kernelViewer.parts.body.matrixWorld.elements[14],
  );
  assert.ok(
    after > before,
    `Climbing carries root travel across cycles: ${before} to ${after}`,
  );
  await page.clock.resume();
  await page.evaluate(() => window.kernelViewer.setPlaying(false));
  await mkdir('build/review', { recursive: true });
  for (const mode of ['climb-rope', 'climb-ladder', 'climb-border']) {
    await page.evaluate((mode) => {
      window.kernelViewer.setMode(mode);
      window.kernelViewer.seek(0.5);
    }, mode);
    await page.screenshot({ path: `build/review/${mode}.png` });
  }
  assert.deepEqual(errors, []);
  console.log(
    'Protected motions, sidebar modals, portable independent environments, and continuous climbing passed.',
  );
} finally {
  await browser.close();
}
