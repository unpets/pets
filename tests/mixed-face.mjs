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
async function download(menu, item) {
  await page.getByRole('menuitem', { name: menu, exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: item, exact: true }).click();
  return JSON.parse(await readFile(await (await pending).path(), 'utf8'));
}
try {
  await page.goto(pathToFileURL(resolve('dist/index.html')).href);
  await page.waitForFunction(() => window.kernelViewer?.ready);
  await workspace('Face');
  await page.getByRole('button', { name: 'Components', exact: true }).click();
  await page.getByLabel('New face asset name').fill('Mesh eye');
  await page
    .getByRole('button', { name: 'New mesh component', exact: true })
    .click();
  await page.getByLabel('Mesh geometry').selectOption('sphere');
  await page.getByLabel('scale X', { exact: true }).fill('0.21');
  await page.getByLabel('scale X', { exact: true }).press('Tab');
  await page.getByLabel('New face asset name').fill('Twin eye');
  await page
    .getByRole('button', { name: 'Duplicate face component', exact: true })
    .click();
  await page.getByRole('button', { name: 'Faces', exact: true }).click();
  const slot = page
    .locator('.face-slot')
    .filter({ has: page.locator('summary').filter({ hasText: 'Mesh eye' }) });
  await slot.locator('summary').click();
  await page
    .getByLabel('Mesh eye asset', { exact: true })
    .selectOption('mesh-eye-clip');
  await slot.getByLabel('position X', { exact: true }).fill('0.2');
  await slot.getByLabel('position X', { exact: true }).press('Tab');
  await page.getByLabel('Canvas surface', { exact: true }).uncheck();
  await page.waitForFunction(() => {
    const head = window.kernelViewer.parts.head;
    const display = head.children.find((node) => node.userData.is_display);
    let visibleMesh = false;
    head.traverse((node) => {
      if (node.name === 'mesh-eye') visibleMesh = node.visible;
    });
    return display?.visible === false && visibleMesh;
  });
  const saved = await download('File', 'Save complete project');
  assert.equal(
    saved.animations.screens[saved.selection.screen].surface.canvas,
    false,
  );
  assert.equal(
    saved.animations.screens[saved.selection.screen].surface.placements[
      'mesh-eye'
    ].position[0],
    0.2,
  );
  const bundle = await download('Export', 'Export reusable screen');
  assert.equal(bundle.components['mesh-eye'].kind, 'face-mesh');
  assert.equal(saved.animations.components['twin-eye'].kind, 'face-mesh');
  assert.equal(saved.animations.clips['twin-eye'].component, 'twin-eye');
  assert.equal(bundle.clips['mesh-eye-clip'].data.keyframes[0].scale[0], 0.21);
  await page.getByLabel('Import project file').setInputFiles({
    name: 'mixed-face.pets.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await page.waitForFunction(
    () =>
      document.querySelector('.studio-shell').getAttribute('aria-busy') ===
      'false',
  );
  await workspace('Face');
  await page.getByRole('button', { name: 'Faces', exact: true }).click();
  await page.waitForFunction(() => {
    const head = window.kernelViewer.parts.head;
    return (
      head.children.find((node) => node.userData.is_display)?.visible === false
    );
  });
  await page.getByLabel('Canvas surface', { exact: true }).check();
  await workspace('Composition');
  await page.locator('[data-state="climb-rope"]').click();
  await page.evaluate(() => {
    window.kernelViewer.setPlaying(false);
    window.kernelViewer.seek(0.2);
  });
  const grips = await page.evaluate(() => {
    const parts = window.kernelViewer.parts;
    let count = 0;
    parts.body.parent.parent.traverse((node) => {
      if (node.name?.startsWith('grip/') && node.visible) count++;
    });
    return {
      count,
      hand: parts['hand.R'].visible,
      foot: parts['foot.R'].visible,
    };
  });
  assert.equal(grips.count, 12);
  assert.equal(grips.hand, false);
  assert.equal(grips.foot, false);
  await page
    .getByLabel('Animation component')
    .selectOption('grip/hand.R/housing');
  await page
    .getByRole('complementary', { name: 'Composition editor' })
    .getByRole('checkbox', { name: 'Enabled', exact: true })
    .uncheck();
  await page.waitForFunction(() => window.kernelViewer.parts['hand.R'].visible);
  const changed = await download('File', 'Save complete project');
  assert.equal(
    changed.animations.compositions['climb-rope'].bindings[
      'grip/hand.R/housing'
    ].enabled,
    false,
  );
  await page.locator('[data-state="idle"]').click();
  await page.waitForFunction(
    () =>
      window.kernelViewer.parts['hand.R'].visible &&
      window.kernelViewer.parts['foot.R'].visible,
  );
  await mkdir('build/review', { recursive: true });
  await page.screenshot({ path: 'build/review/mixed-face.png' });
  assert.deepEqual(errors, []);
  console.log(
    'Mesh face authoring, portable assets, mesh-only playback, and robotic grip selection passed.',
  );
} finally {
  await browser.close();
}
