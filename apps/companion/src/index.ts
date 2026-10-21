import { AsyncEntry } from '@napi-rs/keyring';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { homedir, hostname } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import {
  idSchema,
  companionTaskSchema,
  COMPANION_VERSION,
  DOC_V2_CAPABILITY,
  progressStages,
  versionOutputSchema,
} from '@resumeforge/contracts';
import type { Profile, ResumeDoc, VersionOutput } from '@resumeforge/contracts';
import { AgentFailure, CodexAdapter, codexCommand } from './adapter';
import { compileResume, tectonicPath } from './render';
import { execFile, localEnvironment } from './process';
import {
  claudeKey,
  DEFAULT_CLAUDE_MODEL,
  loadSettings,
  openSession,
  providerStatus,
  saveClaudeKey,
  saveSettings,
} from './providers';
import { writeResume, WRITER_RULES, writerSchema } from './writer';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2),
  command = args[0] ?? 'help';
const urlArg = args.indexOf('--url');
const server = new URL(
  urlArg >= 0 ? args[urlArg + 1] : process.env.RESUMEFORGE_URL || 'https://resume-forge.midoon.dev',
);
if (
  server.username ||
  server.password ||
  server.pathname !== '/' ||
  server.search ||
  server.hash ||
  !(
    server.protocol === 'https:' ||
    (server.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(server.hostname))
  )
)
  throw new Error('Use an HTTPS app origin, or loopback HTTP for local development.');
