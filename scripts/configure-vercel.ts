import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const config = Object.fromEntries(
  (await readFile('apps/web/.env.local', 'utf8'))
    .trim()
    .split(/\r?\n/)
    .map((s) => {
      const i = s.indexOf('=');
      return [s.slice(0, i), s.slice(i + 1)];
    }),
);
for (const key of [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'RESUMEFORGE_APP_URL',
]) {
  if (!config[key]) throw new Error(`Missing ${key}`);
  const args = [
    '--yes',
    'vercel@latest',
    'env',
    'add',
    key,
    'preview',
    '--scope',
    'midoon1',
    '--force',
  ];
  try {
    if (process.platform === 'win32')
      execFileSync('cmd.exe', ['/d', '/s', '/c', `npx.cmd ${args.join(' ')}`], {
        input: config[key],
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    else
      execFileSync('npx', args, {
        input: config[key],
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
  } catch {
    throw new Error(`Could not configure ${key}; no value logged.`);
  }
  console.log(`Configured ${key} for preview (value hidden).`);
}
