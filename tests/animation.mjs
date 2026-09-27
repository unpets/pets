import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
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
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(pathToFileURL(resolve('dist/index.html')).href);
  await page.waitForFunction(() => window.kernelViewer?.ready);
  await page.evaluate(() => window.kernelViewer.seek(0));
  await page.getByRole('button', { name: 'Animation', exact: true }).click();
  assert.equal(await page.getByLabel('Clip duration').inputValue(), '1');
  await page.evaluate(() => window.kernelViewer.setMode('idle'));
  await page.waitForFunction(
    () =>
      document.querySelector('[aria-label="Clip duration"]').value === '4.8',
  );
  await page.evaluate(() => window.kernelViewer.setMode('running'));
  await page.waitForFunction(
    () => document.querySelector('[aria-label="Clip duration"]').value === '1',
  );
  await page.getByLabel('New animation name').fill('Custom greeting');
  await page
    .getByRole('button', { name: 'Duplicate composition', exact: true })
    .click();
  await page.waitForFunction(
    () => window.kernelViewer.state === 'custom-greeting',
  );
  await page.getByLabel('Animation component').selectOption('screen/eyes');
  await page.getByLabel('New animation name').fill('Custom eyes');
  await page
    .getByRole('button', { name: 'New pixel clip', exact: true })
    .click();
  const canvas = page.getByLabel('Paint clip frame');
  await canvas.waitFor({ state: 'visible' });
  const box = await canvas.boundingBox();
  await page.mouse.click(
    box.x + (40.5 * box.width) / 96,
    box.y + (25.5 * box.height) / 64,
  );
  await page
    .getByRole('button', { name: 'Add clip frame', exact: true })
    .click();
  await page.getByLabel('Brush color').fill('#ff8800');
  await page.mouse.click(
    box.x + (40.5 * box.width) / 96,
    box.y + (25.5 * box.height) / 64,
  );
  await page.evaluate(() => window.kernelViewer.seek(0.9));
  const pixel = () =>
    page.evaluate(() =>
      Array.from(
        document
          .querySelector('#screen')
          .getContext('2d')
          .getImageData(40, 25, 1, 1).data,
      ),
    );
  await page.waitForFunction(
    () =>
      document
        .querySelector('#screen')
        .getContext('2d')
        .getImageData(40, 25, 1, 1).data[0] === 255,
  );
  assert.deepEqual(await pixel(), [255, 136, 0, 255]);
  await page.getByLabel('New animation name').fill('Second greeting');
  await page
    .getByRole('button', { name: 'Duplicate composition', exact: true })
    .click();
  await page.waitForFunction(
    () => window.kernelViewer.state === 'second-greeting',
  );
  assert.deepEqual(
    await pixel(),
    [255, 136, 0, 255],
    'Independent eye clock must survive a composition switch',
  );
  await page.getByLabel('Component clock').selectOption('composition');
  await page.waitForFunction(
    () =>
      document
        .querySelector('#screen')
        .getContext('2d')
        .getImageData(40, 25, 1, 1).data[0] === 79,
  );
  assert.deepEqual(await pixel(), [79, 239, 243, 255]);
  await page.getByLabel('New animation name').fill('Badge');
  await page
    .getByRole('button', { name: 'Add screen layer', exact: true })
    .click();
  assert.equal(
    await page.getByLabel('Animation component').inputValue(),
    'badge',
  );
  await page.screenshot({ path: 'build/studio-animation.png' });
  const pending = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Import and export', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Save animations', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Close project files', exact: true })
    .click();
  const download = await pending;
  assert.equal(download.suggestedFilename(), 'pets-animation.json');
  const project = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(project.clips['custom-eyes'].data.frames.length, 2);
  assert.equal(project.components.badge.kind, 'screen');
  assert.equal(
    project.compositions['custom-greeting'].bindings['screen/eyes'].clock,
    'independent',
  );
  await page.getByText('Right arm action', { exact: true }).click();
  await page.getByLabel('Right arm action motion').selectOption('waving');
  await page.getByLabel('Head movement motion').selectOption('look');
  await page.getByLabel('Head movement speed').fill('0.5');
  await page.getByLabel('Head movement speed').press('Tab');
  await page.getByLabel('Animation component').selectOption('rig/hand.R');
  assert.equal(
    await page.getByLabel('Component clip').inputValue(),
    'rig/hand.R/waving',
  );
  assert.equal(
    await page.getByLabel('Component clock').inputValue(),
    'independent',
  );
  await page.getByLabel('Animation component').selectOption('rig/head');
  assert.equal(
    await page.getByLabel('Component clip').inputValue(),
    'rig/head/look',
  );
  assert.equal(await page.getByLabel('Component speed').inputValue(), '0.5');

  await page.getByLabel('New animation name').fill('Head tilt');
  await page
    .getByRole('button', { name: 'New rotation clip', exact: true })
    .click();
  await page.getByText('Clip data', { exact: true }).click();
  await page.getByLabel('Clip data', { exact: true }).fill(
    JSON.stringify({
      keyframes: [
        { time: 0, rotation: [0, 0, 15] },
        { time: 1, rotation: [0, 0, 15] },
      ],
    }),
  );
  await page
    .getByRole('button', { name: 'Apply clip data', exact: true })
    .click();
  assert.equal(await page.getByRole('alert').count(), 0);
  await page.getByLabel('Import project file').setInputFiles({
    name: 'pets-animation.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.waitForFunction(
    () => window.kernelViewer.state === 'second-greeting',
  );
  await page.close();
  const pet = await browser.newPage();
  pet.on('pageerror', (error) => errors.push(error.message));
  await pet.goto(pathToFileURL(resolve('dist-pet/pet.html')).href);
  await pet.waitForFunction(() => window.kernelPet?.ready);
  await pet.getByRole('button', { name: 'Pet controls', exact: true }).click();
  await pet.locator('input[type=file]').setInputFiles({
    name: 'pets-animation.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await pet.locator('.pet-controls select').selectOption('custom-greeting');
  await pet.waitForFunction(() => window.kernelPet.state === 'custom-greeting');
  assert.deepEqual(errors, []);
  console.log(
    'Composition creation, independent clocks, pixel clips, joint clips, new layers, round trips, and companion imports passed.',
  );
} finally {
  await browser.close();
}
