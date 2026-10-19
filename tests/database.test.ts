import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { fixture } from './fixtures';
import { importFixture } from './import-fixtures';
import { emptyProfile } from '@resumeforge/contracts';

let pg: PGlite;
const user = randomUUID(),
  other = randomUUID();
async function scalar<T = string>(sql: string, args: unknown[] = []): Promise<T> {
  const result = await pg.query<Record<string, T>>(sql, args);
  return Object.values(result.rows[0])[0];
}
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to authenticated,anon,service_role;
    create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  const folder = new URL('../supabase/migrations/', import.meta.url);
  for (const file of (await readdir(folder)).filter((f) => f.endsWith('.sql')).sort()) {
    const migration = await readFile(new URL(file, folder), 'utf8');
    // pgcrypto is not distributed in WASM; UUID generation is built into Postgres.
    await pg.exec(migration.replace('create extension if not exists pgcrypto;', ''));
  }
  await pg.query('insert into auth.users values ($1),($2)', [user, other]);
}, 30000);
afterAll(async () => {
  await pg?.close();
});
async function device(owner = user) {
  const id = randomUUID();
  await pg.query('insert into agent_devices(id,user_id,name,token_hash) values($1,$2,$3,$4)', [
    id,
    owner,
    'Synthetic computer',
    randomUUID(),
  ]);
  return id;
}
async function enqueue(owner = user) {
  const { input, output } = fixture();
  const job = await scalar('select rf_save_job($1,$2)', [owner, input.job]);
  await scalar('select rf_enqueue($1,$2,$3)', [owner, job, input]);
  return { input, output, job };
}

