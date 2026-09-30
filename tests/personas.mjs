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
const page = await browser.newPage({ viewport: { width: 1440, height: 760 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const workspace = (name) =>
  page
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('button', { name, exact: true })
    .click();
const button = (name) => page.getByRole('button', { name, exact: true });
const settled = () =>
  page.waitForFunction(
    () =>
      document.querySelector('.studio-shell')?.getAttribute('aria-busy') ===
      'false',
  );
async function save() {
  await page.getByRole('menuitem', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page
    .getByRole('menuitem', { name: 'Save complete project', exact: true })
    .click();
  return JSON.parse(await readFile(await (await pending).path(), 'utf8'));
}
async function nameAction(action, name) {
  await button(action).click();
  await page.getByLabel('Persona name', { exact: true }).fill(name);
  await button(
    action === 'Rename persona' ? 'Save name' : 'Save persona',
  ).click();
  await settled();
  await page.getByRole('form').count();
}
try {
  await page.goto(pathToFileURL(resolve('dist/index.html')).href);
  await settled();
  await page.waitForFunction(() => window.kernelViewer?.ready);
  await workspace('Persona');
  await page.evaluate(() => (window.originalViewer = window.kernelViewer));
  await nameAction('Duplicate persona', 'Kernel copy');
  assert.equal(
    await page.evaluate(() => window.originalViewer === window.kernelViewer),
    true,
  );
  assert.equal(
    await page
      .getByRole('group', { name: 'Persona library' })
      .getByRole('button')
      .count(),
    2,
  );
  await workspace('Composition');
  await page.locator('[data-state="idle"]').click();
  assert.equal(
    await page
      .getByRole('button', { name: 'Rename composition', exact: true })
      .isDisabled(),
    true,
  );
  await page
    .getByLabel('Composition description', { exact: true })
    .fill('Copy idle');
  await page
    .getByLabel('Composition description', { exact: true })
    .press('Tab');
  const before = await save();
  await workspace('Animation');
  assert.equal(
    await page.getByLabel('Composition screen', { exact: true }).count(),
    0,
  );
  assert.equal(
    await page
      .getByRole('complementary', { name: 'Compositions library' })
      .count(),
    0,
  );
  await page.getByLabel('Animation component').selectOption('rig/head');
  await page.getByLabel('New animation name').fill('Independent test');
  await button('New rotation clip').click();
  const after = await save();
  assert.deepEqual(
    after.animations.compositions,
    before.animations.compositions,
  );
  assert.ok(after.animations.clips['independent-test']);
  assert.equal(
    Object.hasOwn(after.animations.compositions, '__studio_clip_preview'),
    false,
  );
  await workspace('Persona');
  await nameAction('Rename persona', 'Custom persona');
  await page
    .getByRole('group', { name: 'Persona library' })
    .getByRole('button', { name: 'Kernel kernel', exact: true })
    .click();
  await settled();
  const original = await save();
  assert.equal(original.animations.compositions.idle.label, 'Idle');
  assert.equal(original.animations.clips['independent-test'], undefined);
  await nameAction('New persona', 'Fresh persona');
  const fresh = await save();
  assert.equal(fresh.persona.id, 'fresh-persona');
  assert.equal(fresh.animations.compositions.idle.label, 'Idle');
  assert.equal(fresh.animations.clips['independent-test'], undefined);
  await page
    .getByText('Saved locally in this browser', { exact: true })
    .waitFor();
  await page.reload();
  await settled();
  assert.equal(
    await page
      .getByRole('group', { name: 'Persona library' })
      .getByRole('button')
      .count(),
    3,
  );
  assert.equal((await save()).persona.name, 'Fresh persona');
  await button('Delete persona').click();
  await button('Cancel').click();
  assert.equal(
    await page
      .getByRole('group', { name: 'Persona library' })
      .getByRole('button')
      .count(),
    3,
  );
  await button('Delete persona').click();
  await button('Confirm deletion').click();
  await settled();
  assert.equal(
    await page
      .getByRole('group', { name: 'Persona library' })
      .getByRole('button')
      .count(),
    2,
  );
  await page
    .getByRole('group', { name: 'Persona library' })
    .getByRole('button', { name: 'Custom persona kernel-copy', exact: true })
    .click();
  await settled();
  const copy = await save();
  assert.equal(copy.animations.compositions.idle.description, 'Copy idle');
  assert.ok(copy.animations.clips['independent-test']);
  for (const name of ['Face', 'Animation', 'Composition', 'Scene']) {
    await workspace(name);
    const bounds = await page.evaluate(() => {
      const aside = document
        .querySelector('.studio-inspector')
        .getBoundingClientRect();
      const buttons = [...document.querySelectorAll('.inspector-toggle')].map(
        (node) => node.getBoundingClientRect(),
      );
      return {
        bottom: aside.bottom,
        top: aside.top,
        buttons: buttons.map((b) => ({ top: b.top, bottom: b.bottom })),
      };
    });
    assert.ok(
      bounds.buttons.every(
        (b) => b.top >= bounds.top && b.bottom <= bounds.bottom + 1,
      ),
      `${name} keeps every collapse control visible`,
    );
    assert.equal(
      await page.getByText('Selected clip', { exact: true }).count(),
      0,
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    'Persona creation, duplication, isolated edits, persistence, renaming, deletion, independent clips, and pinned inspector controls passed.',
  );
} finally {
  await browser.close();
}
