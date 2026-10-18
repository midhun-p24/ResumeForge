import { createClient } from '@supabase/supabase-js';
import { AsyncEntry } from '@napi-rs/keyring';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { fixture } from '../tests/fixtures';
import { agentOutputSchema, taskInputSchema, validateEvidence } from '@resumeforge/contracts';
import type { AgentOutput, WorkspaceData } from '@resumeforge/contracts';
import { CodexAdapter } from '../apps/companion/src/adapter';
import { compileResume } from '../apps/companion/src/render';

// Explicitly synthetic live test. No emails are sent and no real account is impersonated.
const config = Object.fromEntries(
  (await readFile('apps/web/.env.local', 'utf8'))
    .trim()
    .split(/\r?\n/)
    .map((s) => {
      const i = s.indexOf('=');
      return [s.slice(0, i), s.slice(i + 1)];
    }),
);
const url = process.env.RESUMEFORGE_TEST_URL ?? 'http://localhost:3000';
const admin = createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anonymous = () =>
  createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const marker = randomUUID();
const users: string[] = [];
const paths: string[] = [];
const root = resolve('private/smoke');
await mkdir(root, { recursive: true });
const workspace = await mkdtemp(join(root, 'connected-'));
async function auth() {
  const email = `resumeforge-smoke-${randomUUID()}@example.invalid`;
  const generated = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (generated.error) throw new Error(`Synthetic auth setup: ${generated.error.code}`);
  users.push(generated.data.user.id);
  const client = anonymous();
  const verified = await client.auth.verifyOtp({
    token_hash: generated.data.properties.hashed_token,
    type: 'magiclink',
  });
  if (verified.error || !verified.data.session)
    throw new Error('Synthetic magic-link verification failed');
  return { token: verified.data.session.access_token, client, userId: verified.data.user!.id };
}
async function api<T = Record<string, unknown>>(
  route: string,
  method = 'GET',
  body?: unknown,
  token?: string,
  expected = 200,
): Promise<T> {
  const res = await fetch(`${url}/api/${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'error',
  });
  const data = await res.json();
  assert.equal(res.status, expected, `${route}: ${data.code ?? res.status}`);
  return data as T;
}
try {
  const a = await auth(),
    b = await auth();
  console.log(
    'Real Supabase magic-link token verification passed for two synthetic users (no email delivery).',
  );
  // Fail before storing any profile if the schema has not been deployed.
  const initial = await api<WorkspaceData>('workspace', 'GET', undefined, a.token);
  assert.equal(initial.jobs.length, 0);
  const { input } = fixture();
  await api('profile', 'PUT', input.profile, a.token);
  const { id: jobId } = await api<{ id: string }>('jobs', 'POST', input.job, a.token, 201);
  const token = `rf_${randomBytes(32).toString('base64url')}`;
  const pair = await api<{ id: string; code: string; pollSecret: string }>(
    'pairing/start',
    'POST',
    {
      name: 'Synthetic smoke companion',
      tokenHash: createHash('sha256').update(token).digest('hex'),
    },
    undefined,
    201,
  );
  const { deviceId } = await api<{ deviceId: string }>(
    'pairing/approve',
    'POST',
    { code: pair.code },
    a.token,
  );
  await api('pairing/approve', 'POST', { code: pair.code }, b.token, 409);
  const approved = await api<{ deviceId: string }>('pairing/poll', 'POST', {
    id: pair.id,
    pollSecret: pair.pollSecret,
  });
  assert.equal(approved.deviceId, deviceId);
  await api('pairing/poll', 'POST', { id: pair.id, pollSecret: pair.pollSecret }, undefined, 409);
  const vault = new AsyncEntry('ResumeForge smoke', marker);
  await vault.setPassword(token);
  assert.equal(await vault.getPassword(), token);
  await vault.deleteCredential();
  console.log('Pairing single-use approval and OS-vault roundtrip passed.');
  await api(
    'device/heartbeat',
    'POST',
    {
      taskId: null,
      leaseToken: null,
      stage: 'Analyzing requirements',
      agentStatus: 'authenticated',
    },
    token,
  );
  const taskArgs = {
    jobId,
    operation: 'tailor',
    versionId: null,
    revisionRequest: '',
    lockedBulletIds: [],
    lockedSectionIds: [],
    excludedSourceIds: [],
  };
  await api('tasks', 'POST', taskArgs, b.token, 404);
  const adapter = new CodexAdapter();
  let lastOutput: AgentOutput | null = null;
  async function execute(operation: 'tailor' | 'revise', versionId: string | null = null) {
    const locks =
      lastOutput?.resume.sections
        .flatMap((s) => s.entries.flatMap((e) => e.bullets))
        .slice(0, 1)
        .map((b) => b.id) ?? [];
    const { id: taskId } = await api<{ id: string }>(
      'tasks',
      'POST',
      {
        ...taskArgs,
        operation,
        versionId,
        revisionRequest:
          operation === 'revise'
            ? 'Keep the locked bullet unchanged and refine any other wording for clarity.'
            : '',
        lockedBulletIds: locks,
      },
      a.token,
      201,
    );
    const { task } = await api<{ task: { id: string; input: unknown; leaseToken: string } }>(
      'device/claim',
      'POST',
      {},
      token,
    );
    assert.equal(task.id, taskId);
    const snapshot = taskInputSchema.parse(task.input);
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 180000);
    let stage = 'Analyzing requirements';
    const beat = async () => {
      const r = await api<{ active: boolean }>(
        'device/heartbeat',
        'POST',
        { taskId, leaseToken: task.leaseToken, stage, agentStatus: 'authenticated' },
        token,
      );
      assert.equal(r.active, true);
    };
    const timer = setInterval(() => void beat().catch(() => controller.abort()), 20000);
    try {
      const output = await adapter.run(snapshot, workspace, controller.signal, async (s) => {
        stage = s;
        await beat();
      });
      assert.deepEqual(validateEvidence(snapshot, output), []);
      const rendered = await compileResume(
        snapshot.profile,
        output,
        workspace,
        controller.signal,
        async (s) => {
          stage = s;
          await beat();
        },
      );
      assert.equal(rendered.render.status, 'ready');
      const payload = {
        leaseToken: task.leaseToken,
        output,
        render: rendered.render,
        pdf: rendered.pdf.toString('base64'),
      };
      const done = await api<{ versionId: string }>(
        `device/tasks/${taskId}/complete`,
        'POST',
        payload,
        token,
      );
      const duplicate = await api<{ versionId: string }>(
        `device/tasks/${taskId}/complete`,
        'POST',
        payload,
        token,
      );
      assert.equal(done.versionId, duplicate.versionId);
      lastOutput = agentOutputSchema.parse(output);
      await writeFile(join(workspace, `${operation}.json`), JSON.stringify(output, null, 2));
      return done.versionId;
    } finally {
      clearInterval(timer);
      clearTimeout(deadline);
    }
  }
  const first = await execute('tailor');
  console.log('Live HTTP claim, Codex, PDF upload, and idempotent completion passed.');
  const second = await execute('revise', first);
  assert.notEqual(first, second);
  console.log('Live revision with locked content passed.');
  const state = await api<WorkspaceData>('workspace', 'GET', undefined, a.token);
  assert.equal(state.versions.length, 2);
  const other = await api<WorkspaceData>('workspace', 'GET', undefined, b.token);
  assert.equal(other.jobs.length, 0);
  assert.equal(other.versions.length, 0);
  for (const artifact of state.artifacts) {
    await api(`artifacts/${artifact.id}`, 'GET', undefined, b.token, 404);
    const signed = await api<{ url: string }>(
      `artifacts/${artifact.id}`,
      'GET',
      undefined,
      a.token,
    );
    const response = await fetch(signed.url);
    assert.equal(response.status, 200);
    if (artifact.kind === 'pdf')
      assert.equal(
        Buffer.from(await response.arrayBuffer())
          .subarray(0, 5)
          .toString(),
        '%PDF-',
      );
  }
  const application = state.applications[0];
  await api(
    `applications/${application.id}`,
    'PATCH',
    {
      stage: 'Applied',
      notes: 'Synthetic smoke only',
      appliedAt: '2026-10-18',
      resumeVersionId: second,
    },
    a.token,
  );
  const reloaded = await api<WorkspaceData>('workspace', 'GET', undefined, a.token);
  assert.equal(reloaded.applications[0].resume_version_id, second);
  const direct = await b.client.from('jobs').select('id').eq('id', jobId);
  assert.equal(direct.data?.length, 0);
  await api(`devices/${deviceId}`, 'DELETE', undefined, a.token);
  await api('device/claim', 'POST', {}, token, 401);
  console.log(
    'Artifact ownership/downloads, two-user RLS, application persistence, and revocation passed.',
  );
  const artifacts = await admin.from('artifacts').select('path').eq('user_id', a.userId);
  paths.push(...(artifacts.data ?? []).map((x) => x.path));
} finally {
  // Cleanup is restricted to synthetic user IDs created in this process.
  for (const id of users) {
    const artifacts = await admin.from('artifacts').select('path').eq('user_id', id);
    const ownedPaths = (artifacts.data ?? []).map((x) => x.path);
    if (ownedPaths.length) await admin.storage.from('resume-artifacts').remove(ownedPaths);
    const result = await admin.auth.admin.deleteUser(id);
    if (result.error) console.log('Synthetic test cleanup needs review.');
  }
  console.log('Synthetic account cleanup finished.');
}
