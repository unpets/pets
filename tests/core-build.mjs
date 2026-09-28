import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildCore } from '../scripts/build-core.ts';
import { parseAnimationProject } from '../packages/three-runtime/src/project.ts';

const directory = await mkdtemp(join(tmpdir(), 'pets core build '));
const originalTarget = process.env.CARGO_TARGET_DIR;
const originalDirectory = process.cwd();
try {
  process.env.CARGO_TARGET_DIR = join(directory, 'cargo cache');
  process.chdir(directory);
  const first = await buildCore();
  assert.equal(first.fresh, false);
  assert.ok(first.artifact.startsWith(process.env.CARGO_TARGET_DIR));
  const original = await readFile(first.output);
  assert.deepEqual(original, await readFile(first.artifact));
  const { instance } = await WebAssembly.instantiate(original, {});
  const core = instance.exports;
  const project = JSON.parse(
    await readFile(
      new URL('./fixtures/animation-project.json', import.meta.url),
    ),
  );
  const request = new TextEncoder().encode(
    JSON.stringify({ operation: 'project', project }),
  );
  const pointer = core.pets_alloc(request.length);
  let responsePointer = 0;
  let responseLength = 0;
  try {
    new Uint8Array(core.memory.buffer, pointer, request.length).set(request);
    const packed = core.pets_process(pointer, request.length);
    responsePointer = Number(packed & 0xffffffffn);
    responseLength = Number(packed >> 32n);
    const response = JSON.parse(
      new TextDecoder().decode(
        new Uint8Array(core.memory.buffer, responsePointer, responseLength),
      ),
    );
    assert.equal(response.ok, true, response.error);
    assert.deepEqual(
      parseAnimationProject(response.value),
      parseAnimationProject(project),
    );
  } finally {
    core.pets_free(pointer, request.length);
    if (responsePointer) core.pets_free(responsePointer, responseLength);
  }
  await rm(first.output);
  const second = await buildCore();
  assert.equal(second.fresh, true);
  assert.deepEqual(await readFile(second.output), original);
  const modified = (await stat(second.output)).mtimeMs;
  const third = await buildCore();
  assert.equal(third.fresh, true);
  assert.equal((await stat(third.output)).mtimeMs, modified);
  console.log(
    'Clean build, custom cache with spaces, external working directory, browser ABI, cached asset recovery, and unchanged output reuse passed.',
  );
} finally {
  process.chdir(originalDirectory);
  if (originalTarget === undefined) delete process.env.CARGO_TARGET_DIR;
  else process.env.CARGO_TARGET_DIR = originalTarget;
  await rm(directory, { recursive: true, force: true });
}
