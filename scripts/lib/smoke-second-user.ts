import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import type { TaskInput, WorkspaceData } from '@resumeforge/contracts';
import { docFixture } from '../../tests/fixtures';
import { compileResume } from '../../apps/companion/src/render';
type Api = <T = Record<string, unknown>>(
  route: string,
  method?: string,
  body?: unknown,
  token?: string,
  expected?: number,
) => Promise<T>;

/** No AI is invoked for the second synthetic identity. This verifies authorization
 * and the complete task/artifact protocol without using another person's agent. */
export async function smokeSecondUser(
  api: Api,
  workspace: string,
  second: string,
  first: string,
  firstDevice: string,
  firstDeviceId: string,
  firstTaskId: string,
) {
  const { input, doc: output } = docFixture();
  input.profile.contact.name = 'Jordan Example';
  input.profile.masterText += '\nIsolated Queue Project (2025): second synthetic account only.';
  input.job.company = 'Other Example Systems';
  await api('profile', 'PUT', input.profile, second);
  const job = await api<{ id: string }>('jobs', 'POST', input.job, second, 201);
  await api(
    'tasks',
    'POST',
    {
      jobId: job.id,
      operation: 'tailor',
      versionId: null,
      revisionRequest: '',
      lockedBulletIds: [],
      lockedSectionIds: [],
      excludedSourceIds: [],
    },
    first,
    404,
  );
  const token = `rf_${randomBytes(32).toString('base64url')}`;
  const pair = await api<{ id: string; code: string; pollSecret: string }>(
    'pairing/start',
    'POST',
    {
      name: 'Second synthetic companion (fixture output; no AI)',
      tokenHash: createHash('sha256').update(token).digest('hex'),
    },
    undefined,
    201,
  );
  const { deviceId } = await api<{ deviceId: string }>(
    'pairing/approve',
    'POST',
    { code: pair.code },
    second,
  );
  await api('pairing/poll', 'POST', { id: pair.id, pollSecret: pair.pollSecret });
  await api(`devices/${deviceId}`, 'DELETE', undefined, first, 404);
  await api(`devices/${firstDeviceId}`, 'DELETE', undefined, second, 404);
  await api(`device/tasks/${firstTaskId}/complete`, 'POST', {}, token, 404);
  let prior: string | null = null;
  for (const operation of ['tailor', 'revise'] as const) {
    const task: { id: string } = await api<{ id: string }>(
      'tasks',
      'POST',
      {
        jobId: job.id,
        operation,
        versionId: prior,
        revisionRequest: operation === 'revise' ? 'Tighten the project wording.' : '',
        lockedBulletIds: [],
        lockedSectionIds: [],
        excludedSourceIds: [],
      },
      second,
      201,
    );
    const foreign = await api<{ task: unknown }>('device/claim', 'POST', {}, firstDevice);
    assert.equal(foreign.task, null);
    const claim = await api<{ task: { id: string; input: TaskInput; leaseToken: string } }>(
      'device/claim',
      'POST',
      { docV2: true },
      token,
    );
    assert.equal(claim.task.id, task.id);
    assert.equal(claim.task.input.profile.contact.name, 'Jordan Example');
    const rendered = await compileResume(
      claim.task.input.profile,
      output,
      workspace,
      new AbortController().signal,
      async () => {},
    );
    const done = await api<{ versionId: string }>(
      `device/tasks/${task.id}/complete`,
      'POST',
      {
        leaseToken: claim.task.leaseToken,
        output,
        render: rendered.render,
        pdf: rendered.pdf.toString('base64'),
      },
      token,
    );
    prior = done.versionId;
  }
  const state = await api<WorkspaceData>('workspace', 'GET', undefined, second);
  assert.equal(state.jobs.length, 1);
  assert.equal(state.versions.length, 2);
  assert.equal(state.profile.contact.name, 'Jordan Example');
  for (const artifact of state.artifacts) {
    await api(`artifacts/${artifact.id}`, 'GET', undefined, first, 404);
    const signed = await api<{ url: string }>(`artifacts/${artifact.id}`, 'GET', undefined, second);
    assert.equal((await fetch(signed.url)).status, 200);
  }
  await api(
    `applications/${state.applications[0].id}`,
    'PATCH',
    {
      stage: 'Applied',
      notes: 'Second synthetic account only',
      appliedAt: '2026-10-18',
      resumeVersionId: prior,
    },
    second,
  );
  const reloaded = await api<WorkspaceData>('workspace', 'GET', undefined, second);
  assert.equal(reloaded.applications[0].resume_version_id, prior);
  const original = await api<WorkspaceData>('workspace', 'GET', undefined, first);
  assert.equal(
    original.jobs.some((item) => item.id === job.id),
    false,
  );
  assert.equal(original.profile.contact.name, 'Alex Example');
  await api(`devices/${deviceId}`, 'DELETE', undefined, second);
  await api('device/claim', 'POST', {}, token, 401);
  console.log(
    'Second synthetic account: independent pairing, tailor/revise protocol, PDFs, tracker persistence and revocation passed with fixture output (no second-user AI). Cross-user queue claims, device revocation and artifact access were denied.',
  );
}
