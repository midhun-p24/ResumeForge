# Agent adapter contract

`AgentAdapter` in `apps/companion/src/adapter.ts` exposes availability and
`run(input, workspace, signal, onStage)`. Codex is the only implemented/advertised provider.
Future adapters must enforce the same validation and trust boundaries.

The official TypeScript SDK supports structured schemas, streamed events, abort signals, and
local CLI sign-in. Complete snapshots and explicit prior output satisfy revisions without
app-server's additional client/auth/conversation lifecycle. References checked:

- [Official SDK](https://learn.chatgpt.com/docs/codex-sdk)
- [Non-interactive sign-in](https://learn.chatgpt.com/docs/non-interactive-mode)
- [App server](https://learn.chatgpt.com/docs/app-server)
- [Configuration](https://learn.chatgpt.com/docs/config-file/config-reference)

Protocol v1 supports tailoring, revision, and rendering. Input includes profile/job snapshots,
preferences, instructions, exclusions, prior output, and locks. Output contains requirements,
evidence, gaps, eligibility, selected sources, resume sections/bullets, metrics, and warnings.
The companion produces rendering/artifact status, not the model.

The agent never returns executable LaTeX. The original compatible default in `packages/resume`
uses a conventional single-column layout inspired by Jake's Resume; it does not contain the
upstream source or claim to be the user's exact approved template. Replacements require
source/license review, attribution, escaping, and fresh layout checks.

One repair turn is allowed. One separate shortening pass is allowed for overflow, preserving
locks. A failed shortening retains the original draft. Font stays 11 pt with 0.6 in margins.

On SDK/CLI upgrades rerun live synthetic checks, including tool restrictions. The root
`mcp_servers={}` TOML override replaces inherited MCP transports. Adding disabled entries
after clearing the table creates invalid transport-less entries; live testing caught this
configuration issue during implementation.