describe('real PostgreSQL policies and transactions', () => {
  it('bounds concurrent queue creation and counts cancelled tasks toward hourly allowance', async () => {
    const owner = randomUUID();
    await pg.query('insert into auth.users values($1)', [owner]);
    for (let index = 0; index < 3; index++) await enqueue(owner);
    const before = await scalar<number>(
      'select count(*)::int from profile_snapshots where user_id=$1',
      [owner],
    );
    await expect(enqueue(owner)).rejects.toThrow('QUEUE_FULL');
    expect(
      await scalar<number>('select count(*)::int from profile_snapshots where user_id=$1', [owner]),
    ).toBe(before);
    await pg.query("update tasks set state='cancelled' where user_id=$1", [owner]);
    for (let index = 3; index < 20; index++) {
      await enqueue(owner);
      await pg.query("update tasks set state='cancelled' where user_id=$1", [owner]);
    }
    await expect(enqueue(owner)).rejects.toThrow('TASK_LIMIT');
    await pg.query("update tasks set created_at=now()-interval '2 hours' where user_id=$1", [
      owner,
    ]);
    await expect(enqueue(owner)).resolves.toHaveProperty('job');
  });
  it('bounds pending pairings per IP and active devices per account', async () => {
    const owner = randomUUID();
    await pg.query('insert into auth.users values($1)', [owner]);
    const ip = randomUUID();
    for (let index = 0; index < 3; index++)
      await scalar('select rf_start_pair($1,$2,$3,$4,$5)', [
        ip,
        randomUUID(),
        randomUUID(),
        randomUUID(),
        'Synthetic pairing',
      ]);
    await expect(
      pg.query('select rf_start_pair($1,$2,$3,$4,$5)', [
        ip,
        randomUUID(),
        randomUUID(),
        randomUUID(),
        'Too many',
      ]),
    ).rejects.toThrow('PAIR_LIMIT');
    for (let index = 0; index < 5; index++) await device(owner);
    await expect(device(owner)).rejects.toThrow('DEVICE_LIMIT');
    await pg.query(
      'update agent_devices set revoked_at=now() where id=(select id from agent_devices where user_id=$1 limit 1)',
      [owner],
    );
    await expect(device(owner)).resolves.toBeTypeOf('string');
  });
  it('isolates all owner-scoped tables and denies anonymous access', async () => {
    await pg.query('select rf_save_profile($1,$2)', [user, fixture().input.profile]);
    await pg.exec(`set role authenticated;set request.jwt.claim.sub='${other}';`);
    expect(await scalar<number>('select count(*)::int from profiles')).toBe(0);
    await expect(
      pg.query('insert into profiles(user_id,data) values($1,$2)', [other, {}]),
    ).rejects.toThrow(/permission denied/);
    await pg.exec('reset role;set role anon');
    await expect(pg.query('select * from profiles')).rejects.toThrow(/permission denied/);
    await pg.exec('reset role');
    const rows = await pg.query<{ tablename: string; rowsecurity: boolean }>(
      `select tablename,rowsecurity from pg_tables where schemaname='public'`,
    );
    expect(rows.rows.every((r) => r.rowsecurity)).toBe(true);
  });
  it('does not expose token hashes, lease tokens, pairing rows, or RPCs', async () => {
    await pg.exec(`set role authenticated;set request.jwt.claim.sub='${user}';`);
    for (const sql of [
      'select token_hash from agent_devices',
      'select lease_token from tasks',
      'select * from pairing_requests',
      `select rf_claim('${randomUUID()}')`,
    ])
      await expect(pg.query(sql)).rejects.toThrow(/permission denied/);
    await pg.exec('reset role');
  });
  it('expires pairing, permits one approval and one credential consumption', async () => {
    const id = randomUUID(),
      code = randomUUID(),
      poll = randomUUID();
    await pg.query(
      'insert into pairing_requests(id,code_hash,poll_hash,token_hash,name) values($1,$2,$3,$4,$5)',
      [id, code, poll, randomUUID(), 'Pair test'],
    );
    expect(await scalar('select rf_consume_pair($1,$2)', [id, poll])).toEqual({
      status: 'pending',
    });
    const d = await scalar('select rf_approve_pair($1,$2)', [user, code]);
    await expect(pg.query('select rf_approve_pair($1,$2)', [other, code])).rejects.toThrow(
      'PAIR_INVALID',
    );
    expect(await scalar('select rf_consume_pair($1,$2)', [id, poll])).toEqual({
      status: 'approved',
      deviceId: d,
    });
    await expect(pg.query('select rf_consume_pair($1,$2)', [id, poll])).rejects.toThrow(
      'PAIR_INVALID',
    );
    await pg.query(
      "insert into pairing_requests(code_hash,poll_hash,token_hash,name,expires_at) values($1,$2,$3,$4,now()-interval '1 second')",
      [code + 'x', poll, randomUUID(), 'Expired'],
    );
    await expect(pg.query('select rf_approve_pair($1,$2)', [user, code + 'x'])).rejects.toThrow(
      'PAIR_INVALID',
    );
  });
  it('claims atomically, prevents duplicate work, renews leases, and bounds retries', async () => {
    const { input } = await enqueue();
    const d = await device(),
      d2 = await device();
    const claims = await Promise.all([
      scalar<{ id: string; leaseToken: string } | null>('select rf_claim($1)', [d]),
      scalar<{ id: string; leaseToken: string } | null>('select rf_claim($1)', [d2]),
    ]);
    const claimed = claims.find((c) => c?.id === input.taskId)!;
    expect(claims.filter(Boolean)).toHaveLength(1);
    const owner = claims[0] ? d : d2;
    expect(await scalar('select rf_claim($1)', [owner])).toBeNull();
    expect(
      await scalar('select rf_heartbeat($1,$2,$3,$4,$5)', [
        owner,
        input.taskId,
        claimed.leaseToken,
        'Writing resume',
        'authenticated',
      ]),
    ).toBe(true);
    for (let n = 0; n < 3; n++) {
      await pg.query("update tasks set lease_until=now()-interval '1 second' where id=$1", [
        input.taskId,
      ]);
      await scalar('select rf_claim($1)', [d]);
    }
    expect(await scalar('select state from tasks where id=$1', [input.taskId])).toBe('failed');
    expect(await scalar('select attempts from tasks where id=$1', [input.taskId])).toBe(3);
  });
  it('never gives another user a task and rejects revoked devices', async () => {
    const { input } = await enqueue();
    const d = await device(other);
    expect(await scalar('select rf_claim($1)', [d])).toBeNull();
    const mine = await device();
    const t = await scalar<{ leaseToken: string }>('select rf_claim($1)', [mine]);
    await pg.query('update agent_devices set revoked_at=now() where id=$1', [mine]);
    await expect(
      pg.query('select rf_heartbeat($1,$2,$3,$4,$5)', [
        mine,
        input.taskId,
        t.leaseToken,
        'Writing resume',
        'authenticated',
      ]),
    ).rejects.toThrow('DEVICE_REVOKED');
    await expect(pg.query('select rf_claim($1)', [mine])).rejects.toThrow('DEVICE_REVOKED');
    await pg.query("update tasks set state='cancelled' where id=$1", [input.taskId]);
  });
  it('completes idempotently, preserves versions and enforces artifact ownership', async () => {
    const { input, output, job } = await enqueue();
    const d = await device();
    const t = await scalar<{ leaseToken: string }>('select rf_claim($1)', [d]);
    const render = { status: 'review_required', pageCount: 1, textVerified: false, warnings: [] };
    const bad = [
      {
        kind: 'pdf',
        path: `${other}/resume.pdf`,
        filename: 'synthetic.pdf',
        sha256: 'test',
        size_bytes: 50,
      },
    ];
    await expect(
      pg.query('select rf_finish($1,$2,$3,$4,$5,$6)', [
        d,
        input.taskId,
        t.leaseToken,
        output,
        render,
        bad,
      ]),
    ).rejects.toThrow('ARTIFACT_OWNER');
    const args = [d, input.taskId, t.leaseToken, output, render, []];
    const v = await scalar('select rf_finish($1,$2,$3,$4,$5,$6)', args);
    expect(await scalar('select rf_finish($1,$2,$3,$4,$5,$6)', args)).toBe(v);
    expect(
      await scalar<number>('select count(*)::int from resume_versions where task_id=$1', [
        input.taskId,
      ]),
    ).toBe(1);
    await expect(
      pg.query('update resume_versions set label=$1 where id=$2', ['changed', v]),
    ).rejects.toThrow('Immutable record');
    const restored = await scalar('select rf_save_version($1,$2,$3,$4,$5)', [
      user,
      job,
      v,
      output,
      'Restored',
    ]);
    expect(restored).not.toBe(v);
    await expect(
      pg.query('select rf_save_version($1,$2,$3,$4,$5)', [other, job, v, output, 'Unauthorized']),
    ).rejects.toThrow('NOT_FOUND');
    expect(await scalar('select stage from applications where job_id=$1', [job])).toBe('Tailoring');
  });
  it('cancellation fences out stale completions', async () => {
    const { input, output } = await enqueue();
    const d = await device();
    const t = await scalar<{ leaseToken: string }>('select rf_claim($1)', [d]);
    await pg.query("update tasks set state='cancelled',lease_until=null where id=$1", [
      input.taskId,
    ]);
    await expect(
      pg.query('select rf_finish($1,$2,$3,$4,$5,$6)', [
        d,
        input.taskId,
        t.leaseToken,
        output,
        {},
        [],
      ]),
    ).rejects.toThrow('LEASE_LOST');
  });
});

