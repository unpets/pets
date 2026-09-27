import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
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
const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
page.on('pageerror', (e) => errors.push(e.message));
await mkdir('build/studio-project', { recursive: true });
const openFiles = () =>
  page.getByRole('button', { name: 'Import and export', exact: true }).click();
const closeFiles = () =>
  page
    .getByRole('button', { name: 'Close project files', exact: true })
    .click();
async function download(name) {
  const pending = page.waitForEvent('download', { timeout: 180000 });
  await page.getByRole('button', { name, exact: true }).click();
  const file = await Promise.race([
    pending,
    page
      .getByRole('alert')
      .waitFor({ state: 'visible', timeout: 180000 })
      .then(async () => {
        throw new Error(await page.getByRole('alert').textContent());
      }),
  ]);
  return {
    name: file.suggestedFilename(),
    bytes: await readFile(await file.path()),
  };
}
try {
  await page.goto(pathToFileURL(resolve('dist/index.html')).href);
  await page.waitForFunction(() => window.kernelViewer?.ready);
  await page.evaluate(() => {
    window.kernelViewer.setMode('idle');
    window.kernelViewer.seek(0.25);
  });
  await page.getByRole('button', { name: 'Animation', exact: true }).click();
  await page.getByLabel('New animation name').fill('Inherited greeting');
  await page.getByRole('button', { name: 'Create child', exact: true }).click();
  await page.waitForFunction(
    () => window.kernelViewer.state === 'inherited-greeting',
  );
  assert.equal(
    await page.getByLabel('Composition parent').inputValue(),
    'idle',
  );
  await page.getByText('Right arm action', { exact: true }).click();
  await page.getByLabel('Right arm action motion').selectOption('waving');
  await openFiles();
  let file = await download('Save complete project');
  let project = JSON.parse(file.bytes);
  await closeFiles();
  assert.equal(project.format, 'pets-studio');
  assert.equal(
    project.animations.compositions['inherited-greeting'].parent,
    'idle',
  );
  assert.ok(
    Object.keys(
      project.animations.compositions['inherited-greeting'].bindings,
    ).every((id) => id.endsWith('.R')),
  );
  assert.ok(project.assets.model.startsWith('data:'));
  assert.equal(project.assets.screens.length, 6);
  await page.evaluate(() => window.kernelViewer.setMode('idle'));
  await page.getByLabel('Head movement speed').fill('0.4');
  await page.getByLabel('Head movement speed').press('Tab');
  await page.evaluate(() => window.kernelViewer.setMode('inherited-greeting'));
  assert.equal(
    await page.getByLabel('Head movement speed').inputValue(),
    '0.4',
  );
  const armSection = page.getByText('Right arm action', { exact: true });
  if (!(await armSection.evaluate((node) => node.parentElement.open)))
    await armSection.click();
  await page
    .getByRole('button', { name: 'Inherit right arm action', exact: true })
    .click();
  assert.equal(
    await page.getByLabel('Right arm action motion').inputValue(),
    'idle',
  );
  await page.getByLabel('Import project file').setInputFiles({
    name: 'project.pets.json',
    mimeType: 'application/json',
    buffer: file.bytes,
  });
  await page.waitForFunction(
    () =>
      !document.querySelector('[aria-label="Import project file"]').files
        .length,
  );
  await page.waitForFunction(
    () => window.kernelViewer?.state === 'inherited-greeting',
  );
  await openFiles();
  const restored = JSON.parse((await download('Save complete project')).bytes);
  assert.deepEqual(restored, project);
  const asset = JSON.parse((await download('Export composition')).bytes);
  assert.ok(asset.compositions.idle);
  assert.ok(asset.compositions['inherited-greeting']);
  const html = await download('Export standalone pet');
  assert.equal(html.name, 'kernel-pet.html');
  const htmlPath = resolve('build/studio-project/exported-pet.html');
  await writeFile(htmlPath, html.bytes);
  const pet = await browser.newPage();
  pet.on('pageerror', (e) => errors.push(e.message));
  await pet.route(/^https?:/, (route) => route.abort());
  await pet.goto(pathToFileURL(htmlPath).href);
  await pet.waitForFunction(() => window.kernelPet?.ready);
  assert.equal(
    await pet.evaluate(() => window.kernelPet.state),
    'inherited-greeting',
  );
  await pet.close();
  console.log('Project and offline companion round trips passed.');
  const studioHtml = await download('Export Studio HTML');
  const studioPath = resolve('build/studio-project/exported-studio.html');
  await writeFile(studioPath, studioHtml.bytes);
  const studio = await browser.newPage();
  studio.on('pageerror', (e) => errors.push(e.message));
  await studio.route(/^https?:/, (route) => route.abort());
  await studio.goto(pathToFileURL(studioPath).href);
  await studio.waitForFunction(() => window.kernelViewer?.ready);
  assert.equal(
    await studio.evaluate(() => window.kernelViewer.state),
    'inherited-greeting',
  );
  await studio.close();
  // Render both host packages from the edited project through the embedded Rust backend.
  console.log('Offline Studio round trip passed.');
  for (const target of ['Codex', 'Shimeji']) {
    console.log(`Exporting ${target}`);
    const file = await download(`Export ${target}`);
    assert.ok(file.bytes.length > 10000);
    await writeFile(
      `build/studio-project/${target.toLowerCase()}.zip`,
      file.bytes,
    );
    assert.equal(await page.getByRole('alert').count(), 0);
  }
  await closeFiles();
  project.animations.compositions.idle.parent = 'inherited-greeting';
  await page.getByLabel('Import project file').setInputFiles({
    name: 'cycle.pets.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').textContent(), /cycle/);
  assert.equal(
    await page.evaluate(() => window.kernelViewer.state),
    'inherited-greeting',
  );
  assert.deepEqual(errors, []);
  console.log(
    'Live inheritance, override reset, complete project round trip, dependency bundles, offline Studio and pet HTML, both Rust exports, and rejected cyclic import passed.',
  );
} finally {
  await browser.close();
}
