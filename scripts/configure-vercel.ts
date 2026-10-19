import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
const config = Object.fromEntries(
  (await readFile('apps/web/.env.local', 'utf8'))
    .trim()
    .split(/\r?\n/)
    .map((s) => {
      const i = s.indexOf('=');
      return [s.slice(0, i), s.slice(i + 1)];
    }),
);
const target = process.argv.includes('--production') ? 'production' : 'preview';
if (target === 'production') {
  config.RESUMEFORGE_APP_URL = 'https://resume-forge.midoon.dev';
  config.RESUMEFORGE_REGISTRATION_ENABLED = process.argv.includes('--open-registration')
    ? 'true'
    : 'false';
}
const npmCli = join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
function vercel(flags: string[]) {
  return JSON.parse(
    process.platform === 'win32'
      ? execFileSync(
          process.execPath,
          [npmCli, 'exec', '--yes', '--package', 'vercel@latest', '--', 'vercel', ...flags],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
        )
      : execFileSync('npx', ['--yes', 'vercel@latest', ...flags], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }),
  );
}
const existing = vercel(['api', '/v9/projects/resumeforge/env', '--scope', 'midoon1']).envs as {
  id: string;
  key: string;
  target: string[];
}[];
for (const key of [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'RESUMEFORGE_APP_URL',
  ...(target === 'production' ? ['RESUMEFORGE_REGISTRATION_ENABLED'] : []),
]) {
  if (!config[key]) throw new Error(`Missing ${key}`);
  await mkdir('private', { recursive: true });
  const payload = resolve('private/vercel-env-change.json');
  const found = existing.find((item) => item.key === key && item.target.includes(target));
  await writeFile(
    payload,
    JSON.stringify({
      ...(found ? {} : { key }),
      value: config[key],
      type: key === 'SUPABASE_SERVICE_ROLE_KEY' ? 'sensitive' : 'plain',
      target: [target],
    }),
    { mode: 0o600 },
  );
  const flags = [
    'api',
    found ? `/v9/projects/resumeforge/env/${found.id}` : '/v10/projects/resumeforge/env',
    '-X',
    found ? 'PATCH' : 'POST',
    '--input',
    payload,
    '--scope',
    'midoon1',
  ];
  try {
    const result = vercel(flags);
    if (result.error || result.failed?.length) throw new Error('Environment update rejected');
  } catch (error) {
    let detail =
      String((error as { stderr?: Buffer | string }).stderr ?? 'CLI failed') +
      '\n' +
      String((error as { stdout?: Buffer | string }).stdout ?? '');
    for (const value of Object.values(config))
      if (value.length > 12) detail = detail.replaceAll(value, '[REDACTED]');
    detail = detail
      .replace(/(?:Bearer\s+)[^\s]+/gi, 'Bearer [REDACTED]')
      .replace(/eyJ[A-Za-z0-9_.-]+/g, '[REDACTED]');
    throw new Error(`Could not configure ${key}: ${detail.slice(-1400)}`);
  } finally {
    await unlink(payload);
  }
  console.log(`Configured ${key} for ${target} (value hidden).`);
}
