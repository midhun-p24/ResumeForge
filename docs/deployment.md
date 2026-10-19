# Deploy ResumeForge

Production origin: `https://resume-forge.midoon.dev`. Use the existing private GitHub repository,
Supabase project `wonqmnvpmwpcmvdvxhqd`, and Vercel `resumeforge` project under `midoon1`.
Do not create replacement projects, change repository visibility, or enable paid services.

## Database and isolation

The existing Supabase GitHub integration owns migrations: working directory `.`, branch `main`,
Deploy to production enabled. Migrations 001, 002, and 003 are applied remotely. CI executes
actual SQL against test PostgreSQL; it does not deploy migrations. Check remote history before
any future change of runner. Never apply recorded SQL again through CLI or the SQL editor.

All 13 application tables use RLS. Browser writes and privileged RPCs are denied. APIs verify
user/device credentials and ownership; the service-role key is server-only. Artifacts are private
and owner-checked download URLs expire after 60 seconds. Device claims can select only that
device owner's tasks. No shared hosted agent or owner-computer worker exists.

## Domain and protection

The owner saved this exact Name.com record, and Vercel verified it:

| Type  | Host         | Target                              | TTL           |
| ----- | ------------ | ----------------------------------- | ------------- |
| CNAME | resume-forge | 64c0a9283b795757.vercel-dns-017.com | 300 / default |

Preserve the existing midoon.dev portfolio A records, mail records, and Name.com nameservers.
Do not delegate the apex domain to Vercel or repoint the portfolio. The subdomain is attached
to the existing ResumeForge project. The project's current Vercel authentication setting is
`all_except_custom_domains`: the production custom domain is public, while generated preview
URLs remain protected. Verify this with a fresh browser and without following auth redirects.

## Authentication and email

Supabase Auth Site URL is `https://resume-forge.midoon.dev`. Exact additional redirects include
that origin and `http://localhost:3000`. Remove stale previews; add only exact deliberate test
origins when needed. Review a scoped config diff before changing auth; leave undeclared SMTP,
MFA, database, and storage settings unchanged.

The owner configured Resend SMTP directly in Supabase with sender `noreply@auth.midoon.dev`.
No SMTP password/API key belongs in the repository or Vercel browser environment. Keep paid
email overages disabled. Verification email receipt and confirmation were tested with a
private temporary alias; recovery email receipt was also confirmed. The application normally
uses passwordless email links, so it does not offer a password-login/reset screen.

Email requests go through a gated backend route with per-IP, per-address, hourly global and
daily global limits. Supabase's own auth limits still matter because publishable Auth APIs
are public. Keep email confirmation enabled. CAPTCHA and stronger edge controls should be
added as traffic grows; never claim the app-only gate replaces provider-side protections.

## Environment and build

| Variable                             | Purpose                                                                |
| ------------------------------------ | ---------------------------------------------------------------------- |
| NEXT_PUBLIC_SUPABASE_URL             | Browser/public auth project origin                                     |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Browser/public auth key                                                |
| SUPABASE_SERVICE_ROLE_KEY            | Server-only privileged database/Storage key; Vercel sensitive variable |
| RESUMEFORGE_APP_URL                  | Exact production email redirect origin                                 |
| RESUMEFORGE_REGISTRATION_ENABLED     | Server release gate, true only after release checks and SMTP setup     |

Set each Vercel target separately. `scripts/configure-vercel.ts --production` starts with
registration gated; add `--open-registration` after acceptance passes. The script uses the
normal authenticated CLI API, writes only an ignored temporary request body, and never logs
values. Existing sensitive variables are edited without resending immutable key names.

Root Directory `apps/web`; install `cd ../.. && npm ci`; build `cd ../.. && npm run build`;
Node 22.x; default `.next` output. Root build generates the allowlisted companion tarball,
checksum, and metadata under public/downloads before building Next.js. No private inputs,
credentials, local compiler, or repository history are in the download. Preview deployment
uses `--target preview`; production requires the explicit user-authorized `--prod` flag.

Vercel's GitHub App still needs access to this private repository for automatic push deploys.
Direct CLI deployments already work. Keep that optional App grant separate from website access.

## Public-service limits

Transactional database limits: 3 queued/running tasks, 20 tasks/hour and 50/day including
cancelled/failed attempts, 1,000 total tasks/versions, 250 jobs, 5 active devices (50 lifetime),
20 MiB of accounted profile/job/task/version JSON, 100 MiB of registered artifacts, and 100
stage events/task. Account limits are conservative; export before clearing an account.

Pairing allows at most 3 pending codes per source IP and 500 globally, with IP and global
creation throttles. Poll IDs must exist and match their secret before generating per-ID rate
keys. Ordinary forwarding headers are ignored; Vercel's platform IP header is trusted only
when running on Vercel. Other reverse proxies need an explicit trusted-IP configuration.

API read/write/device/download/export throttles supplement SQL limits. Expired pairing rows
and old rate counters are swept during normal traffic. Production CSP uses a per-response
nonce without unsafe-inline/unsafe-eval; development permits eval for Next.js tooling.

See verification.md for two-user acceptance results and limitations.md for maintenance duties.
