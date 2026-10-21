# ResumeForge

A public resume-tailoring application with individual private accounts, powered by each
user's own locally authenticated Codex companion.

**Production:** https://resume-forge.midoon.dev

The GitHub repository remains private. Public website access does not grant repository access.
Profiles, jobs, resume versions, application records, devices, and files are isolated by account.
No public user's tasks run through the owner's computer or Codex account.

## Use the application

1. Register/sign in with your email link and build your approved master profile.
2. Follow the [public companion guide](https://resume-forge.midoon.dev/companion).
3. Paste a job description, start tailoring, review the evidence and PDF, and revise as needed.
4. Download PDF/LaTeX/JSON and manually track your application and the exact version used.

The companion is a public, allowlisted runtime download; private GitHub access is unnecessary:

```powershell
npm install --global https://resume-forge.midoon.dev/downloads/resumeforge-companion-0.5.6.tgz
resumeforge login
resumeforge doctor
resumeforge warmup
resumeforge pair
# Approve the code in Agent & Settings, then wait for Paired.
resumeforge run
```

Requires Node 22.14+, Tectonic 0.17+, an OS credential vault, and either a permitted Codex
ChatGPT sign-in or your own Anthropic API key (`resumeforge login --claude`; Claude Opus 5.5 by
default, billed to your Anthropic account). Switch with `resumeforge provider claude|codex`.
Keep the companion running. Local execution does not mean offline AI: task content is processed
by the AI service you choose. Paste your master resume (and optionally portfolio text and a
reference resume) in Master Profile; every resume is written only from those sources.

## Develop in the existing repository

```powershell
npm ci
# If absent, copy .env.example to apps/web/.env.local and configure the existing project.
npm run dev
npm run companion -- doctor
npm run companion -- pair --url http://localhost:3000
npm run companion -- run --url http://localhost:3000
```

Use npm.cmd/resumeforge.cmd if PowerShell blocks .ps1 launchers. Local email sign-in needs
RESUMEFORGE_REGISTRATION_ENABLED=true after auth is configured. Keep every real value ignored.
The existing Supabase GitHub integration is the sole migration runner; do not use a parallel
CLI/Actions db push. Production auth redirects and environment values are configured separately.

## Verification and privacy

`npm run check` runs lint, types, consequential contracts/API/PostgreSQL tests, the public
companion packaging step, and the production build. `npm run test:ui` checks desktop/mobile
forms and setup. `npm run privacy:check` checks source paths, credential patterns, known local
keys, and available browser bundles without logging values. CI uses synthetic fixtures only.

Live production checks include genuine Codex tailoring/revision, PDFs, pairing, private
artifacts, browser edits/restore/downloads, tracker persistence, device revocation, and user
isolation. A second synthetic identity exercises the same task protocol with explicit fixture
output, not the owner's AI account. See the [verification record](docs/verification.md) for
precise boundaries, email checks, and known limitations.

Keep credentials, real profiles/resumes, local agent state, and generated applications out of
Git. Ignored private paths and build outputs are not distribution inputs. The companion packer
allows only its runtime bundle, generated manifest, and README; downloads have SHA-256 checksums.

Read the [architecture](docs/architecture.md), [deployment guide](docs/deployment.md),
[companion guide](docs/companion.md), [local runbook](docs/local-runbook.md),
[adapter contract](docs/agent-adapters.md), and [limitations](docs/limitations.md).
