import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new ApiError(
      503,
      'SETUP_REQUIRED',
      'Configure Supabase and apply the ResumeForge migration.',
    );
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export const hash = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
export const secret = () => randomBytes(32).toString('base64url');
export async function userFor(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) throw new ApiError(401, 'SIGN_IN_REQUIRED', 'Sign in to continue.');
  const { data, error } = await db().auth.getUser(token);
  if (error || !data.user) throw new ApiError(401, 'SESSION_EXPIRED', 'Sign in again.');
  if (!data.user.email_confirmed_at)
    throw new ApiError(403, 'EMAIL_UNVERIFIED', 'Verify your email before using your workspace.');
  return data.user;
}
export async function deviceFor(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token || !/^rf_[A-Za-z0-9_-]{43}$/.test(token))
    throw new ApiError(401, 'DEVICE_AUTH', 'Pair this companion in ResumeForge.');
  await rate(`device-ip:${clientAddress(request)}`, 240, 60);
  const { data, error } = await db()
    .from('agent_devices')
    .select('id,user_id,revoked_at')
    .eq('token_hash', hash(token))
    .maybeSingle();
  if (error || !data || data.revoked_at)
    throw new ApiError(401, 'DEVICE_REVOKED', 'Device disconnected. Pair again in ResumeForge.');
  return data;
}
export function checked<T>({
  data,
  error,
}: {
  data: T;
  error: { message: string } | null;
}): NonNullable<T> {
  if (error) {
    const known = [
      'PAIR_INVALID',
      'DEVICE_REVOKED',
      'LEASE_LOST',
      'QUEUE_FULL',
      'NOT_FOUND',
      'ARTIFACT_OWNER',
      'PAIR_LIMIT',
      'DEVICE_LIMIT',
      'TASK_LIMIT',
      'STORAGE_LIMIT',
      'ACCOUNT_LIMIT',
      'EVENT_LIMIT',
    ];
    const code = known.find((c) => error.message.includes(c));
    if (code)
      throw new ApiError(
        code === 'NOT_FOUND' ? 404 : 409,
        code,
        {
          PAIR_INVALID: 'Pairing code expired, already used, or incorrect. Start pairing again.',
          DEVICE_REVOKED: 'Device disconnected. Pair again.',
          LEASE_LOST: 'Task lease expired or the task was cancelled.',
          QUEUE_FULL: 'Finish or cancel queued tasks before adding more.',
          NOT_FOUND: 'Record not found.',
          ARTIFACT_OWNER: 'Artifact ownership check failed.',
          PAIR_LIMIT: 'Too many pending pairings. Finish one or wait for its code to expire.',
          DEVICE_LIMIT:
            'Device limit reached. Disconnect an existing device before pairing another.',
          TASK_LIMIT: 'Task allowance reached: 20 per hour and 50 per day. Try again later.',
          STORAGE_LIMIT:
            'Your private artifact allowance is full (100 MiB). Export your data before clearing your account.',
          ACCOUNT_LIMIT:
            'Workspace capacity reached. Export your data before clearing your account.',
          EVENT_LIMIT: 'This task reported too many stage changes. Cancel it and start again.',
        }[code]!,
      );
    throw new ApiError(
      500,
      'DATABASE_ERROR',
      'Database operation failed. Check the migration and server configuration.',
    );
  }
  return data as NonNullable<T>;
}

/** Vercel overwrites its platform client-IP header. Ignore ordinary forwarding
 * headers and caller-controlled values on local or unconfigured proxies. */
export function clientAddress(request: Request) {
  if (process.env.VERCEL !== '1') return 'local';
  const value = request.headers.get('x-vercel-forwarded-for')?.trim() ?? '';
  return isIP(value) ? value : 'unavailable';
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin)
    throw new ApiError(403, 'ORIGIN_DENIED', 'Use ResumeForge from its own website.');
}

export const registrationOpen = () => process.env.RESUMEFORGE_REGISTRATION_ENABLED === 'true';
export async function rate(key: string, limit: number, seconds = 600) {
  const ok = checked(
    await db().rpc('rf_rate', { p_key: hash(key), p_limit: limit, p_seconds: seconds }),
  );
  if (!ok) throw new ApiError(429, 'RATE_LIMIT', 'Too many requests. Try again later.');
}
export async function body(request: Request, max = 3500000): Promise<unknown> {
  if (Number(request.headers.get('content-length') || 0) > max)
    throw new ApiError(413, 'TOO_LARGE', 'Request is too large.');
  if (!request.body) return {};
  const reader = request.body.getReader();
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > max) {
      await reader.cancel();
      throw new ApiError(413, 'TOO_LARGE', 'Request is too large.');
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'Expected JSON.');
  }
}
export async function owned(table: string, id: string, userId: string) {
  const row = checked(
    await db().from(table).select('*').eq('id', id).eq('user_id', userId).maybeSingle(),
  );
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Record not found.');
  return row;
}
