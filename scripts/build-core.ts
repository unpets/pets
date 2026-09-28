import { $ } from 'bun';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const target = 'wasm32-unknown-unknown';
const output = join(root, 'apps/studio/generated/pets_core.wasm');

interface Artifact {
  reason: string;
  target?: { name: string; crate_types: string[] };
  filenames?: string[];
  fresh?: boolean;
}

export async function buildCore() {
  const installed = await $`rustup target list --installed`.cwd(root).text();
  if (!installed.split(/\s+/).includes(target))
    await $`rustup target add ${target}`.cwd(root);
  const messages =
    await $`cargo rustc --locked --lib --crate-type cdylib -p pets-core --features web --target ${target} --release --message-format=json-render-diagnostics`
      .cwd(root)
      .text();
  const artifacts = messages
    .split(/\r?\n/)
    .filter((line) => line.startsWith('{'))
    .map((line): Artifact => JSON.parse(line))
    .filter(
      (message) =>
        message.reason === 'compiler-artifact' &&
        message.target?.name === 'pets_core' &&
        message.target.crate_types.includes('cdylib'),
    )
    .flatMap((message) =>
      (message.filenames ?? [])
        .filter((path) => path.endsWith('.wasm'))
        .map((path) => ({ path, fresh: message.fresh === true })),
    );
  if (artifacts.length !== 1)
    throw new Error(
      'Cargo must report exactly one pets_core WebAssembly artifact.',
    );
  const artifact = artifacts[0];
  const bytes = await readFile(artifact.path);
  const module = await WebAssembly.compile(bytes);
  const exports = new Map(
    WebAssembly.Module.exports(module).map(({ name, kind }) => [name, kind]),
  );
  if (
    WebAssembly.Module.imports(module).length ||
    exports.get('memory') !== 'memory' ||
    ['pets_alloc', 'pets_free', 'pets_process'].some(
      (name) => exports.get(name) !== 'function',
    )
  )
    throw new Error(
      'The compiled module does not provide the Pets browser ABI.',
    );
  let previous;
  try {
    previous = await readFile(output);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (!previous?.equals(bytes)) {
    await mkdir(dirname(output), { recursive: true });
    const temporary = `${output}.${process.pid}.tmp`;
    try {
      await writeFile(temporary, bytes);
      await rename(temporary, output);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  return { artifact: artifact.path, output, fresh: artifact.fresh };
}

if (import.meta.main) {
  const result = await buildCore();
  console.log(`Core WebAssembly ready: ${result.output}`);
}
