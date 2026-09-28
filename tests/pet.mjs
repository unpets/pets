import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
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
  const page = await browser.newPage({ viewport: { width: 340, height: 380 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(pathToFileURL(resolve('dist-pet/pet.html')).href);
  await page.waitForFunction(() => window.kernelPet?.ready);
  await page.mouse.move(335, 15);
  await page.waitForFunction(
    () =>
      window.kernelPet.angles.yaw > 0.25 &&
      window.kernelPet.angles.pitch < -0.2,
  );
  await page.mouse.move(5, 375);
  await page.waitForFunction(
    () =>
      window.kernelPet.angles.yaw < -0.25 &&
      window.kernelPet.angles.pitch > 0.2,
  );
  for (const mode of [
    'idle',
    'move',
    'flying',
    'climbing',
    'climb-rope',
    'climb-ladder',
    'climb-border',
    'waving',
    'jumping',
    'failed',
    'waiting',
    'running',
    'review',
    'look',
  ]) {
    await page.evaluate((mode) => window.kernelPet.setMode(mode), mode);
    await page.waitForTimeout(270);
    assert.equal(await page.evaluate(() => window.kernelPet.state), mode);
  }
  await page.screenshot({ path: 'test-results/pet.png' });
  assert.deepEqual(errors, []);
  const studio = await browser.newPage({
    viewport: { width: 1280, height: 1100 },
  });
  studio.on('pageerror', (error) => errors.push(error.message));
  await studio.goto(pathToFileURL(resolve('dist/index.html')).href);
  await studio.waitForFunction(() => window.kernelViewer?.ready);
  await studio.getByRole('button', { name: 'Screen', exact: true }).click();
  await studio.evaluate(() => {
    window.kernelViewer.setMode('idle');
    window.kernelViewer.seek(0.2);
  });
  const pixels = () =>
    studio.locator('canvas').filter({ visible: true }).count();
  assert.ok((await pixels()) >= 2);
  await studio.getByLabel('Layer visible', { exact: true }).uncheck();
  await studio
    .getByRole('button', { name: 'Edit mouth layer', exact: true })
    .click();
  await studio
    .getByLabel('Layer horizontal offset', { exact: true })
    .fill('10');
  const downloadPromise = studio.waitForEvent('download');
  await studio.getByRole('menuitem', { name: 'Export', exact: true }).click();
  await studio
    .getByRole('menuitem', { name: 'Save screen', exact: true })
    .click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), 'kernel-screen.json');
  await studio
    .getByLabel('Screen background color', { exact: true })
    .fill('#182430');
  await studio
    .getByLabel('Screen lines color', { exact: true })
    .fill('#ff4400');
  assert.equal(
    await studio.getByLabel('Screen text color', { exact: true }).inputValue(),
    '#ff4400',
  );
  const sampleScreen = () =>
    studio.evaluate(() => {
      const canvas = [...document.querySelectorAll('canvas')].find(
        (canvas) => canvas.width === 96 && canvas.height === 64,
      );
      return [...canvas.getContext('2d').getImageData(0, 0, 96, 64).data];
    });
  await studio.evaluate(() => {
    window.kernelViewer.setMode('running');
    window.kernelViewer.setPlaying(false);
    window.kernelViewer.seek(0);
  });
  await studio.waitForTimeout(60);
  const firstScreen = await sampleScreen();
  assert.deepEqual(firstScreen.slice(0, 3), [24, 36, 48]);
  const railPixel = (13 * 96 + 6) * 4;
  assert.ok(firstScreen[railPixel] > firstScreen[railPixel + 1]);
  await studio.evaluate(() => window.kernelViewer.seek(0.5));
  await studio.waitForTimeout(60);
  const nextScreen = await sampleScreen();
  assert.notDeepEqual(firstScreen, nextScreen);
  await studio
    .getByRole('button', { name: 'Link line and text colors', exact: true })
    .click();
  await studio.getByLabel('Screen text color', { exact: true }).fill('#00ff88');
  assert.equal(
    await studio.getByLabel('Screen lines color', { exact: true }).inputValue(),
    '#ff4400',
  );
  await studio.waitForTimeout(60);
  const splitScreen = await sampleScreen();
  assert.ok(splitScreen[railPixel] > splitScreen[railPixel + 1]);
  assert.ok(
    splitScreen.some(
      (value, index) =>
        index % 4 === 1 && value > 150 && splitScreen[index - 1] === 0,
    ),
  );
  await studio.screenshot({
    path: 'test-results/studio-editor.png',
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    'Standalone gaze, all modes, screen layers and dynamic palette passed.',
  );
} finally {
  await browser.close();
}
