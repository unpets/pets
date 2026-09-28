import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
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
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const workspace = (name) =>
  page
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('button', { name, exact: true })
    .click();
const direction = () =>
  page.evaluate(() => {
    const { head, body } = window.kernelViewer.parts;
    const v = head.position
      .clone()
      .set(0, -1, 0)
      .transformDirection(head.matrixWorld)
      .transformDirection(body.matrixWorld.clone().invert());
    return {
      yaw: Math.atan2(v.x, -v.y),
      pitch: -Math.atan2(v.z, Math.hypot(v.x, v.y)),
    };
  });
try {
  await page.goto(pathToFileURL(resolve('dist/index.html')).href);
  await page.waitForFunction(
    () =>
      window.kernelViewer?.ready &&
      document.querySelector('.studio-shell').getAttribute('aria-busy') ===
        'false',
  );
  await workspace('Composition');
  await page.locator('[data-state="look"]').click();
  await page.getByLabel('Head movement speed').fill('0.37');
  await page.getByLabel('Head movement speed').press('Tab');
  for (const phase of [0.15, 0.55, 0.95]) {
    await page.evaluate((phase) => window.kernelViewer.seek(phase), phase);
    const head = await direction();
    const center = await page.evaluate(() => {
      const data = document
        .querySelector('#screen')
        .getContext('2d')
        .getImageData(0, 0, 96, 64).data;
      let count = 0,
        xsum = 0;
      for (let y = 10; y < 41; y++)
        for (let x = 8; x < 88; x++) {
          const i = (y * 96 + x) * 4;
          if (data[i + 1] > 200 && data[i + 2] > 200 && data[i] < 180) {
            count++;
            xsum += x;
          }
        }
      return xsum / count;
    });
    assert.ok(
      Math.abs(
        center - (47.5 + Math.round(Math.max(-8, Math.min(8, head.yaw * 12)))),
      ) < 1.1,
      `Eyes follow evaluated head yaw at ${phase}: ${center}`,
    );
  }
  await workspace('Animation');
  await page.getByLabel('Animation component').selectOption('rig/head');
  await page.getByLabel('Library clip').selectOption('rig/head/lookat');
  await page.getByLabel('Lookat target', { exact: true }).selectOption('point');
  await page.getByLabel('Lookat X', { exact: true }).fill('3');
  await page.getByLabel('Lookat X', { exact: true }).press('Tab');
  await page.evaluate(() => window.kernelViewer.seek(0));
  assert.ok((await direction()).yaw > 0.4);
  await page.getByLabel('Lookat X', { exact: true }).fill('-3');
  await page.getByLabel('Lookat X', { exact: true }).press('Tab');
  await page.evaluate(() => window.kernelViewer.seek(0));
  assert.ok((await direction()).yaw < -0.4);
  await page.getByLabel('Lookat Z', { exact: true }).fill('100');
  await page.getByLabel('Lookat Z', { exact: true }).press('Tab');
  await page.evaluate(() => window.kernelViewer.seek(0));
  assert.ok(Math.abs((await direction()).pitch) <= 0.401);
  await page
    .getByLabel('Lookat target', { exact: true })
    .selectOption('pointer');
  await page.evaluate(() => {
    window.kernelViewer.setLookTarget([3, -4, 2.2]);
    window.kernelViewer.seek(0);
  });
  const before = (await direction()).yaw;
  await page.evaluate(() => window.kernelViewer.setLookTarget([-3, -4, 2.2]));
  assert.ok(
    (await direction()).yaw > before - 0.15,
    'Changing the follow target must not snap the head',
  );
  await page.waitForFunction(() => {
    const { head, body } = window.kernelViewer.parts;
    const v = head.position
      .clone()
      .set(0, -1, 0)
      .transformDirection(head.matrixWorld)
      .transformDirection(body.matrixWorld.clone().invert());
    return Math.atan2(v.x, -v.y) < -0.35;
  });
  assert.deepEqual(errors, []);
  console.log(
    'Lookaround eyes follow independent head timing; Lookat follows moving targets with smoothing and neck limits.',
  );
} finally {
  await browser.close();
}