describe('profile import transactions and compatibility', () => {
  async function setup() {
    const owner = randomUUID();
    await pg.query('insert into auth.users values($1)', [owner]);
    const d = await device(owner);
    const { input, output } = importFixture();
    await scalar('select rf_save_profile($1,$2)', [owner, emptyProfile]);
    await scalar('select rf_enqueue_import($1,$2)', [owner, input]);
    return { owner, d, input, output };
  }
  it('old companions skip imports and capable companions share atomic leases', async () => {
    const { owner, d, input } = await setup();
    expect(await scalar('select rf_claim($1)', [d])).toBeNull();
    const claimed = await scalar<{ id: string; leaseToken: string }>(
      'select rf_claim_capable($1,true)',
      [d],
    );
    expect(claimed.id).toBe(input.taskId);
    expect(await scalar('select rf_claim_capable($1,true)', [d])).toBeNull();
    const foreign = await device(other);
    expect(await scalar('select rf_claim_capable($1,true)', [foreign])).toBeNull();
    await pg.query("update tasks set state='cancelled',lease_until=null where user_id=$1", [owner]);
  });
  it('completion is owner/lease scoped, idempotent and blocked after revocation', async () => {
    const { d, input, output } = await setup();
    const foreign = await device(other);
    const claimed = await scalar<{ leaseToken: string }>('select rf_claim_capable($1,true)', [d]);
    await expect(
      scalar('select rf_finish_import($1,$2,$3,$4)', [
        foreign,
        input.taskId,
        claimed.leaseToken,
        output,
      ]),
    ).rejects.toThrow('LEASE_LOST');
    await expect(
      scalar('select rf_finish_import($1,$2,$3,$4)', [d, input.taskId, randomUUID(), output]),
    ).rejects.toThrow('LEASE_LOST');
    expect(
      await scalar('select rf_finish_import($1,$2,$3,$4)', [
        d,
        input.taskId,
        claimed.leaseToken,
        output,
      ]),
    ).toBe(input.taskId);
    expect(
      await scalar('select rf_finish_import($1,$2,$3,$4)', [
        d,
        input.taskId,
        claimed.leaseToken,
        output,
      ]),
    ).toBe(input.taskId);
    await pg.query('update agent_devices set revoked_at=now() where id=$1', [d]);
    await expect(
      scalar('select rf_finish_import($1,$2,$3,$4)', [d, input.taskId, claimed.leaseToken, output]),
    ).rejects.toThrow('DEVICE_REVOKED');
  });
  it('merges drafts without replacing approved facts, skips duplicates and applies once', async () => {
    const { owner, d, input, output } = await setup();
    const profile = structuredClone(emptyProfile);
    profile.contact.name = 'Keep Existing Name';
    const existing = fixture().input.profile.records[0];
    existing.title = 'Unrelated approved project';
    profile.records = [existing];
    await scalar('select rf_save_profile($1,$2)', [owner, profile]);
    const claimed = await scalar<{ leaseToken: string }>('select rf_claim_capable($1,true)', [d]);
    await scalar('select rf_finish_import($1,$2,$3,$4)', [
      d,
      input.taskId,
      claimed.leaseToken,
      output,
    ]);
    const record = {
      ...output.records[0].record,
      id: randomUUID(),
      verification: 'approved',
      metrics: [],
    };
    const duplicate = { ...record, id: randomUUID(), title: record.title.toUpperCase() };
    await expect(
      scalar('select rf_apply_import($1,$2,$3,null)', [other, input.taskId, [record]]),
    ).rejects.toThrow('NOT_FOUND');
    const applied = await scalar<{ profile: typeof profile; added: number }>(
      'select rf_apply_import($1,$2,$3,null)',
      [owner, input.taskId, [record, duplicate]],
    );
    expect(applied.added).toBe(1);
    expect(applied.profile.contact.name).toBe('Keep Existing Name');
    expect(applied.profile.records[0]).toEqual(existing);
    expect(applied.profile.records[1].verification).toBe('draft');
    const retried = await scalar<{ added: number; alreadyApplied: boolean }>(
      'select rf_apply_import($1,$2,$3,null)',
      [owner, input.taskId, [{ ...record, id: randomUUID() }]],
    );
    expect(retried.added).toBe(0);
    expect(retried.alreadyApplied).toBe(true);
  });
  it('bounds imports and rejects cancelled or stale completion', async () => {
    const { owner, d, input, output } = await setup();
    const next = importFixture().input;
    await expect(scalar('select rf_enqueue_import($1,$2)', [owner, next])).rejects.toThrow(
      'IMPORT_PENDING',
    );
    const claimed = await scalar<{ leaseToken: string }>('select rf_claim_capable($1,true)', [d]);
    await pg.query("update tasks set state='cancelled',lease_until=null where id=$1", [
      input.taskId,
    ]);
    await expect(
      scalar('select rf_finish_import($1,$2,$3,$4)', [d, input.taskId, claimed.leaseToken, output]),
    ).rejects.toThrow('LEASE_LOST');
    for (let i = 0; i < 2; i++) {
      const queued = importFixture().input;
      await scalar('select rf_enqueue_import($1,$2)', [owner, queued]);
      await pg.query("update tasks set state='cancelled' where id=$1", [queued.taskId]);
    }
    await expect(scalar('select rf_enqueue_import($1,$2)', [owner, next])).rejects.toThrow(
      'IMPORT_LIMIT',
    );
  });
  it('denies browser execution of every new privileged function', async () => {
    await pg.exec('set role authenticated');
    try {
      await expect(
        pg.query('select rf_enqueue_import($1,$2)', [user, importFixture().input]),
      ).rejects.toThrow('permission denied');
      await expect(pg.query('select rf_claim_capable($1,true)', [randomUUID()])).rejects.toThrow(
        'permission denied',
      );
      await expect(
        pg.query('select rf_finish_import($1,$2,$3,$4)', [
          randomUUID(),
          randomUUID(),
          randomUUID(),
          {},
        ]),
      ).rejects.toThrow('permission denied');
      await expect(
        pg.query('select rf_apply_import($1,$2,$3,null)', [user, randomUUID(), []]),
      ).rejects.toThrow('permission denied');
    } finally {
      await pg.exec('reset role');
    }
  });
});
