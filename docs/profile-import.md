# Master-resume text import

Paste a complete plain-text resume in **Master Profile → Pasted master resume**, then choose
**Parse master resume into records**. Each user must run their own signed-in companion 0.3.1
or newer. Older companions continue to tailor but cannot claim imports. No owner account,
hosted model key, or separately billed API fallback is used. Codex sends task content to its
model service; local execution does not mean offline inference.

The companion makes a fresh structured extraction request containing only the bounded raw
resume and extraction instructions. It does not inherit this development chat or send existing
profile history to parse the new text. One repair attempt is allowed if schema/source checks fail. Source line references are resolved by
the application instead of requiring the model to copy long excerpts exactly. Sentence punctuation
is excluded from numeric tokens. Repairs reuse the existing thread rather than resending the source.
If repair fails, only source-valid proposals may be retained, with explicit omission warnings;
unrecoverable failures expose field/check diagnostics without logging personal values.
It never compiles a PDF for an import and does not need Tectonic for that operation.

The review screen shows editable proposals, source excerpts, candidate metrics, and warnings.
Contact information is separate and unchecked by default: selecting it explicitly replaces
matching nonempty contact fields. Missing values remain blank. Proposed facts are not
independently verified, and source references do not guarantee factual correctness.

Save any current profile edits before adding imported drafts. The server atomically appends to
the latest saved profile, assigns record/metric IDs, and forces every new record to **draft**.
Existing approved records are retained. Duplicate kind/title/organization/date identities are
skipped; this is a conservative heuristic, not semantic deduplication. Matching roles or projects
with changed date formatting are also flagged as possible duplicates in the review screen and
left unselected by default. Distinct tenures can be selected deliberately. Reapplying an import
does not add records twice. Review and approve the drafts individually before tailoring.
The profile supports 150 records; a single extraction supports up to 100 proposals.

## Boundaries

- Plain text only, 40–60,000 characters. No PDF/DOCX upload or URL scraping.
- At most one active import per user, 3/hour and 10/day, including cancelled/failed attempts.
  Imports also count toward the existing shared 3-active, 20/hour, 50/day and account-storage caps.
- The existing private task queue provides atomic claims, 90-second leases, heartbeats,
  cancellation, bounded retry, and device revocation. Capability-aware claims keep old companions
  from receiving a new operation. One companion handles one task at a time.
- The backend revalidates schemas, literal excerpts and candidate metric numbers. It checks
  ownership for review, completion and application; privileged RPCs remain service-only.
- Source text and extraction output remain private task data, included in account export and
  removed on account deletion. They are never committed or used as public demo data.
- This feature does not activate the pending Jake-template review. The production template
  remains unchanged until the owner approves that separate sample.

## Upgrade

Stop the old worker with Ctrl+C. Install the package from the public companion guide, then run
`resumeforge doctor` and `resumeforge run`. Existing device pairing is retained in the OS vault;
do not pair again merely to upgrade. Doctor should report version 0.3.0.

## Verification

Synthetic contract and real PostgreSQL tests cover source excerpts, numeric evidence, bounded
inputs, duplicate identity, draft enforcement, preservation of approved data, idempotence,
old/new claims, foreign ownership, cancellation, revocation, quotas, and RPC grants.

`npx tsx scripts/smoke-import.ts --extract-only` runs real Codex extraction with synthetic data.
`--worker --browser` runs the bundled companion and actual browser import flow against a
loopback server (default port 3205). It creates and deletes isolated synthetic accounts and a
test-origin vault entry; it refuses to overwrite an existing vault entry. For hosted API checks,
use `--fixture-output` with `RESUMEFORGE_TEST_URL` and keep that synthetic protocol test distinct
from genuine local Codex execution. No test emails or real personal profiles are used.

Fixture-output runs create an admin-owned synthetic device for their isolated test user instead
of consuming public pairing capacity repeatedly. They do not claim to retest pairing. The real
`--worker --browser` acceptance run uses actual single-use pairing and the OS vault.

Local acceptance passed on 2026-10-18: actual bundled companion polling, real Codex extraction,
heartbeats, source checks, browser review, draft-only insertion and device revocation. A separate
fixture-output browser run verified proposal editing survives polling and mobile layout has no
horizontal overflow. Existing tailoring, locked revisions, PDF/LaTeX/JSON downloads, editing,
compare/restore, tracking persistence, export and disconnect also passed against the hosted backend.

## Import validation reliability (0.3.1)

An `INVALID_OUTPUT` from 0.3.0 has no retained validation details, so its exact cause cannot be
reconstructed from the terminal code alone. Known brittle checks included literal excerpt copying
and numeric tokens that absorbed trailing punctuation (for example `0.771.`). Regression tests cover
both. New extraction uses numbered source lines; the application copies the original excerpt and
keeps backend literal-source validation. New diagnostic messages contain paths/checks, not field
values. Failed imports do not overwrite profiles, and no real records are reimported by the tests.

The repair stage is visible. If only part of a result can be recovered after repair, omissions are
explicit and all retained records still require review and approval. Schema-invalid or unparseable
results are never silently accepted. The large synthetic acceptance script is
`npx tsx scripts/smoke-import-large.ts` (35 distinct entries across all supported record categories).

Verification on 2026-10-18: the real 35-entry synthetic extraction returned all 35 proposals in
154 seconds with no partial-recovery omissions. This is one measured test, not a latency guarantee.
Browser/API acceptance also verified visible failure diagnostics, unchanged saved records after
failure, ownership checks, draft insertion and revocation. Sixty automated tests passed. No real
master resume or manually entered user records were modified for this verification.
