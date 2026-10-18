import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';

/** Use the official authenticated Vercel CLI for protected-preview tests.
 * Request credentials travel through stdin, never shell interpolation or argv. */
export async function testRequest(
  origin: string,
  route: string,
  method: string,
  body: unknown,
  token?: string,
) {
  if (process.env.RESUMEFORGE_TEST_VERCEL !== '1') {
    const response = await fetch(`${origin}/api/${route}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(40000),
    });
    return { status: response.status, data: await response.json() };
  }
  const deployment = new URL(origin);
  if (
    deployment.protocol !== 'https:' ||
    !deployment.hostname.endsWith('.vercel.app') ||
    deployment.username ||
    deployment.password ||
    deployment.pathname !== '/' ||
    deployment.search ||
    deployment.hash ||
    !/^[a-zA-Z0-9/_-]+$/.test(route) ||
    !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
  )
    throw new Error('Invalid protected-preview test request');
  const flags = [
    'curl',
    `/api/${route}`,
    '--deployment',
    deployment.hostname,
    '--scope',
    'midoon1',
    '--',
    '--silent',
    '--show-error',
    '--max-time',
    '60',
    '--include',
    '--config',
    '-',
  ];
  const windows = process.platform === 'win32';
  const executable = windows ? process.execPath : 'npx';
  const npmCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const args = windows
    ? [npmCli, 'exec', '--yes', '--package', 'vercel@latest', '--', 'vercel', ...flags]
    : ['--yes', 'vercel@latest', ...flags];
  const config = [
    `request = ${JSON.stringify(method)}`,
    `header = "Content-Type: application/json"`,
    ...(token ? [`header = ${JSON.stringify(`Authorization: Bearer ${token}`)}`] : []),
    ...(body === undefined ? [] : [`data = ${JSON.stringify(JSON.stringify(body))}`]),
  ].join('\n');
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(executable, args, {
      windowsHide: true,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(stdout);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error('Protected preview request timed out'));
    }, 90000);
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      if (stdout.length > 4000000) {
        child.kill();
        finish(new Error('Preview response too large'));
      }
    });
    child.stderr.resume();
    child.on('error', () => finish(new Error('Vercel CLI unavailable')));
    child.on('close', (code) =>
      finish(code === 0 ? undefined : new Error('Vercel CLI request failed')),
    );
    child.stdin.on('error', () => {});
    child.stdin.end(config + '\n');
  });
  let remaining = output;
  while (remaining.startsWith('HTTP/')) {
    const headers = remaining.match(/^HTTP\/\S+ (\d{3})[^]*?\r?\n\r?\n/);
    if (!headers) throw new Error('Preview response headers invalid');
    remaining = remaining.slice(headers[0].length);
    if (remaining.startsWith('HTTP/')) continue;
    return { status: Number(headers[1]), data: JSON.parse(remaining) };
  }
  throw new Error('Preview response status missing');
}
