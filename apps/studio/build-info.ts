import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function commitTag() {
  if (process.env.PETS_COMMIT_TAG) return process.env.PETS_COMMIT_TAG;
  const cwd = fileURLToPath(new URL('../..', import.meta.url));
  for (const args of [
    ['describe', '--tags', '--exact-match'],
    ['rev-parse', '--short=7', 'HEAD'],
  ]) {
    try {
      return execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      /* Try the next source identity. */
    }
  }
  return process.env.GITHUB_SHA?.slice(0, 7) ?? 'source';
}
