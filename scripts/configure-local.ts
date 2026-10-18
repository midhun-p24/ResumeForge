import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { z } from 'zod';

// Use only the official CLI's authenticated API-key command. Never read its token store.
const ref = z
  .string()
  .regex(/^[a-z]{20}$/)
  .parse(process.env.RESUMEFORGE_PROJECT_REF);
const command = `npx.cmd --yes supabase@latest projects api-keys --project-ref ${ref} --output json`;
const raw =
  process.platform === 'win32'
    ? execFileSync('cmd.exe', ['/d', '/s', '/c', command], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    : execFileSync(
        'npx',
        [
          '--yes',
          'supabase@latest',
          'projects',
          'api-keys',
          '--project-ref',
          ref,
          '--output',
          'json',
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      );
const keys = z
  .array(z.object({ name: z.string(), api_key: z.string(), type: z.string().optional() }))
  .parse(JSON.parse(raw));
const publicKey = keys.find((k) => k.type === 'publishable') ?? keys.find((k) => k.name === 'anon');
const serviceKey =
  keys.find((k) => k.name === 'service_role') ?? keys.find((k) => k.type === 'secret');
if (!publicKey || !serviceKey) throw new Error('Existing project keys unavailable through CLI');
await writeFile(
  'apps/web/.env.local',
  `NEXT_PUBLIC_SUPABASE_URL=https://${ref}.supabase.co\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${publicKey.api_key}\nSUPABASE_SERVICE_ROLE_KEY=${serviceKey.api_key}\nRESUMEFORGE_APP_URL=http://localhost:3000\n`,
  { mode: 0o600 },
);
console.log(
  'Configured ignored apps/web/.env.local using the existing project. No key values are logged.',
);