const origin = server.origin;
const entry = new AsyncEntry('ResumeForge', origin);
const credentialSchema = z.object({ origin: z.string(), token: z.string(), deviceId: idSchema });
type Credential = z.infer<typeof credentialSchema>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const adapter = new CodexAdapter();
const CAPABILITIES = ['profile_import_v1', DOC_V2_CAPABILITY];
let shutdown = false;
let current: AbortController | null = null;
process.on('SIGINT', () => {
  shutdown = true;
  current?.abort();
});
process.on('SIGTERM', () => {
  shutdown = true;
  current?.abort();
});
class RequestFailure extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
  }
}
async function request<T>(route: string, data: unknown, token?: string): Promise<T> {
  const response = await fetch(`${origin}/api/${route}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(process.env.RESUMEFORGE_VERCEL_BYPASS
        ? { 'x-vercel-protection-bypass': process.env.RESUMEFORGE_VERCEL_BYPASS }
        : {}),
    },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(30000),
    redirect: 'error',
  });
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new RequestFailure(
      response.status === 401 || response.status === 403
        ? 'HOST_PROTECTED'
        : 'INVALID_SERVER_RESPONSE',
      response.status,
    );
  const json = await response.json();
  if (!response.ok) throw new RequestFailure(json.code ?? 'SERVER_ERROR', response.status);
  return json as T;
}
async function credentials(): Promise<Credential> {
  const saved = await entry.getPassword();
  if (!saved) throw new Error(`No companion pairing for ${origin}. Run the pair command.`);
  return credentialSchema.parse(JSON.parse(saved));
}
async function pair() {
  const existing = await entry.getPassword();
  if (existing && credentialSchema.safeParse(JSON.parse(existing)).success)
    throw new AgentFailure('ALREADY_PAIRED');
  // Keep the proposed token in the OS vault before network access; never print or write it to disk.
  const token = `rf_${randomBytes(32).toString('base64url')}`;
  await entry.setPassword(JSON.stringify({ origin, token, deviceId: null, pending: true }));
  const p = await request<{ id: string; code: string; pollSecret: string; expiresAt: string }>(
    'pairing/start',
    { name: hostname().slice(0, 80), tokenHash: createHash('sha256').update(token).digest('hex') },
  );
  console.log(
    `ResumeForge pairing\nOpen ${origin}, sign in, and enter this code in Agent & Settings:\n\n  ${p.code}\n\nExpires ${p.expiresAt}. Only approve your own companion.`,
  );
  while (!shutdown && Date.now() < Date.parse(p.expiresAt)) {
    const result = await request<{ status: string; deviceId?: string }>('pairing/poll', {
      id: p.id,
      pollSecret: p.pollSecret,
    });
    if (result.status === 'approved') {
      await entry.setPassword(JSON.stringify({ origin, token, deviceId: result.deviceId }));
      console.log(`Paired to ${origin}. Start with: resumeforge run --url ${origin}`);
      return;
    }
    await sleep(4000);
  }
  throw new Error('Pairing expired or cancelled. Start pairing again.');
}
async function run() {
  const c = await credentials();
  console.log(
    `ResumeForge companion connected to ${origin}. Ctrl+C stops after cancelling local work.`,
  );
  const settings = await loadSettings();
  console.log(`Writer: ${await providerStatus(settings)}.`);
  while (!shutdown) {
    try {
      const codexStatus = await adapter.status();
      // Claude writes resumes with the user's own key; profile import still uses Codex.
      const agentStatus =
        settings.provider === 'claude'
          ? (await claudeKey())
            ? 'authenticated'
            : 'sign_in_required'
          : codexStatus;
      await request(
        'device/heartbeat',
        {
          taskId: null,
          leaseToken: null,
          stage: 'Analyzing requirements',
          agentStatus,
          companionVersion: COMPANION_VERSION,
          capabilities: CAPABILITIES,
        },
        c.token,
      );
      if (agentStatus !== 'authenticated') {
        console.log(
          settings.provider === 'claude'
            ? 'Claude API key missing. Run resumeforge login --claude.'
            : 'Codex sign-in required. Run resumeforge login, or switch with resumeforge provider claude.',
        );
        await sleep(20000);
        continue;
      }
      const { task } = await request<{
        task: { id: string; input: unknown; leaseToken: string } | null;
      }>('device/claim', { profileImport: codexStatus === 'authenticated', docV2: true }, c.token);
      if (task) await processTask(c, task);
      else await sleep(5000);
    } catch (e) {
      if (e instanceof RequestFailure && e.code === 'HOST_PROTECTED') throw e;
      if (e instanceof RequestFailure && e.status === 401)
        throw new Error('Device revoked. Pair again to reconnect.');
      console.log(
        `Connection retry: ${e instanceof RequestFailure ? e.code : 'network unavailable'}. No private task data is logged.`,
      );
      await sleep(10000);
    }
  }
}
async function processTask(
  c: Credential,
  task: { id: string; input: unknown; leaseToken: string },
) {
  const input = companionTaskSchema.parse(task.input);
  idSchema.parse(task.leaseToken);
  if (task.id !== input.taskId) throw new Error('Task ID mismatch');
  const root = join(homedir(), '.resumeforge', 'tasks');
  await mkdir(root, { recursive: true, mode: 0o700 });
  const workspace = await mkdtemp(join(root, 'task-'));
  current = new AbortController();
  let stage: (typeof progressStages)[number] =
    input.operation === 'import_profile' ? 'Parsing master resume' : 'Analyzing requirements';
  let output: VersionOutput | null = null;
  let pending = false;
  const deadline = setTimeout(() => current?.abort(), 10 * 60 * 1000);
  const beat = async () => {
    if (pending) return;
    pending = true;
    try {
      const r = await request<{ active: boolean }>(
        'device/heartbeat',
        {
          taskId: task.id,
          leaseToken: task.leaseToken,
          stage,
          agentStatus: 'authenticated',
          companionVersion: COMPANION_VERSION,
          capabilities: CAPABILITIES,
        },
        c.token,
      );
      if (!r.active) current?.abort();
    } catch {
      current?.abort();
    } finally {
      pending = false;
    }
  };
  const timer = setInterval(() => void beat(), 20000);
  const onStage = async (next: typeof stage) => {
    stage = next;
    console.log(`Task ${task.id.slice(0, 8)}: ${stage}`);
    await beat();
    current!.signal.throwIfAborted();
  };
  try {
    await writeFile(join(workspace, 'input.json'), JSON.stringify(input), { mode: 0o600 });
    if (input.operation === 'import_profile') {
      await onStage('Parsing master resume');
      const extracted = await adapter.extract(input, workspace, current.signal, onStage);
      await onStage('Reviewing extracted records');
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await request(
            `device/tasks/${task.id}/import-complete`,
            { leaseToken: task.leaseToken, output: extracted },
            c.token,
          );
          break;
        } catch (error) {
          if (attempt === 2 || (error instanceof RequestFailure && error.status < 500)) throw error;
          await sleep(1500 * (attempt + 1));
        }
      }
      console.log(
        `Task ${task.id.slice(0, 8)} complete: proposed records ready for private review.`,
      );
      return;
    }
    const signal = current.signal;
    const compile = (candidate: VersionOutput) =>
      compileResume(input.profile, candidate, workspace, signal, onStage);
    let rendered: Awaited<ReturnType<typeof compile>>;
    if (input.operation === 'render') {
      // Manual renders compile the saved content exactly as it is.
      output = versionOutputSchema.parse(input.priorOutput);
      rendered = await compile(output);
    } else if (input.format === 'doc_v2') {
      const settings = await loadSettings();
      const session = await openSession(settings, workspace, WRITER_RULES, writerSchema, signal);
      const written = await writeResume(input, session, compile, onStage);
      output = written.doc;
      rendered = written.compiled;
    } else {
      // Record-based tailoring was replaced by the source-based writer in 0.5.0.
      throw new AgentFailure('UNSUPPORTED_TASK');
    }
    await onStage('Checking layout');
    const payload = {
      leaseToken: task.leaseToken,
      output,
      render: rendered.render,
      pdf: rendered.pdf.toString('base64'),
    };
    // Retry the same completion with the same lease; server is idempotent.
    let completed = false;
    for (let i = 0; i < 3 && !completed; i++) {
      try {
        await request(`device/tasks/${task.id}/complete`, payload, c.token);
        completed = true;
      } catch (e) {
        if (e instanceof RequestFailure && e.status < 500) throw e;
        if (i === 2) throw e;
        await sleep(1500 * (i + 1));
      }
    }
    console.log(
      `Task ${task.id.slice(0, 8)} complete: ${rendered.render.status}, ${rendered.render.pageCount} page(s).`,
    );
  } catch (e) {
    const code =
      e instanceof AgentFailure
        ? e.code
        : current.signal.aborted
          ? shutdown
            ? 'CANCELLED'
            : 'TIMEOUT'
          : 'AGENT_FAILED';
    output = e instanceof AgentFailure ? (e.draft ?? output) : output;
    try {
      await request(
        `device/tasks/${task.id}/fail`,
        {
          leaseToken: task.leaseToken,
          code,
          draft: output,
          details: e instanceof AgentFailure && e.diagnostics.length ? e.diagnostics : undefined,
        },
        c.token,
      );
    } catch {
      /* cancellation/revocation must not re-authorize writes */
    }
    console.log(`Task ${task.id.slice(0, 8)} stopped: ${code}.`);
    if (e instanceof AgentFailure)
      for (const detail of e.diagnostics) console.log(`Detail: ${detail}`);
    if (code === 'MODEL_ACCESS')
      console.log(
        'The configured model is not available to this account. For Codex, set codexModel with resumeforge provider codex --model <name> or edit ~/.codex/config.toml.',
      );
  } finally {
    clearInterval(timer);
    clearTimeout(deadline);
    current = null;
    await rm(workspace, { recursive: true, force: true });
  }
}
async function doctor() {
  const settings = await loadSettings();
  console.log(
    `ResumeForge companion ${COMPANION_VERSION} diagnostics\nServer: ${origin}\nWriter: ${settings.provider} (${await providerStatus(settings)})\nCodex (profile import): ${await adapter.status()}`,
  );
  try {
    const r = await execFile(tectonicPath(), ['--version']);
    console.log(`Tectonic: ${r.code === 0 ? r.stdout.trim() : 'unavailable'}`);
  } catch {
    console.log('Tectonic: missing. Install Tectonic and run warmup once.');
  }
  try {
    const saved = await entry.getPassword();
    const paired = saved && credentialSchema.safeParse(JSON.parse(saved)).success;
    console.log(paired ? 'OS vault: available (paired)' : 'OS vault: available (not paired)');
  } catch {
    console.log(
      'OS vault: no saved entry, or unavailable. Pairing requires Windows Credential Manager, macOS Keychain, or Linux Secret Service.',
    );
  }
}
async function warmup() {
  const root = join(homedir(), '.resumeforge', 'tasks');
  await mkdir(root, { recursive: true, mode: 0o700 });
  const dir = await mkdtemp(join(root, 'warmup-'));
  try {
    const profile: Profile = {
      contact: {
        name: 'Synthetic compiler check',
        email: 'test@example.invalid',
        phone: '',
        location: '',
        links: [],
      },
      records: [],
      masterText: '',
      portfolioText: '',
      referenceResume: '',
      preferences: { roles: [], includeGpa: false, instructions: '' },
    };
    const output: ResumeDoc = {
      schemaVersion: 2,
      sections: [
        {
          title: 'Projects',
          kind: 'entries',
          entries: [
            {
              heading: 'Compiler check',
              subheading: '',
              date: '2026',
              location: '',
              stack: 'LaTeX',
              bullets: ['Warmed the **fixed** template packages and fonts.'],
            },
          ],
          skills: [],
        },
      ],
      coverLetter: '',
      keywords: [],
      gaps: [],
      notes: [],
    };
    await compileResume(
      profile,
      output,
      dir,
      new AbortController().signal,
      async (s) => {
        console.log(s);
      },
      true,
    );
    console.log('Compiler cache warmed. Normal tasks disable network package downloads.');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
/** Read a secret from the terminal without echoing it. */
async function readSecret(prompt: string): Promise<string> {
  process.stdout.write(prompt);
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    let data = '';
    for await (const chunk of stdin) data += chunk;
    return data.trim();
  }
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          return resolve(value.trim());
        }
        if (char === '\u0003') {
          stdin.setRawMode(false);
          return reject(new Error('Cancelled'));
        }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else value += char;
      }
    };
    stdin.on('data', onData);
  });
}
async function providerCommand() {
  const settings = await loadSettings();
  const choice = args[1];
  const modelArg = args.indexOf('--model');
  const model = modelArg >= 0 ? args[modelArg + 1] : undefined;
  if (choice === 'claude' || choice === 'codex') {
    settings.provider = choice;
    if (model && choice === 'claude') settings.claudeModel = model;
    if (model !== undefined && choice === 'codex') settings.codexModel = model;
    await saveSettings(settings);
  } else if (choice) throw new Error('Use resumeforge provider claude|codex [--model name]');
  console.log(
    `Writer: ${settings.provider}. ${await providerStatus(settings)}.\nSwitch with: resumeforge provider claude | resumeforge provider codex (default Claude model ${DEFAULT_CLAUDE_MODEL}).`,
  );
}
try {
  if (command === 'login' && args.includes('--claude')) {
    const key = await readSecret('Paste your Anthropic API key (input hidden): ');
    if (!/^sk-ant-[\w-]{20,}$/.test(key))
      throw new Error('That does not look like an Anthropic API key.');
    await saveClaudeKey(key);
    const settings = await loadSettings();
    settings.provider = 'claude';
    await saveSettings(settings);
    console.log(
      `Saved to the OS credential vault; it is never sent to ResumeForge. Writer set to Claude (${settings.claudeModel}). Usage is billed to your Anthropic account.`,
    );
  } else if (command === 'provider') await providerCommand();
  else if (command === 'login') {
    const cli = codexCommand(['login']);
    const code = await new Promise<number>((resolve, reject) => {
      const child = spawn(cli.file, cli.args, {
        shell: false,
        windowsHide: true,
        stdio: 'inherit',
        env: localEnvironment(),
      });
      child.on('error', reject);
      child.on('exit', (status) => resolve(status ?? 1));
    });
    process.exitCode = code;
  } else if (command === 'pair') await pair();
  else if (command === 'run') await run();
  else if (command === 'doctor') await doctor();
  else if (command === 'warmup') await warmup();
  else if (command === 'disconnect') {
    const c = await credentials();
    try {
      await request('device/disconnect', {}, c.token);
    } catch (e) {
      // A remotely revoked token is already unusable; still remove it locally.
      if (!(e instanceof RequestFailure) || e.status !== 401) throw e;
    }
    await entry.deleteCredential();
    console.log('Companion revoked and local credential removed.');
  } else
    console.log(
      'ResumeForge companion\nCommands: login | login --claude | provider [claude|codex] [--model name] | doctor | warmup | pair | run | disconnect\nDefault: https://resume-forge.midoon.dev\nUse --url or RESUMEFORGE_URL for a different origin. Device secrets and API keys stay in the OS credential vault. Each user uses their own Codex sign-in or Anthropic API key.',
    );
} catch (e) {
  console.error(
    e instanceof RequestFailure
      ? `Server rejected operation: ${e.code}`
      : e instanceof AgentFailure
        ? e.code
        : 'Companion stopped. Run doctor; check sign-in, app URL, vault access, and compiler setup.',
  );
  process.exitCode = 1;
}
