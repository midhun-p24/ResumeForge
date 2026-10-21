# Writer provider contract

Resume writing goes through a `WriterSession` (`apps/companion/src/providers.ts`): a multi-turn
conversation whose `send(text)` returns parsed JSON for the version 2 document schema
(`generationDocSchema` in `packages/contracts`). Two providers implement it, both inside the
user's own local companion:

- **Codex** (`codexSession`): a restricted Codex thread (`restrictedThread` in `adapter.ts`) with
  shell, web search, plugins, apps, MCP, hooks, browser/computer tools, image access, memories and
  multi-agent work disabled, read-only sandboxing, and no inherited environment. Any tool event
  aborts the task. An optional `codexModel` setting overrides the user's Codex default model.
- **Claude** (`claudeSession`): the official Anthropic TypeScript SDK with the user's own API key
  (OS vault entry `ResumeForge / anthropic-api-key`, or `ANTHROPIC_API_KEY`). No tools are
  offered. Requests stream to completion with `claude-opus-5-5` by default, adaptive thinking,
  `effort: "high"`, structured JSON output, automatic prompt caching across turns, and
  `fallbacks: "default"` for refusals. JSON Schema keywords the structured-output feature does
  not accept (length and item-count limits) are stripped and re-checked with Zod afterwards.
  SDK errors map to the existing failure codes (`AUTH_REQUIRED`, `USAGE_LIMIT`, `MODEL_ACCESS`,
  `TIMEOUT`, `CANCELLED`, `MODEL_REFUSED`).

The writer loop (`apps/companion/src/writer.ts`) owns the prompt and the iteration: draft from the
posting and raw sources, validate (schema, structure, sourced numbers), compile with Tectonic,
measure, and send concrete layout feedback. At most five model calls per task; the best one-page
result wins. Profile text import still uses Codex only (`CodexAdapter.extract`).

The model never returns LaTeX. The renderer escapes every field and turns `**bold**` spans into
`\textbf{}` inside the owner's supplied Jake template, whose preamble and MIT attribution are
preserved. See [canonical template](canonical-template.md).

On SDK or CLI upgrades rerun `npm run smoke:writer` for each provider, including the Codex tool
restrictions. The root `mcp_servers={}` TOML override replaces inherited MCP transports; adding
disabled entries after clearing the table creates invalid transport-less entries.

References: [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk),
[Codex configuration](https://learn.chatgpt.com/docs/config-file/config-reference),
[Claude structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs).
