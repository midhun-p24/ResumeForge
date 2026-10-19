import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { createClient } from '@supabase/supabase-js';
import {
  agentOutputSchema,
  applicationSchema,
  completionSchema,
  emptyProfile,
  idSchema,
  jobSchema,
  profileSchema,
  progressStages,
  taskInputSchema,
  validateEvidence,
  COMPANION_VERSION,
  importTaskSchema,
  importOutputSchema,
  validateImport,
} from '@resumeforge/contracts';
import type { AgentOutput, TaskInput } from '@resumeforge/contracts';
import { renderLatex, safeFilename } from '@resumeforge/resume';
import {
  ApiError,
  body,
  checked,
  clientAddress,
  db,
  deviceFor,
  hash,
  owned,
  rate,
  secret,
  sameOrigin,
  registrationOpen,
  userFor,
} from '../../../lib/server';
import { profileImportRoute } from '../../../lib/profile-import';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const ok = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const taskFields = 'id,job_id,state,stage,error_code,created_at,input,draft,import_applied_at';
const versionFields = 'id,job_id,task_id,parent_id,output,profile,render,created_at,label';

async function handle(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await params;
    const route = path.join('/');
    const method = request.method;
    if (method !== 'GET') sameOrigin(request);
    if (route === 'public/config' && method === 'GET')
      return ok({
        registrationOpen: registrationOpen(),
        companionRequired: true,
        providers: ['codex'],
        companionVersion: COMPANION_VERSION,
      });
    if (route === 'auth/email' && method === 'POST') {
      if (!registrationOpen())
        throw new ApiError(
          503,
          'REGISTRATION_PAUSED',
          'Registration is not open yet. Email sign-in is being prepared.',
        );
      const b = z.object({ email: z.email().max(254) }).parse(await body(request, 1000));
      await rate(`email-ip:${clientAddress(request)}`, 8);
      await rate(`email-address:${b.email.trim().toLowerCase()}`, 4);
      await rate('email-global-hour', 30, 3600);
      await rate('email-global-day', 80, 86400);
      const auth = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      const sent = await auth.auth.signInWithOtp({
        email: b.email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: process.env.RESUMEFORGE_APP_URL || new URL(request.url).origin,
        },
      });
      if (sent.error)
        throw new ApiError(
          503,
          'EMAIL_UNAVAILABLE',
          'Email sign-in is temporarily unavailable. Please try again later.',
        );
      return ok({ sent: true });
    }
    // Pairing is the only unauthenticated endpoint; secrets are never sent in URLs.
    if (route === 'pairing/start' && method === 'POST') {
      const b = z
        .object({ name: z.string().min(1).max(80), tokenHash: z.string().regex(/^[a-f0-9]{64}$/) })
        .parse(await body(request, 2000));
      const ip = clientAddress(request);
      await rate(`pair:${ip}`, 6);
      await rate('pair-global', 240, 3600);
      const code = secret()
          .replace(/[^A-Z0-9]/gi, '')
          .slice(0, 12)
          .toUpperCase(),
        pollSecret = secret();
      const row = checked(
        await db().rpc('rf_start_pair', {
          p_requester: hash(ip),
          p_name: b.name,
          p_token: b.tokenHash,
          p_code: hash(code),
          p_poll: hash(pollSecret),
        }),
      ) as { id: string; expires_at: string };
      return ok(
        {
          id: row.id,
          code: code.match(/.{1,4}/g)!.join('-'),
          pollSecret,
          expiresAt: row.expires_at,
        },
        201,
      );
    }
    if (route === 'pairing/poll' && method === 'POST') {
      const b = z
        .object({ id: idSchema, pollSecret: z.string().min(40).max(60) })
        .parse(await body(request, 2000));
      await rate(`poll-ip:${clientAddress(request)}`, 180, 60);
      const pair = checked(
        await db()
          .from('pairing_requests')
          .select('id')
          .eq('id', b.id)
          .eq('poll_hash', hash(b.pollSecret))
          .maybeSingle(),
      );
      if (!pair)
        throw new ApiError(
          409,
          'PAIR_INVALID',
          'Pairing expired or is invalid. Start pairing again.',
        );
      await rate(`poll:${b.id}`, 160);
      return ok(
        checked(await db().rpc('rf_consume_pair', { p_id: b.id, p_poll_hash: hash(b.pollSecret) })),
      );
    }
    if (path[0] === 'device') {
      const d = await deviceFor(request);
      await rate(`device:${d.id}`, 120, 60);
      if (path[3] === 'complete') await rate(`complete:${d.id}`, 10, 60);
      if (route === 'device/claim' && method === 'POST') {
        const b = z
          .object({ profileImport: z.boolean().optional() })
          .parse(await body(request, 2000));
        return ok({
          task: checked(
            await db().rpc('rf_claim_capable', {
              p_device: d.id,
              p_imports: b.profileImport === true,
            }),
          ),
        });
      }
      if (route === 'device/disconnect' && method === 'POST') {
        checked(
          await db()
            .from('agent_devices')
            .update({ revoked_at: new Date().toISOString() })
            .eq('id', d.id),
        );
        return ok({ revoked: true });
      }
      if (route === 'device/heartbeat' && method === 'POST') {
        const b = z
          .object({
            taskId: idSchema.nullable(),
            leaseToken: idSchema.nullable(),
            stage: z.enum(progressStages),
            agentStatus: z.enum(['authenticated', 'sign_in_required', 'unavailable']),
            companionVersion: z.string().max(20).optional(),
            capabilities: z.array(z.literal('profile_import_v1')).max(1).optional(),
          })
          .parse(await body(request, 3000));
        checked(
          await db()
            .from('agent_devices')
            .update({
              companion_version: b.companionVersion ?? null,
              capabilities: b.capabilities ?? [],
            })
            .eq('id', d.id),
        );
        return ok({
          active: checked(
            await db().rpc('rf_heartbeat', {
              p_device: d.id,
              p_task: b.taskId,
              p_lease: b.leaseToken,
              p_stage: b.stage,
              p_agent: b.agentStatus,
            }),
          ),
        });
      }
      if (path[1] === 'tasks' && path[2]) {
        const task = await owned('tasks', idSchema.parse(path[2]), d.user_id);
        if (task.input?.operation === 'import_profile') {
          const input = importTaskSchema.parse(task.input);
          if (path[3] === 'import-complete' && method === 'POST') {
            await rate(`complete:${d.id}`, 10, 60);
            const b = z
              .object({ leaseToken: idSchema, output: importOutputSchema })
              .parse(await body(request, 1000000));
            const errors = validateImport(input, b.output);
            if (errors.length) throw new ApiError(422, 'IMPORT_EVIDENCE', errors.join('; '));
            return ok({
              id: checked(
                await db().rpc('rf_finish_import', {
                  p_device: d.id,
                  p_task: task.id,
                  p_lease: b.leaseToken,
                  p_output: b.output,
                }),
              ),
            });
          }
          if (path[3] === 'fail' && method === 'POST') {
            const b = z
              .object({
                leaseToken: idSchema,
                code: z.enum([
                  'AUTH_REQUIRED',
                  'USAGE_LIMIT',
                  'MODEL_ACCESS',
                  'AGENT_FAILED',
                  'INVALID_OUTPUT',
                  'TIMEOUT',
                  'CANCELLED',
                ]),
                draft: z.null(),
                details: z.array(z.string().max(200)).max(8).optional(),
              })
              .parse(await body(request, 2000));
            return ok({
              saved: checked(
                await db().rpc('rf_fail', {
                  p_device: d.id,
                  p_task: task.id,
                  p_lease: b.leaseToken,
                  p_code: b.code,
                  p_draft: b.details?.length ? { importDiagnostics: b.details } : null,
                }),
              ),
            });
          }
          throw new ApiError(404, 'NOT_FOUND', 'Endpoint not found.');
        }
        const input = taskInputSchema.parse(task.input);
        if (path[3] === 'complete' && method === 'POST') {
          const b = completionSchema.parse(await body(request));
          if (task.device_id !== d.id || task.lease_token !== b.leaseToken)
            throw new ApiError(409, 'LEASE_LOST', 'Task belongs to another lease.');
          if (task.state === 'completed') {
            const v = checked(
              await db().from('resume_versions').select('id').eq('task_id', task.id).single(),
            );
            return ok({ versionId: v.id });
          }
          if (task.state !== 'running' || Date.parse(task.lease_until) <= Date.now())
            throw new ApiError(409, 'LEASE_LOST', 'Task was cancelled or the lease expired.');
          ensureEvidence(input, b.output);
          if (
            b.render.status === 'ready' &&
            (!b.pdf || b.render.pageCount !== 1 || !b.render.textVerified)
          )
            throw new ApiError(
              422,
              'INVALID_RENDER',
              'A ready resume needs a verified one-page PDF.',
            );
          const files: { kind: string; bytes: Buffer; mime: string }[] = [
            {
              kind: 'tex',
              bytes: Buffer.from(renderLatex(input.profile, b.output)),
              mime: 'application/x-tex',
            },
            {
              kind: 'json',
              bytes: Buffer.from(JSON.stringify(b.output, null, 2)),
              mime: 'application/json',
            },
          ];
          if (b.pdf) {
            const bytes = Buffer.from(b.pdf, 'base64');
            if (bytes.length > 2097152 || bytes.subarray(0, 5).toString() !== '%PDF-')
              throw new ApiError(422, 'INVALID_PDF', 'Invalid PDF artifact.');
            const pdf = await PDFDocument.load(bytes, { ignoreEncryption: false });
            if (pdf.getPageCount() !== b.render.pageCount)
              throw new ApiError(422, 'INVALID_PDF', 'PDF page count mismatch.');
            files.push({ kind: 'pdf', bytes, mime: 'application/pdf' });
          }
          // Unique request prefix avoids one retry deleting another retry's artifacts.
          const prefix = `${d.user_id}/${task.id}/${randomUUID()}`;
          const name = safeFilename(input.profile.contact.name, input.job.company, input.job.title);
          const artifacts = [];
          try {
            for (const f of files) {
              const p = `${prefix}/resume.${f.kind}`;
              checked(
                await db()
                  .storage.from('resume-artifacts')
                  .upload(p, f.bytes, { contentType: f.mime, upsert: false }),
              );
              artifacts.push({
                kind: f.kind,
                path: p,
                filename: `${name}.${f.kind}`,
                sha256: hash(f.bytes),
                size_bytes: f.bytes.length,
              });
            }
            const versionId = checked(
              await db().rpc('rf_finish', {
                p_device: d.id,
                p_task: task.id,
                p_lease: b.leaseToken,
                p_output: b.output,
                p_render: b.render,
                p_artifacts: artifacts,
              }),
            );
            const actual = checked(
              await db().from('artifacts').select('path').eq('version_id', versionId),
            );
            const unused = artifacts
              .map((a) => a.path)
              .filter((p) => !actual.some((a) => a.path === p));
            if (unused.length) checked(await db().storage.from('resume-artifacts').remove(unused));
            return ok({ versionId });
          } catch (e) {
            if (artifacts.length)
              await db()
                .storage.from('resume-artifacts')
                .remove(artifacts.map((a) => a.path));
            throw e;
          }
        }
        if (path[3] === 'fail' && method === 'POST') {
          const b = z
            .object({
              leaseToken: idSchema,
              code: z.enum([
                'AUTH_REQUIRED',
                'USAGE_LIMIT',
                'MODEL_ACCESS',
                'AGENT_FAILED',
                'INVALID_OUTPUT',
                'COMPILER_MISSING',
                'COMPILE_FAILED',
                'TIMEOUT',
                'CANCELLED',
              ]),
              draft: agentOutputSchema.nullable(),
            })
            .parse(await body(request, 1000000));
          return ok({
            saved: checked(
              await db().rpc('rf_fail', {
                p_device: d.id,
                p_task: task.id,
                p_lease: b.leaseToken,
                p_code: b.code,
                p_draft: b.draft,
              }),
            ),
          });
        }
      }
      throw new ApiError(404, 'NOT_FOUND', 'Endpoint not found.');
    }
    const u = await userFor(request);
    await rate(`user:${u.id}`, 180, 60);
    if (method !== 'GET') await rate(`write:${u.id}`, 40, 60);
    const importResponse = await profileImportRoute(request, path, u.id);
    if (importResponse) return importResponse;
    if (route === 'workspace') await rate(`workspace:${u.id}`, 60, 60);
    if (route === 'export') await rate(`export:${u.id}`, 3, 600);
    if (path[0] === 'artifacts') await rate(`download:${u.id}`, 60, 60);
    if (route === 'workspace' && method === 'GET') {
      const tables = [
        ['profiles', 'data'],
        ['jobs', 'id,data,created_at'],
        ['tasks', taskFields],
        ['resume_versions', versionFields],
        ['applications', 'id,job_id,stage,notes,applied_at,resume_version_id'],
        [
          'agent_devices',
          'id,name,last_seen,revoked_at,agent_status,companion_version,capabilities',
        ],
        ['artifacts', 'id,version_id,kind,filename'],
      ];
      const results = await Promise.all(
        tables.map(([table, select]) => {
          const query = db()
            .from(table)
            .select(select)
            .eq('user_id', u.id)
            .order(
              table === 'profiles'
                ? 'updated_at'
                : table === 'applications'
                  ? 'id'
                  : table === 'artifacts'
                    ? 'id'
                    : 'created_at',
              { ascending: false },
            )
            .limit(table === 'tasks' ? 100 : 500);
          return table === 'tasks' ? query.neq('input->>operation', 'import_profile') : query;
        }),
      );
      const rows = results.map((r) => checked(r));
      return ok({
        profile: (rows[0][0] as unknown as { data: unknown })?.data ?? emptyProfile,
        jobs: rows[1],
        tasks: rows[2],
        versions: rows[3],
        applications: rows[4],
        devices: rows[5],
        artifacts: rows[6],
      });
    }
    if (route === 'profile' && method === 'PUT') {
      await rate(`profile:${u.id}`, 10, 60);
      const p = profileSchema.parse(await body(request, 500000));
      checked(await db().rpc('rf_save_profile', { p_user: u.id, p_data: p }));
      return ok({ saved: true });
    }
    if (route === 'jobs' && method === 'POST') {
      await rate(`jobs:${u.id}`, 30, 3600);
      const j = jobSchema.parse(await body(request, 100000));
      const id = checked(await db().rpc('rf_save_job', { p_user: u.id, p_data: j }));
      return ok({ id }, 201);
    }
    if (route === 'pairing/approve' && method === 'POST') {
      const b = z.object({ code: z.string().max(30) }).parse(await body(request, 1000));
      await rate(`approve:${u.id}`, 12);
      const code = b.code.replace(/-/g, '').trim().toUpperCase();
      if (!/^[A-Z0-9]{12}$/.test(code))
        throw new ApiError(400, 'PAIR_INVALID', 'Enter the code shown by your companion.');
      return ok({
        deviceId: checked(
          await db().rpc('rf_approve_pair', { p_user: u.id, p_code_hash: hash(code) }),
        ),
      });
    }
    if (path[0] === 'devices' && path[1] && method === 'DELETE') {
      await owned('agent_devices', idSchema.parse(path[1]), u.id);
      checked(
        await db()
          .from('agent_devices')
          .update({ revoked_at: new Date().toISOString() })
          .eq('id', path[1])
          .eq('user_id', u.id),
      );
      return ok({ revoked: true });
    }
    if (route === 'tasks' && method === 'POST') {
      await rate(`enqueue:${u.id}`, 30, 3600);
      const b = z
        .object({
          jobId: idSchema,
          operation: z.enum(['tailor', 'revise', 'render']),
          versionId: idSchema.nullable(),
          revisionRequest: z.string().max(8000),
          lockedBulletIds: z.array(idSchema).max(200),
          lockedSectionIds: z.array(idSchema).max(12),
          excludedSourceIds: z.array(idSchema).max(150),
        })
        .parse(await body(request, 20000));
      const job = await owned('jobs', b.jobId, u.id);
      const prior = b.versionId ? await owned('resume_versions', b.versionId, u.id) : null;
      if (prior && prior.job_id !== b.jobId)
        throw new ApiError(400, 'WRONG_JOB', 'Version belongs to another job.');
      if (b.operation === 'tailor' && prior)
        throw new ApiError(400, 'INVALID_TASK', 'Use revision to continue a version.');
      const p = checked(
        await db().from('profiles').select('data').eq('user_id', u.id).maybeSingle(),
      );
      const profile = profileSchema.parse(prior?.profile ?? p?.data ?? emptyProfile);
      if (!profile.contact.name || !profile.records.some((r) => r.verification === 'approved'))
        throw new ApiError(
          422,
          'PROFILE_REQUIRED',
          'Add your name and at least one approved profile record.',
        );
      const taskId = randomUUID();
      const input = taskInputSchema.parse({
        schemaVersion: 1,
        taskId,
        operation: b.operation,
        profile,
        job: job.data,
        instructions: profile.preferences.instructions,
        priorOutput: prior?.output ?? null,
        revisionRequest: b.revisionRequest,
        lockedBulletIds: b.lockedBulletIds,
        lockedSectionIds: b.lockedSectionIds,
        excludedSourceIds: b.excludedSourceIds,
      });
      checked(await db().rpc('rf_enqueue', { p_user: u.id, p_job: b.jobId, p_input: input }));
      return ok({ id: taskId }, 201);
    }
    if (path[0] === 'tasks' && path[1] && method === 'DELETE') {
      await owned('tasks', idSchema.parse(path[1]), u.id);
      checked(
        await db()
          .from('tasks')
          .update({ state: 'cancelled', stage: 'Cancelled', lease_until: null })
          .eq('id', path[1])
          .eq('user_id', u.id)
          .in('state', ['queued', 'running']),
      );
      return ok({ cancelled: true });
    }
    if (path[0] === 'events' && path[1] && method === 'GET') {
      await owned('tasks', idSchema.parse(path[1]), u.id);
      return ok(
        checked(
          await db()
            .from('task_events')
            .select('id,stage,created_at')
            .eq('task_id', path[1])
            .eq('user_id', u.id)
            .order('created_at'),
        ),
      );
    }
    if (route === 'versions' && method === 'POST') {
      await rate(`versions:${u.id}`, 60, 3600);
      const b = z
        .object({
          parentId: idSchema,
          output: agentOutputSchema,
          label: z.string().min(1).max(100),
        })
        .parse(await body(request, 1000000));
      const parent = await owned('resume_versions', b.parentId, u.id);
      const job = await owned('jobs', parent.job_id, u.id);
      const input = taskInputSchema.parse({
        schemaVersion: 1,
        taskId: randomUUID(),
        operation: 'revise',
        profile: parent.profile,
        job: job.data,
        instructions: '',
        priorOutput: parent.output,
        revisionRequest: '',
        lockedBulletIds: [],
        lockedSectionIds: [],
        excludedSourceIds: [],
      });
      ensureEvidence(input, b.output);
      const id = checked(
        await db().rpc('rf_save_version', {
          p_user: u.id,
          p_job: parent.job_id,
          p_parent: parent.id,
          p_output: b.output,
          p_label: b.label,
        }),
      );
      return ok({ id }, 201);
    }
    if (path[0] === 'applications' && path[1] && method === 'PATCH') {
      const a = await owned('applications', idSchema.parse(path[1]), u.id);
      const b = applicationSchema.parse(await body(request, 15000));
      if (b.resumeVersionId) {
        const v = await owned('resume_versions', b.resumeVersionId, u.id);
        if (v.job_id !== a.job_id)
          throw new ApiError(400, 'WRONG_JOB', 'Select a resume for this job.');
      }
      checked(
        await db()
          .from('applications')
          .update({
            stage: b.stage,
            notes: b.notes,
            applied_at: b.appliedAt || null,
            resume_version_id: b.resumeVersionId,
          })
          .eq('id', a.id)
          .eq('user_id', u.id),
      );
      return ok({ saved: true });
    }
    if (path[0] === 'artifacts' && path[1] && method === 'GET') {
      const a = await owned('artifacts', idSchema.parse(path[1]), u.id);
      const signed = checked(
        await db().storage.from('resume-artifacts').createSignedUrl(a.path, 60),
      );
      return ok({ url: signed.signedUrl, filename: a.filename });
    }
    if (route === 'export' && method === 'GET') {
      const tables = [
        'profiles',
        'source_records',
        'jobs',
        'profile_snapshots',
        'job_snapshots',
        'tasks',
        'task_events',
        'resume_versions',
        'applications',
        'artifacts',
      ];
      const data = await Promise.all(
        tables.map((t) =>
          db()
            .from(t)
            .select(t === 'tasks' ? taskFields : '*')
            .eq('user_id', u.id),
        ),
      );
      return ok({
        product: 'ResumeForge',
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        data: Object.fromEntries(tables.map((t, i) => [t, checked(data[i])])),
      });
    }
    if (route === 'account' && method === 'DELETE') {
      const b = z
        .object({ confirmation: z.literal('DELETE MY RESUMEFORGE ACCOUNT') })
        .parse(await body(request, 1000));
      void b;
      // Revoke first. Leased completion re-checks revocation inside its transaction.
      checked(
        await db()
          .from('agent_devices')
          .update({ revoked_at: new Date().toISOString() })
          .eq('user_id', u.id),
      );
      const artifacts = checked(await db().from('artifacts').select('path').eq('user_id', u.id));
      for (let i = 0; i < artifacts.length; i += 100)
        checked(
          await db()
            .storage.from('resume-artifacts')
            .remove(artifacts.slice(i, i + 100).map((a) => a.path)),
        );
      const deleted = await db().auth.admin.deleteUser(u.id);
      if (deleted.error)
        throw new ApiError(
          500,
          'DELETE_FAILED',
          'Account deletion failed. Retry to finish deletion.',
        );
      return ok({ deleted: true });
    }
    throw new ApiError(404, 'NOT_FOUND', 'Endpoint not found.');
  } catch (e) {
    if (e instanceof z.ZodError)
      return ok(
        {
          code: 'VALIDATION',
          error: e.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .slice(0, 8)
            .join('; '),
        },
        400,
      );
    if (e instanceof ApiError) return ok({ code: e.code, error: e.message }, e.status);
    // Avoid logging inputs, database errors, agent output or credential-bearing requests.
    return ok(
      { code: 'INTERNAL_ERROR', error: 'Operation failed. Retry or check server configuration.' },
      500,
    );
  }
}
function ensureEvidence(input: TaskInput, output: AgentOutput) {
  const errors = validateEvidence(input, output);
  if (errors.length) throw new ApiError(422, 'EVIDENCE_INVALID', errors.join('; '));
}
export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
