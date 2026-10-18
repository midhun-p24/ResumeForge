# Verification record

Current results (supersede the initial baseline below): 33 unit/API/PostgreSQL tests,
2 browser tests, lint, typecheck, production build, dependency audit, and GitHub CI pass.
Live Codex generated a synthetic one-page PDF with verified text/order and a visually
inspected rendering. Supabase CLI login and local/preview environment configuration are
complete. Both migrations remain pending under the owner's chosen GitHub-managed workflow.
Real Supabase email-token authentication passed for two temporary synthetic users, which
were cleaned up. The connected smoke test then stopped at the first workspace read with
`DATABASE_ERROR` because the schema is absent; no generated application was stored.

Preview: https://resumeforge-gbqexph13-midoon1.vercel.app — Vercel Ready; homepage HTTP 200;
unauthenticated workspace API HTTP 401. The complete authenticated hosted workflow is
not verified while the database schema is pending. Preview protection remains enabled.
Vercel's GitHub App still needs access to the existing private repository for push deployments.
No production deployment is retained. Default Supabase email links are supported because
the Free/default mail service rejected template customization without SMTP/upgrade.

Initial baseline (historical, before account setup):

| Check                                        | Result                                                          |
| -------------------------------------------- | --------------------------------------------------------------- |
| Repository                                   | Existing clean main/origin preserved: midhun-p24/ResumeForge    |
| Local tools                                  | Node 22.20, npm, Git; Codex ChatGPT sign-in available           |
| Production build                             | Passed on Next.js 16.4.2                                        |
| Initial synthetic contracts/PostgreSQL suite | 21 tests passed                                                 |
| Live Codex structured tailoring              | Passed with synthetic profile/posting                           |
| Live Codex to Tectonic PDF                   | Passed: one page, text/order verified, no detected overflow     |
| Supabase CLI                                 | Not authenticated; no selected hosted project configured        |
| Vercel                                       | Authenticated; one Hobby team midoon1                           |
| Vercel linking                               | Automatic approval review rejected integration pending approval |
| Complete hosted signed-in workflow           | Not verified                                                    |

Later results are recorded in milestone commits and the final handoff. Synthetic fixtures
are unrelated to the owner's background.
