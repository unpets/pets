import { mkdir, readdir, copyFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
const version = (await Bun.file('package.json').json()).version;
const target = process.env.DESKTOP_TARGET;
if (!target || !['windows-x64', 'linux-x64', 'macos-arm64'].includes(target))
  throw new Error('A supported DESKTOP_TARGET is required.');
const out = 'desktop-packages';
await mkdir(out, { recursive: true });
async function files(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const name of await readdir(directory)) {
    const path = join(directory, name);
    if ((await stat(path)).isDirectory()) result.push(...(await files(path)));
    else result.push(path);
  }
  return result;
}
const prefix = `pets-${version}-${target}`;
const packages: string[] = [];
if (target === 'windows-x64') {
  const output = join(out, `${prefix}.exe`);
  await copyFile('target/release/pets-desktop.exe', output);
  packages.push(output);
}
if (target === 'macos-arm64') {
  const output = join(out, `${prefix}.zip`);
  const process = Bun.spawn([
    'ditto',
    '-c',
    '-k',
    '--sequesterRsrc',
    '--keepParent',
    'target/release/bundle/macos/Pets.app',
    output,
  ]);
  if (await process.exited)
    throw new Error('macOS application packaging failed.');
  packages.push(output);
} else {
  for (const path of await files('target/release/bundle')) {
    const extension = path.endsWith('.AppImage')
      ? '.AppImage'
      : path.endsWith('.deb')
        ? '.deb'
        : path.endsWith('.exe')
          ? '-setup.exe'
          : null;
    if (!extension) continue;
    const output = join(out, prefix + extension);
    await copyFile(path, output);
    packages.push(output);
  }
}
if (!packages.length) throw new Error('No desktop packages were produced.');
await writeFile(
  join(out, `${prefix}.json`),
  JSON.stringify(
    {
      version,
      target,
      commit: process.env.GITHUB_SHA,
      files: await Promise.all(
        packages.map(async (path) => ({
          name: path.split(/[\\/]/).at(-1),
          sha256: new Bun.CryptoHasher('sha256')
            .update(await Bun.file(path).arrayBuffer())
            .digest('hex'),
        })),
      ),
    },
    null,
    2,
  ) + '\n',
);
