import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { AsyncEntry } from '@napi-rs/keyring';
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { CodexAdapter } from '../apps/companion/src/adapter';
import { importFixture } from '../tests/import-fixtures';
import { fixture } from '../tests/fixtures';
import { validateImport } from '@resumeforge/contracts';
import type { ImportOutput, ProfileImportView, WorkspaceData } from '@resumeforge/contracts';
import { testRequest } from './lib/test-http';

const root = resolve('private/import-smoke');
await mkdir(root, { recursive: true });
const workspace = await mkdtemp(join(root, 'synthetic-'));
const { input, output: fixtureOutput } = importFixture();
if (process.argv.includes('--extract-only')) {
  const output = await new CodexAdapter().extract(input, workspace, AbortSignal.timeout(240000));
  assert.deepEqual(validateImport(input, output), []);
  assert.ok(output.records.some((record) => record.record.kind === 'project'));
  await writeFile(join(workspace, 'extraction.json'), JSON.stringify(output, null, 2), {
    mode: 0o600,
  });
  console.log(
    `Real Codex extraction passed: ${output.records.length} synthetic proposals with literal source evidence.`,
  );
  process.exit(0);
}
const config = Object.fromEntries(
  (await readFile('apps/web/.env.local', 'utf8'))
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, '')];
    }),
);
const url = process.env.RESUMEFORGE_TEST_URL ?? 'http://localhost:3205';
const admin = createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const users: string[] = [];
async function auth() {
  const generated = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: `resumeforge-import-${randomUUID()}@example.invalid`,
    options: { redirectTo: url },
  });
  if (generated.error) throw new Error(`Synthetic auth setup: ${generated.error.code}`);
  users.push(generated.data.user.id);
  const client = createClient(
    config.NEXT_PUBLIC_SUPABASE_URL,
    config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const verification = await client.auth.verifyOtp({
    token_hash: generated.data.properties.hashed_token,
    type: generated.data.properties.verification_type as 'magiclink',
  });
  if (verification.error || !verification.data.session)
    throw new Error('Synthetic session verification failed');
  return { token: verification.data.session.access_token, id: generated.data.user.id };
}
async function api<T = Record<string, unknown>>(
  route: string,
  method = 'GET',
  body?: unknown,
  token?: string,
  status = 200,
): Promise<T> {
  const result = await testRequest(url, route, method, body, token);
  assert.equal(result.status, status, `${route}: ${result.data.code ?? result.status}`);
  return result.data as T;
}
let worker: ReturnType<typeof spawn> | undefined;
let vault: AsyncEntry | undefined;
let vaultCreated = false;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  const a = await auth(),
    b = await auth();
  const profile = fixture().input.profile;
  profile.records[0].title = 'Existing Approved Project';
  profile.masterText = input.rawText;
  await api('profile', 'PUT', profile, a.token);
  const deviceToken = `rf_${randomBytes(32).toString('base64url')}`;
  let deviceId: string;
  if (process.argv.includes('--fixture-output')) {
    const inserted = await admin
      .from('agent_devices')
      .insert({
        user_id: a.id,
        name: 'Synthetic fixture companion',
        token_hash: createHash('sha256').update(deviceToken).digest('hex'),
      })
      .select('id')
      .single();
    if (inserted.error) throw new Error('Synthetic device fixture setup failed');
    deviceId = inserted.data.id;
    console.log('Using a synthetic device fixture; this run does not retest public pairing.');
  } else {
    const pair = await api<{ id: string; code: string; pollSecret: string }>(
      'pairing/start',
      'POST',
      {
        name: 'Synthetic import companion',
        tokenHash: createHash('sha256').update(deviceToken).digest('hex'),
      },
      undefined,
      201,
    );
    const paired = await api<{ deviceId: string }>(
      'pairing/approve',
      'POST',
      { code: pair.code },
      a.token,
    );
    await api('pairing/poll', 'POST', { id: pair.id, pollSecret: pair.pollSecret });
    deviceId = paired.deviceId;
  }
  let importId: string;
  if (process.argv.includes('--browser')) {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const link = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: (await admin.auth.admin.getUserById(a.id)).data.user!.email!,
      options: { redirectTo: url },
    });
    if (link.error) throw new Error('Synthetic browser session failed');
    // Local redirects are deliberately not added to production Auth allowlists.
    // Verify using the real browser client and privately obtained synthetic OTP hash.
    await page.goto(url);
    await page.evaluate(
      async ({ projectUrl, key, tokenHash, type }) => {
        const response = await fetch(`${projectUrl}/auth/v1/verify`, {
          method: 'POST',
          headers: { apikey: key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ token_hash: tokenHash, type }),
        });
        if (!response.ok) throw new Error('Synthetic browser verification failed');
        const session = await response.json();
        const ref = new URL(projectUrl).hostname.split('.')[0];
        localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(session));
      },
      {
        projectUrl: config.NEXT_PUBLIC_SUPABASE_URL,
        key: config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        tokenHash: link.data.properties.hashed_token,
        type: link.data.properties.verification_type,
      },
    );
    await page.reload();
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Master Profile', exact: true }).click();
    await expect(page.getByLabel('Master resume text')).toHaveValue(input.rawText);
    const enqueueResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/profile/imports' &&
        response.request().method() === 'POST',
    );
    await page
      .getByRole('button', { name: 'Parse master resume into records', exact: true })
      .click();
    const enqueued = await enqueueResponse;
    assert.equal(enqueued.status(), 201, 'Browser import enqueue');
    importId = (await enqueued.json()).id;
  } else {
    importId = (
      await api<{ id: string }>('profile/imports', 'POST', { rawText: input.rawText }, a.token, 201)
    ).id;
  }
  await api(`profile/imports/${importId}`, 'GET', undefined, b.token, 404);
  await api(
    `profile/imports/${importId}/apply`,
    'POST',
    { records: [], includeContact: false },
    b.token,
    404,
  );
  const old = await api<{ task: unknown }>('device/claim', 'POST', {}, deviceToken);
  assert.equal(old.task, null);
  let output: ImportOutput;
  if (process.argv.includes('--worker')) {
    const target = new URL(url);
    assert.ok(
      ['localhost', '127.0.0.1'].includes(target.hostname),
      'Worker smoke requires a loopback origin',
    );
    vault = new AsyncEntry('ResumeForge', target.origin);
    if (await vault.getPassword())
      throw new Error('Test origin already has a vault entry; preserving it');
    await vault.setPassword(
      JSON.stringify({ origin: target.origin, token: deviceToken, deviceId }),
    );
    vaultCreated = true;
    worker = spawn(
      process.execPath,
      [resolve('.companion-build/package/bin/resumeforge.mjs'), 'run', '--url', target.origin],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    );
    let diagnostics = '';
    worker.stdout?.on('data', (chunk) => {
      diagnostics = (diagnostics + String(chunk)).slice(-2500);
    });
    worker.stderr?.on('data', (chunk) => {
      diagnostics = (diagnostics + String(chunk)).slice(-2500);
    });
    const deadline = Date.now() + 240000;
    while (true) {
      const detail = await api<ProfileImportView>(
        `profile/imports/${importId}`,
        'GET',
        undefined,
        a.token,
      );
      if (detail.state === 'completed') {
        output = detail.draft!;
        break;
      }
      if (['failed', 'cancelled'].includes(detail.state) || Date.now() > deadline)
        throw new Error(
          `Import worker failed: ${detail.error_code ?? detail.state}. ${diagnostics}`,
        );
      await new Promise((r) => setTimeout(r, 2000));
    }
    console.log(
      'Actual bundled companion polling, Codex extraction, heartbeat and completion passed.',
    );
  } else {
    const claimed = await api<{ task: { leaseToken: string; input: typeof input } }>(
      'device/claim',
      'POST',
      { profileImport: true },
      deviceToken,
    );
    output = process.argv.includes('--fixture-output')
      ? fixtureOutput
      : await new CodexAdapter().extract(
          claimed.task.input,
          workspace,
          AbortSignal.timeout(240000),
        );
    await api(
      `device/tasks/${importId}/import-complete`,
      'POST',
      { leaseToken: claimed.task.leaseToken, output },
      deviceToken,
    );
    await api(
      `device/tasks/${importId}/import-complete`,
      'POST',
      { leaseToken: claimed.task.leaseToken, output },
      deviceToken,
    );
  }
  assert.deepEqual(validateImport({ ...input, taskId: importId }, output), []);
  assert.ok(output.records.length);
  const before = await api<WorkspaceData>('workspace', 'GET', undefined, a.token);
  assert.equal(before.tasks.length, 0);
  assert.equal(before.profile.records.length, 1);
  if (browser) {
    const page = browser.contexts()[0].pages()[0];
    await expect(page.getByRole('heading', { name: /Review proposed records/ })).toBeVisible({
      timeout: 15000,
    });
    await page.getByText('Edit proposal 1 and inspect evidence', { exact: true }).click();
    const editedContribution = 'Designed a TypeScript task queue using PostgreSQL.';
    await page
      .getByRole('textbox', { name: 'Personal contributions', exact: true })
      .fill(editedContribution);
    await page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/profile/imports' &&
        response.request().method() === 'GET',
    );
    await expect(
      page.getByRole('textbox', { name: 'Personal contributions', exact: true }),
    ).toHaveValue(editedContribution);
    await page.getByRole('button', { name: /Add \d+ records as drafts/ }).click();
    await expect(
      page.getByText('Imported as drafts. Review and approve each record below before tailoring.', {
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({ path: join(workspace, 'import-review.png'), fullPage: true });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      return new Promise<void>((done) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done())),
      );
    });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.screenshot({ path: join(workspace, 'import-mobile.png'), fullPage: true });
  } else
    await api(
      `profile/imports/${importId}/apply`,
      'POST',
      {
        records: output.records.map((proposal, index) => ({ index, record: proposal.record })),
        includeContact: false,
      },
      a.token,
    );
  const after = await api<WorkspaceData>('workspace', 'GET', undefined, a.token);
  assert.deepEqual(after.profile.records[0], profile.records[0]);
  assert.equal(after.profile.contact.name, profile.contact.name);
  assert.ok(after.profile.records.slice(1).every((record) => record.verification === 'draft'));
  const retried = await api<{ added: number; alreadyApplied: boolean }>(
    `profile/imports/${importId}/apply`,
    'POST',
    {
      records: output.records.map((proposal, index) => ({ index, record: proposal.record })),
      includeContact: false,
    },
    a.token,
  );
  assert.equal(retried.added, 0);
  assert.equal(retried.alreadyApplied, true);
  if (process.argv.includes('--failure-diagnostics')) {
    const failed = (
      await api<{ id: string }>('profile/imports', 'POST', { rawText: input.rawText }, a.token, 201)
    ).id;
    const claimed = await api<{ task: { id: string; leaseToken: string } }>(
      'device/claim',
      'POST',
      { profileImport: true },
      deviceToken,
    );
    assert.equal(claimed.task.id, failed);
    const details = ['records.2.source: invalid source line range'];
    await api(
      `device/tasks/${failed}/fail`,
      'POST',
      { leaseToken: claimed.task.leaseToken, code: 'INVALID_OUTPUT', draft: null, details },
      deviceToken,
    );
    const failedDetail = await api<ProfileImportView>(
      `profile/imports/${failed}`,
      'GET',
      undefined,
      a.token,
    );
    assert.equal(failedDetail.state, 'failed');
    assert.equal(failedDetail.draft, null);
    assert.deepEqual(failedDetail.diagnostics, details);
    const preserved = await api<WorkspaceData>('workspace', 'GET', undefined, a.token);
    assert.deepEqual(preserved.profile, after.profile);
    if (browser) {
      const page = browser.contexts()[0].pages()[0];
      await expect(page.getByLabel('Resume import')).toContainText('Failed', { timeout: 15000 });
      await page.getByLabel('Resume import').selectOption(failed);
      await expect(page.getByRole('list', { name: 'Import validation details' })).toContainText(
        details[0],
      );
      await expect(
        page.getByRole('heading', { name: /Review proposed records/ }),
      ).not.toBeVisible();
    }
    console.log(
      'Failed import diagnostics are visible without exposing values or changing saved records.',
    );
  }
  await api(`devices/${deviceId}`, 'DELETE', undefined, a.token);
  await api('device/claim', 'POST', { profileImport: true }, deviceToken, 401);
  console.log(
    'Private review, draft-only append, approved-data preservation, cross-user denial, duplicate apply and device revocation passed.',
  );
} catch (error) {
  const page = browser?.contexts()[0]?.pages()[0];
  if (page)
    await page.screenshot({ path: join(workspace, 'failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  if (worker && !worker.killed) {
    worker.kill();
    await new Promise<void>((done) => {
      if (worker!.exitCode !== null) done();
      else {
        worker!.once('exit', () => done());
        setTimeout(done, 5000);
      }
    });
  }
  await browser?.close();
  if (vaultCreated) await vault?.deletePassword();
  for (const user of users) {
    const result = await admin.auth.admin.deleteUser(user);
    if (result.error) {
      console.error('Synthetic test cleanup failed');
      process.exitCode = 1;
    }
  }
}
