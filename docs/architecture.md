# ResumeForge architecture

```text
Browser --rate-limited email request--> Next.js --> Supabase Auth
Browser --user bearer token--> Next.js /api/* --service role--> Postgres + private Storage
Local companion --device token, outbound HTTPS--> Next.js /api/device/*
Local companion --> locally authenticated Codex --> validated structured output
Local companion --> controlled LaTeX --> Tectonic --> PDF checks --> private upload
```

The browser uses only the publishable key for auth. Server endpoints validate tokens using
`auth.getUser` and apply explicit owner predicates to every record operation. The service
key stays on the server. Tables have owner-scoped RLS; browser writes and privileged RPCs
are denied. Browser roles cannot select device hashes, pairing secrets, or leases. Storage
has a private bucket and no direct browser grants. Owner-checked API routes issue artifact
URLs valid for 60 seconds.

Production is public at resume-forge.midoon.dev, with private accounts and protected development
previews. Each user installs the public companion runtime and uses their own local Codex sign-in.
No shared owner worker exists. Public quotas and pairing bounds are transactional; see deployment.md.
Account switches clear client state, and late responses for a previous identity cannot repopulate it.
Production HTML uses per-response CSP nonces without inline-script/eval exceptions.

`packages/contracts` defines protocol version 1 with Zod. Tasks contain the complete immutable
profile/posting snapshots, preferences, instructions, locks, exclusions, and prior output.
No ChatGPT memories or conversation history are assumed. Only `tailor`, `revise`, `render`,
and capability-gated `import_profile` operations are accepted. Import tasks have no job/version
and produce private review proposals rather than resumes. See [text import](profile-import.md).
Tasks cannot supply shell commands, executable paths, or filesystem paths.

## Persistence and transactions

Saving a profile replaces its source rows in the same transaction under a user advisory lock.
Jobs are immutable through the app. Tasks retain separate profile/job snapshots and complete
validated input. Versions keep their original profile, so later profile changes cannot rewrite history.

`rf_claim` locks an active device and uses `FOR UPDATE SKIP LOCKED` to claim queued or expired
work. Devices can own only one active lease. Each claim receives a random 90-second lease token;
heartbeats renew every 20 seconds. Three claims are allowed before lease exhaustion fails the
task. Revocation blocks claims, renewals, and completion. Cancellation fences out stale results.

Completion validates output/evidence and parses the PDF server-side to check page count. Uploads
use user/task/random-request prefixes. A transaction rechecks lease/revocation, inserts an immutable
version and artifact metadata, and updates the task. Duplicate completion returns the existing
version. Unique prefixes prevent retries from deleting another request's files. SQL and Storage
are not one transaction, so crash-orphaned files still need maintenance.

Triggers reject version/snapshot updates. Edits and restores create a new version with a parent
pointer. An edited version has no inherited PDF and must be rendered again. Applications retain
the exact manually selected resume. Generation never marks Applied or submits an application.

## Evidence and fit

Approved, non-excluded IDs are required for entries/bullets and supported requirement assessments.
Numeric bullet tokens must occur in explicitly cited approved metric values belonging to a cited
source. Locked sections compare structurally; locked bullets also preserve placement/source.
Render-only operations preserve the saved output exactly.

Fit is a reproducible evidence heuristic: required skills 45%, responsibilities 30%, domain 15%,
preferred qualifications 10%. Strong evidence earns 1, partial 0.5, missing/unknown 0. Absent
categories are reweighted; no requirements means no score. Eligibility is separate. These
checks aid human review; they do not prove truth or predict hiring outcomes.

## Trust boundaries

Postings, notes, reference text, and revision requests are untrusted data in an explicit input
envelope. Codex invocations disable shell execution, web search, plugins, apps, MCP, hooks,
browser/computer tools, image access, and multi-agent work, use read-only sandboxing, and inherit
no API/server keys. Unexpected tool events abort processing. Managed settings and future CLI
changes require upgrade testing. The optional Claude writer calls the Anthropic Messages API from
the companion with the user's own key (OS vault or `ANTHROPIC_API_KEY`), offers no tools, and
uses structured JSON output; the key never reaches ResumeForge, Tectonic, or Codex. Version 2
documents are accepted only when every number appears in the user's sources or the posting. The local companion/OS is trusted: a compromised device can
access its user's snapshots and submit results. Structural provenance is not cryptographic
proof of a model's honesty.
