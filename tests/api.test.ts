import { describe, it, expect } from 'vitest';
import { GET, POST } from '../apps/web/app/api/[...path]/route';
import { localEnvironment, execFile } from '../apps/companion/src/process';
import { classifyError } from '../apps/companion/src/adapter';

describe('server authorization boundary', () => {
  for (const path of [
    'workspace',
    'export',
    'profile',
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
