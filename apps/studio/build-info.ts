import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function commitSha(): string | undefined {
  const shortSha = (value?: string) =>
    value && /^[0-9a-f]{7,64}$/i.test(value.trim())
      ? value.trim().slice(0, 7).toLowerCase()
      : undefined;
  const override = shortSha(process.env.PETS_COMMIT_SHA);
  if (override) return override;
  try {
    return shortSha(
      execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: fileURLToPath(new URL('../..', import.meta.url)),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
    );
  } catch {
    return shortSha(process.env.GITHUB_SHA);
  }
}
