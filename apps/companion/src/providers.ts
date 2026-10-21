import Anthropic from '@anthropic-ai/sdk';
import { AsyncEntry } from '@napi-rs/keyring';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { AgentFailure, codexStatus, codexTurn, restrictedThread } from './adapter';

/** A multi-turn conversation that returns parsed JSON for each user turn. */
export interface WriterSession {
  send(text: string): Promise<unknown>;
}
export type ProviderId = 'codex' | 'claude';
export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5-5';

const settingsSchema = z.object({
  provider: z.enum(['codex', 'claude']).default('codex'),
  claudeModel: z.string().min(1).max(100).default(DEFAULT_CLAUDE_MODEL),
  codexModel: z.string().max(100).default(''),
});
export type Settings = z.infer<typeof settingsSchema>;
const settingsPath = () =>
  join(process.env.RESUMEFORGE_HOME || join(homedir(), '.resumeforge'), 'config.json');
export async function loadSettings(): Promise<Settings> {
  try {
    return settingsSchema.parse(JSON.parse(await readFile(settingsPath(), 'utf8')));
  } catch {
    return settingsSchema.parse({});
  }
}
export async function saveSettings(settings: Settings) {
  await mkdir(join(settingsPath(), '..'), { recursive: true, mode: 0o700 });
  await writeFile(settingsPath(), JSON.stringify(settings, null, 2), { mode: 0o600 });
}

// The Anthropic key lives only in the OS vault (or the user's own environment variable).
const claudeKeyEntry = () => new AsyncEntry('ResumeForge', 'anthropic-api-key');
export async function claudeKey(): Promise<string | null> {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try {
    return (await claudeKeyEntry().getPassword()) ?? null;
  } catch {
    return null;
  }
}
export async function saveClaudeKey(key: string) {
  await claudeKeyEntry().setPassword(key);
}
export async function deleteClaudeKey() {
  try {
    await claudeKeyEntry().deleteCredential();
  } catch {
    /* nothing stored */
  }
}

/** Structured-output schemas accept a subset of JSON Schema; length limits are re-checked by Zod. */
export function portableSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(portableSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const unsupported = [
    '$schema',
    'minLength',
    'maxLength',
    'minItems',
    'maxItems',
    'pattern',
    'format',
  ];
  return Object.fromEntries(
    Object.entries(schema)
      .filter(([key]) => !unsupported.includes(key))
      .map(([key, value]) => [key, portableSchema(value)]),
  );
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new AgentFailure('INVALID_OUTPUT', null, undefined, ['output: invalid_json']);
  }
}

export function codexSession(
  workspace: string,
  system: string,
  schema: unknown,
  signal: AbortSignal,
  model?: string,
): WriterSession {
  const thread = restrictedThread(workspace, system, model || undefined);
  return { send: async (text) => parseJson(await codexTurn(thread, text, schema, signal)) };
}

export function claudeErrorCode(error: unknown): string {
  if (error instanceof Anthropic.APIUserAbortError) return 'CANCELLED';
  if (error instanceof Anthropic.AuthenticationError) return 'AUTH_REQUIRED';
  if (error instanceof Anthropic.PermissionDeniedError) return 'MODEL_ACCESS';
  if (error instanceof Anthropic.NotFoundError) return 'MODEL_ACCESS';
  if (error instanceof Anthropic.RateLimitError) return 'USAGE_LIMIT';
  if (error instanceof Anthropic.APIConnectionTimeoutError) return 'TIMEOUT';
  if (error instanceof Anthropic.BadRequestError)
    return /credit|billing|balance/i.test(error.message) ? 'USAGE_LIMIT' : 'AGENT_FAILED';
  return 'AGENT_FAILED';
}

/** Claude through the user's own API key. No tools are offered, so the model can only write. */
export function claudeSession(
  key: string,
  model: string,
  system: string,
  schema: unknown,
  signal: AbortSignal,
): WriterSession {
  const client = new Anthropic({ apiKey: key });
  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  return {
    async send(text) {
      messages.push({ role: 'user', content: text });
      let message: Anthropic.Beta.BetaMessage;
      try {
        message = await client.beta.messages
          .stream(
            {
              model,
              max_tokens: 64000,
              betas: ['server-side-fallback-2026-07-01'],
              fallbacks: 'default',
              thinking: { type: 'adaptive' },
              output_config: {
                effort: 'high',
                format: { type: 'json_schema', schema: schema as Record<string, unknown> },
              },
              // Sources sit in the first turn; caching the growing prefix keeps revisions cheap.
              cache_control: { type: 'ephemeral' },
              system,
              messages,
            },
            { signal },
          )
          .finalMessage();
      } catch (error) {
        if (signal.aborted) throw new AgentFailure('CANCELLED');
        const detail = error instanceof Error ? error.message.slice(0, 300) : '';
        throw new AgentFailure(claudeErrorCode(error), null, { cause: error }, [detail]);
      }
      messages.push({ role: 'assistant', content: message.content });
      if (message.stop_reason === 'refusal') throw new AgentFailure('MODEL_REFUSED');
      if (message.stop_reason === 'max_tokens')
        throw new AgentFailure('INVALID_OUTPUT', null, undefined, ['output: max_tokens']);
      return parseJson(
        message.content
          .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
          .map((block) => block.text)
          .join(''),
      );
    },
  };
}

export async function providerStatus(settings: Settings): Promise<string> {
  if (settings.provider === 'claude')
    return (await claudeKey())
      ? `Claude API key stored (${settings.claudeModel})`
      : 'Claude API key missing';
  const status = await codexStatus();
  return `Codex ${status}${settings.codexModel ? ` (${settings.codexModel})` : ''}`;
}

/** Open a writer conversation with the configured provider. */
export async function openSession(
  settings: Settings,
  workspace: string,
  system: string,
  schema: unknown,
  signal: AbortSignal,
): Promise<WriterSession> {
  if (settings.provider === 'claude') {
    const key = await claudeKey();
    if (!key)
      throw new AgentFailure('AUTH_REQUIRED', null, undefined, ['Run resumeforge login --claude']);
    return claudeSession(key, settings.claudeModel, system, portableSchema(schema), signal);
  }
  if ((await codexStatus()) !== 'authenticated') throw new AgentFailure('AUTH_REQUIRED');
  return codexSession(workspace, system, schema, signal, settings.codexModel);
}
