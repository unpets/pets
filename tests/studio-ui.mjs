import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('button', { name, exact: true })
    .click();
async function save(menu, name) {
  await page.getByRole('menuitem', { name: menu, exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name, exact: true }).click();
  const file = await pending;
  return JSON.parse(await readFile(await file.path(), 'utf8'));
}
try {
  await page.goto(pathToFileURL(resolve('dist/index.html')).href);
  await page.waitForFunction(() => window.kernelViewer?.ready);
  await page.evaluate(() => {
    window.savedViewer = window.kernelViewer;
    window.kernelViewer.seek(0);
  });
  assert.doesNotMatch(
    await page.locator('header').innerText(),
    /\d+\.\d+\.\d+/,
  );
  await page.getByRole('menuitem', { name: 'File', exact: true }).focus();
  await page.keyboard.press('ArrowDown');
  assert.equal(
    await page.getByRole('menu', { name: 'File', exact: true }).count(),
    1,
  );
  await page.keyboard.press('ArrowRight');
  assert.equal(
    await page.getByRole('menu', { name: 'Export', exact: true }).count(),
    1,
  );
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('menu').count(), 0);
  assert.equal(
    await page.evaluate(() => document.activeElement.textContent),
    'Export',
  );
  const camera = page.locator('.inspector-stack').filter({
    has: page.locator(':scope > .inspector-toggle', { hasText: 'Camera' }),
  });
  await camera.locator('.inspector-toggle').click();
  assert.equal(
    await page.getByLabel('Field of view', { exact: true }).isVisible(),
    false,
  );
  await camera.locator('.inspector-toggle').click();
  await workspace('Persona');
  assert.equal(
    await page.getByRole('region', { name: 'Persona', exact: true }).count(),
    1,
  );
  assert.equal(await page.locator('#viewport').isVisible(), false);
  await workspace('Face');
  assert.equal(
    await page
      .getByRole('complementary', { name: 'Compositions library' })
      .count(),
    0,
  );
  assert.equal(
    await page.getByRole('complementary', { name: 'Screens library' }).count(),
    1,
  );
  assert.equal(
    await page.evaluate(() => window.savedViewer === window.kernelViewer),
    true,
  );
  await page
    .getByRole('button', { name: 'Duplicate screen', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Rename screen', exact: true })
    .click();
  await page
    .getByLabel('Screen name', { exact: true })
    .fill('Independent face');
  await page.getByRole('button', { name: 'Save name', exact: true }).click();
  await page.getByLabel('Eye layout').selectOption('mirrored');
  assert.equal(await page.getByLabel('Right eye asset').isDisabled(), true);
  await workspace('Face');
  await page
    .getByRole('navigation', { name: 'Face library' })
    .getByRole('button', { name: 'Components', exact: true })
    .click();
  await page.getByLabel('New face asset name').fill('Shared eye');
  await page
    .getByRole('button', { name: 'New pixel component', exact: true })
    .click();
  const canvas = page.getByLabel('Paint clip frame');
  await canvas.waitFor();
  await page.getByLabel('Brush color').fill('#ff8800');
  const box = await canvas.boundingBox();
  await page.mouse.click(
    box.x + (20.5 * box.width) / 96,
    box.y + (30.5 * box.height) / 64,
  );
  await workspace('Face');
  await page
    .locator('.face-slot')
    .filter({ has: page.locator('summary', { hasText: 'Left eye' }) })
    .locator('summary')
    .click();
  await page.getByLabel('Left eye asset').selectOption({ label: 'Shared eye' });
  await page.evaluate(() => window.kernelViewer.seek(0));
  const pixels = await page.evaluate(() => {
    const context = document.querySelector('#screen').getContext('2d');
    return [20, 75].map((x) => [...context.getImageData(x, 30, 1, 1).data]);
  });
  assert.deepEqual(pixels, [
    [255, 136, 0, 255],
    [255, 136, 0, 255],
  ]);
  await page.getByLabel('Eye layout').selectOption('independent');
  assert.equal(await page.getByLabel('Right eye asset').isDisabled(), false);
  await page
    .locator('.face-slot')
    .filter({ has: page.locator('summary', { hasText: 'Right eye' }) })
    .locator('summary')
    .click();
  const options = await page
    .getByLabel('Right eye asset')
    .locator('option')
    .evaluateAll((nodes) => nodes.map((node) => node.value).filter(Boolean));
  await page
    .getByLabel('Right eye asset')
    .selectOption(options.find((id) => id !== 'shared-eye'));
  await page.getByLabel('Right eye offset', { exact: true }).fill('0.25');
  await page.getByLabel('Right eye offset', { exact: true }).press('Tab');
  const reusable = await save('Export', 'Export reusable screen');
  const screenId = reusable.selection.id;
  assert.equal(reusable.selection.kind, 'screen');
  assert.equal(reusable.screens[screenId].data.eyeMode, 'independent');
  assert.equal(
    reusable.screens[screenId].bindings['screen/eyeLeft'].clip,
    'shared-eye',
  );
  assert.equal(
    reusable.screens[screenId].bindings['screen/eyeRight'].offset,
    0.25,
  );
  assert.ok(reusable.clips['shared-eye']);
  await workspace('Composition');
  await page.locator('[data-state="idle"]').click();
  await page
    .getByLabel('Composition screen', { exact: true })
    .selectOption(screenId);
  await page.locator('[data-state="review"]').click();
  await page
    .getByLabel('Composition screen', { exact: true })
    .selectOption(screenId);
  await workspace('Face');
  const project = await save('File', 'Save complete project');
  assert.equal(project.animations.compositions.idle.screen, screenId);
  assert.equal(project.animations.compositions.review.screen, screenId);
  assert.equal(project.selection.screen, screenId);
  await page.getByLabel('Import project file').setInputFiles({
    name: 'shared.pets.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.waitForFunction(
    () =>
      !document.querySelector('.studio-shell').hasAttribute('aria-busy') ||
      document.querySelector('.studio-shell').getAttribute('aria-busy') ===
        'false',
  );
  assert.equal(await page.getByLabel('Eye layout').inputValue(), 'independent');
  assert.deepEqual(await save('File', 'Save complete project'), project);
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await workspace('Persona');
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.getByRole('menuitem', { name: 'Assets', exact: true }).click();
    const bounds = await page
      .getByRole('menu', { name: 'Assets', exact: true })
      .boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
    await page.keyboard.press('Escape');
  }
  assert.deepEqual(errors, []);
  console.log(
    'Menu keyboard navigation, collapsible sections, Persona, screen references, independent eyes, shared face assets, project round trips, and responsive layout passed.',
  );
} finally {
  await browser.close();
}
