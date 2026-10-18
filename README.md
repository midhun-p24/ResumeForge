# ResumeForge

A private resume tailoring workspace powered by locally authenticated Codex. The website
stores approved evidence, jobs, immutable versions, and application records. An outbound-only
companion runs Codex and compiles LaTeX on your computer. You find and apply to jobs manually.

**Status:** The application builds and runs locally. Synthetic PostgreSQL security tests and
a live Codex-to-one-page-PDF check pass. Hosted sign-in, pairing, and private persistence still
require the existing Supabase GitHub integration to apply the pending migrations. A Vercel
preview is deployed and its public shell is verified; the authenticated hosted workflow is pending.

## Start locally

Requirements: Node.js 22.14+, npm, a Supabase project, local Codex with ChatGPT sign-in,
and Tectonic 0.17+. No separately billed OpenAI API key is used.

```powershell
npm ci
Copy-Item .env.example apps/web/.env.local
# Configure Supabase values in that ignored file and apply the migration.
npm run dev
```

Open `http://localhost:3000`. Without Supabase configuration the app shows a setup state;
private saving and generation are unavailable. Configure email sign-in using the deployment
guide, sign in, add your own facts, and approve records. No personal background is preloaded.

In another terminal:

```powershell
codex login
npm run companion -- doctor
npm run companion -- warmup
npm run companion -- pair --url http://localhost:3000
# Approve the displayed code in Agent & Settings; wait for pairing success.
npm run companion -- run
```

Use `npm.cmd` if PowerShell blocks `npm.ps1`. Set `RESUMEFORGE_TECTONIC_PATH` or
`RESUMEFORGE_CODEX_PATH` locally for an alternate executable. Keep the companion running.

## Implemented behavior

- Supabase email-link sign-in and optional OTP, owner-checked APIs, RLS, private Storage, and short-lived downloads.
- Comprehensive master profile, explicit fact approval, verified metrics, preferences, and private pasted reference text.
- Immutable job/profile snapshots, explained evidence fit, gaps, unknowns, and separate eligibility review.
- Expiring single-use pairing, OS-vault credentials, hashes, revocation, atomic claiming, leases, retries, cancellation, and heartbeats.
- Genuine Codex SDK adapter, complete snapshots, structured output, two-sided validation, and one bounded repair attempt.
- Controlled LaTeX, local Tectonic, bounded shortening, PDF page/text/overflow checks, preview and PDF/TeX/JSON downloads.
- Bullet editing, locks, include/exclude controls, revisions, immutable versions, comparison and restore-as-new-version.
- Manual application stages, notes, dates, exact resume tracking, account export and confirmed deletion.

## Verify

```powershell
npm run check
npx playwright install chromium
npm run test:ui
# Optional: real local Codex usage, synthetic inputs only.
npm run smoke:codex -- --pdf
```

CI uses synthetic fixtures and no live AI credentials. PostgreSQL tests execute the actual
migration and functions in PGlite with small auth/storage stubs; this is distinct from a
hosted Supabase check. The web app building, running locally, and being verified as a hosted
application are separate milestones.

## Repository and data

Reuse [this existing repository](https://github.com/midhun-p24/ResumeForge). Keep all real
profiles, credentials, resumes, databases, and applications outside Git. `private/`,
`.resumeforge/`, `.env*`, `.vercel/`, PDFs, DOCX, TeX, and common profile filenames are ignored.
`.env.example` contains placeholders. Never replace test fixtures with real personal facts.
Review staged files: ignore rules cannot detect personal text pasted into arbitrary code files.

Read the [architecture](docs/architecture.md), [companion guide](docs/companion.md),
[adapter contract](docs/agent-adapters.md), [local runbook](docs/local-runbook.md),
[deployment guide](docs/deployment.md), [verification record](docs/verification.md),
and [limitations](docs/limitations.md).
