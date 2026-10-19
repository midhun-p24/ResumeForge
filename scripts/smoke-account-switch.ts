// Synthetic same-browser regression for account-switch response isolation.
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { chromium, expect } from '@playwright/test';
import { fixture } from '../tests/fixtures';
const config = Object.fromEntries(
  (await readFile('apps/web/.env.local', 'utf8'))
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i), line.slice(i + 1)];
    }),
);
const admin = createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const users: string[] = [];
const browser = await chromium.launch();
try {
  const links: string[] = [];
  for (const name of ['Alex Example', 'Jordan Example']) {
    const email = `resumeforge-smoke-${randomUUID()}@example.invalid`;
    const created = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (created.error) throw new Error('Synthetic user setup failed');
    users.push(created.data.user.id);
    const client = createClient(
      config.NEXT_PUBLIC_SUPABASE_URL,
      config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      { auth: { persistSession: false } },
    );
    const verified = await client.auth.verifyOtp({
      token_hash: created.data.properties.hashed_token,
      type: created.data.properties.verification_type as 'signup',
    });
    if (verified.error) throw new Error('Synthetic session setup failed');
    const profile = fixture().input.profile;
    profile.contact.name = name;
    const saved = await fetch('https://resume-forge.midoon.dev/api/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${verified.data.session!.access_token}`,
      },
      body: JSON.stringify(profile),
    });
    expect(saved.status).toBe(200);
    const link = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: 'https://resume-forge.midoon.dev' },
    });
    if (link.error) throw new Error('Synthetic browser link failed');
    links.push(link.data.properties.action_link);
  }
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  for (const [index, link] of links.entries()) {
    await page.goto(link, { waitUntil: 'domcontentloaded' }).catch(() => {
      throw new Error('Synthetic browser navigation failed');
    });
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Master Profile', exact: true }).click();
    await expect(page.getByLabel('Full name')).toHaveValue(
      index === 0 ? 'Alex Example' : 'Jordan Example',
    );
  }
  console.log(
    'Same-browser account switch passed: the second user sees only their own saved profile.',
  );
} finally {
  await browser.close();
  for (const id of users) {
    const deleted = await admin.auth.admin.deleteUser(id);
    if (deleted.error) {
      console.error('Synthetic account-switch cleanup failed');
      process.exitCode = 1;
    }
  }
}
