import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
const secrets: { key: string; value: string }[] = [];
for (const file of ['apps/web/.env.local', '.env.local']) {
  try {
    for (const line of (await readFile(file, 'utf8')).split(/\r?\n/)) {
      const index = line.indexOf('=');
      const key = line.slice(0, index);
      const value = line
        .slice(index + 1)
        .trim()
        .replace(/^"|"$/g, '');
      if (/SERVICE|TOKEN|SECRET|PASSWORD|PUBLISHABLE_KEY/.test(key) && value.length > 20)
        secrets.push({ key, value });
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);
const credentialPattern =
  /sb_secret_[A-Za-z0-9_-]{20,}|sbp_[A-Za-z0-9_-]{20,}|sk-proj-[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/;
for (const file of files) {
  if (
    /(^|\/)(private|artifacts|\.vercel|\.resumeforge|\.companion-build)\/|(^|\/)\.env(?!\.example$)|\.(pdf|docx|tex|tgz|sqlite|db)$/.test(
      file,
    )
  )
    throw new Error(`Private/generated file would enter Git: ${file}`);
  let content: string;
  try {
    content = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
    throw error;
  }
  if (credentialPattern.test(content) || secrets.some((secret) => content.includes(secret.value)))
    throw new Error(`Credential detected in source: ${file}`);
}
async function checkClient(folder: string): Promise<void> {
  let entries;
  try {
    entries = await readdir(folder, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const file = join(folder, entry.name);
    if (entry.isDirectory()) await checkClient(file);
    else if (file.endsWith('.js')) {
      const content = await readFile(file, 'utf8');
      if (
        secrets.some((secret) => !/PUBLISHABLE/.test(secret.key) && content.includes(secret.value))
      )
        throw new Error('Server credential detected in client bundle');
    }
  }
}
await checkClient('apps/web/.next/static');
console.log(
  `Privacy check passed for ${files.length} source paths and available browser bundles. No values logged.`,
);
