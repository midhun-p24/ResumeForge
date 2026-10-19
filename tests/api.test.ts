import { describe, it, expect } from 'vitest';
import { GET, POST } from '../apps/web/app/api/[...path]/route';
import { localEnvironment, execFile } from '../apps/companion/src/process';
import { classifyError } from '../apps/companion/src/adapter';
import { clientAddress, sameOrigin } from '../apps/web/lib/server';
import { contentSecurityPolicy } from '../apps/web/lib/security';

describe('server authorization boundary', () => {
  it('keeps public registration closed until the server release gate is enabled', async () => {
    const previous = process.env.RESUMEFORGE_REGISTRATION_ENABLED;
    delete process.env.RESUMEFORGE_REGISTRATION_ENABLED;
    try {
      const result = await POST(
        new Request('http://localhost/api/auth/email', {
          method: 'POST',
          body: JSON.stringify({ email: 'synthetic@example.invalid' }),
        }),
        { params: Promise.resolve({ path: ['auth', 'email'] }) },
      );
      expect(result.status).toBe(503);
      expect((await result.json()).code).toBe('REGISTRATION_PAUSED');
    } finally {
      if (previous === undefined) delete process.env.RESUMEFORGE_REGISTRATION_ENABLED;
      else process.env.RESUMEFORGE_REGISTRATION_ENABLED = previous;
    }
  });
  it('rejects a foreign browser origin before processing a write', () => {
    expect(() =>
      sameOrigin(
        new Request('https://resume-forge.midoon.dev/api/tasks', {
          headers: { origin: 'https://attacker.example' },
        }),
      ),
    ).toThrow('Use ResumeForge');
  });
  it('ignores caller-controlled ordinary forwarding headers', () => {
    expect(
      clientAddress(
        new Request('http://localhost', { headers: { 'x-forwarded-for': '203.0.113.7' } }),
      ),
    ).not.toBe('203.0.113.7');
  });
  it('uses nonce-based production scripts without inline or eval exceptions', () => {
    const policy = contentSecurityPolicy('synthetic-nonce', false, 'https://synthetic.supabase.co');
    expect(policy).toContain("'nonce-synthetic-nonce'");
    expect(policy).not.toContain('unsafe-inline');
    expect(policy).not.toContain('unsafe-eval');
    expect(policy).toContain("object-src 'none'");
  });
  for (const path of [
    'workspace',
    'export',
    'profile',
    'profile/imports',
    'profile/imports/00000000-0000-4000-8000-000000000001',
    'jobs',
    'versions',
    'applications/00000000-0000-4000-8000-000000000001',
    'artifacts/00000000-0000-4000-8000-000000000001',
  ])
    it(`requires authentication for ${path}`, async () => {
      const result = await GET(new Request(`http://localhost/api/${path}`), {
        params: Promise.resolve({ path: path.split('/') }),
      });
      expect(result.status).toBe(401);
      expect(result.headers.get('cache-control')).toBe('no-store');
    });
  it('rejects unauthenticated device claims', async () => {
    const r = await POST(new Request('http://localhost/api/device/claim', { method: 'POST' }), {
      params: Promise.resolve({ path: ['device', 'claim'] }),
    });
    expect(r.status).toBe(401);
  });
  it('validates anonymous pairing request input before creating credentials', async () => {
    const r = await POST(
      new Request('http://localhost/api/pairing/start', {
        method: 'POST',
        body: JSON.stringify({ name: 'computer', tokenHash: 'plaintext-token' }),
      }),
      { params: Promise.resolve({ path: ['pairing', 'start'] }) },
    );
    expect(r.status).toBe(400);
  });
});
describe('companion process boundary', () => {
  it('does not inherit API keys, server keys, device secrets or parent agent tokens', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic';
    process.env.CODEX_API_KEY = 'synthetic';
    process.env.RESUMEFORGE_TOKEN = 'synthetic';
    process.env.OPENAI_API_KEY = 'synthetic';
    const env = localEnvironment();
    for (const key of [
      'SUPABASE_SERVICE_ROLE_KEY',
      'CODEX_API_KEY',
      'RESUMEFORGE_TOKEN',
      'OPENAI_API_KEY',
    ]) {
      expect(env).not.toHaveProperty(key);
      delete process.env[key];
    }
  });
  it('times out and cleans up a child process', async () => {
    await expect(
      execFile(process.execPath, ['-e', 'setTimeout(()=>{},10000)'], { timeout: 50 }),
    ).rejects.toThrow('TIMEOUT');
  });
  it('uses actionable failure codes without exposing model output', () => {
    expect(classifyError('429 quota exceeded')).toBe('USAGE_LIMIT');
    expect(classifyError('401 unauthorized')).toBe('AUTH_REQUIRED');
    expect(classifyError('model access unavailable')).toBe('MODEL_ACCESS');
  });
});
