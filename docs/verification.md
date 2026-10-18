# Verification record

Verified on 2026-10-18 using synthetic inputs only. No personal resume/profile was imported.

| Check                                                            | Result                                                                                                                                                                                             |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint, TypeScript, production build                               | Passed                                                                                                                                                                                             |
| Contracts, API boundaries, actual PostgreSQL migration/functions | 33 tests passed                                                                                                                                                                                    |
| Public desktop/mobile browser regression suite                   | 2 tests passed                                                                                                                                                                                     |
| Existing Supabase GitHub deployment                              | Both migrations applied: `202610180001`, `202610180002`                                                                                                                                            |
| Database isolation                                               | All 13 application tables have RLS; artifact bucket is private                                                                                                                                     |
| Genuine local Codex and Tectonic                                 | Tailoring and locked revisions passed; one-page PDFs parse and pass text/order/overflow checks                                                                                                     |
| Connected local backend                                          | Authentication, pairing, OS vault, claims/leases, PDF upload, idempotent completion, downloads, isolation, persistence, revocation passed                                                          |
| Signed-in local browser                                          | Email-link session, profile/evidence display, PDF preview request, PDF/TeX/JSON download controls, bullet edit, compare/restore, tracker persistence, export, disconnect, responsive layout passed |
| Hosted preview API                                               | Real Supabase auth, single-use pairing, genuine Codex tailoring/revision, private artifacts, two-user isolation, manual edits/restore, persistence and revocation passed                           |
| Manual-edit rendering                                            | Exact saved content preserved; separate PDF version created without changing older versions/artifacts                                                                                              |

## Deployment boundary

The existing Vercel project is Ready at:
https://resumeforge-3wkpfey3e-midoon1.vercel.app

This is a **preview**, protected by Vercel authentication. The hosted API acceptance test used
the official authenticated Vercel CLI for hosting authorization. ResumeForge user/device
credentials were supplied over stdin, never in command-line arguments. This verifies the
hosted application APIs; it is distinct from the signed-in browser checks against localhost.
Exact preview and localhost email redirect origins are configured in Supabase.

The complete connected tests created two fresh synthetic accounts without sending email,
used genuine local Codex and Tectonic, and removed their accounts and registered artifacts
in cleanup. Browser repetitions used explicitly labeled fixture output to avoid repeated
model usage; those fixture runs are not evidence of live AI generation. The separate live
Codex runs are. Synthetic screenshots/PDFs stay under ignored `private/smoke/`; a generated
PDF rendering and desktop/mobile workspace screenshots were visually inspected.

Both migrations were applied by the existing Supabase GitHub integration after commit
`9f02a21`. No CLI/SQL-editor migration push or duplicate migration runner was used.
GitHub Actions validate the code and SQL; they do not deploy migrations.

## Personal setup still required

- Sign in with your own email and review actual email delivery. Synthetic authentication
  checks do not test mailbox delivery; Supabase's default email service has delivery limits.
- Enter and approve your own profile; pair your computer from Agent & Settings and keep the
  companion running. Tests did not pair a permanent device or create your personal profile.
- For companion polling against the protected preview, configure an authorized local
  `RESUMEFORGE_VERCEL_BYPASS`, as described in the companion guide, or use localhost.
  The test-only Vercel CLI transport does not configure the normal companion.
- To enable automatic Vercel deployments on push, grant the Vercel GitHub App access to the
  existing private repository and connect the existing project. Direct CLI previews work.

No production deployment or paid resources were provisioned. See [limitations](limitations.md)
for the public-release hardening and deliberately deferred import features.
