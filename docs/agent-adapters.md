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

The agent never returns executable LaTeX. The default renderer inserts escaped structured
content into the owner's supplied Jake template. Its complete original preamble and MIT attribution are preserved. Controlled compact spacing
and a smaller name are applied after that preamble; body type and page margins stay fixed.
The companion writes `Resume.tex` and compiles `Resume.pdf` locally. See
[canonical template](canonical-template.md).

One validation repair turn is allowed per generation call. At most two additional fitting
turns expand sparse pages or shorten overflow, preserving locks and source exclusions.
The fitter adds one ranked experience and one project per step. Every unlocked included
experience/project must have exactly three distinct supported bullets. It tries all ranked pairs until overflow,
then shortens wording before removing whole lower-priority records. Three of each is the target,
with explicit warnings when evidence or page constraints prevent it. The fullest valid one-page
candidate is retained; font size and margins are never reduced.

On SDK/CLI upgrades rerun live synthetic checks, including tool restrictions. The root
`mcp_servers={}` TOML override replaces inherited MCP transports. Adding disabled entries
after clearing the table creates invalid transport-less entries; live testing caught this
configuration issue during implementation.
