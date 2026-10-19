# Verification record

Verified on 2026-10-18 with synthetic profiles only. No real resume or project background was imported.

Production: **https://resume-forge.midoon.dev**

| Check                                                                     | Result                                                                                                                                        |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint, types, production build                                             | Passed                                                                                                                                        |
| Contracts, API authorization, PostgreSQL migration/functions, quota tests | 39 tests passed                                                                                                                               |
| Public setup desktop/mobile browser suite                                 | 2 tests passed                                                                                                                                |
| GitHub-managed Supabase migration history                                 | 001, 002, 003 applied; no parallel CLI db push                                                                                                |
| GitHub CI for release-security milestone ea96b97                          | Passed; repository remains private                                                                                                            |
| Public custom-domain access                                               | HTTP 200 without Vercel cookies/account                                                                                                       |
| Development preview protection                                            | Unauthenticated request receives Vercel auth redirect/protection                                                                              |
| Production CSP                                                            | Per-response nonce, no unsafe-inline/unsafe-eval; browser hydration passed                                                                    |
| Public companion download                                                 | Actual production tarball installed independently without GitHub access; doctor passed                                                        |
| Genuine Codex production workflow                                         | Tailoring, locked revision, one-page PDF, private uploads, idempotent completion passed                                                       |
| Signed-in production browser                                              | Profile/evidence, authorized PDF preview, PDF/TeX/JSON downloads, editing, comparison/restore, tracker persistence, export, disconnect passed |
| Two-user ownership                                                        | Foreign jobs/artifacts/device revocation/completion denied; devices never claim the other user's queued work                                  |
| Second synthetic user's complete protocol                                 | Independent pairing, tailoring/revision, PDFs, tracker, revocation passed with labeled fixture output, no second-user AI invocation           |
| Same-browser account switch                                               | Second account saw only its own saved profile; late former-account responses are fenced out                                                   |
| Manual-edit rendering                                                     | Saved content preserved exactly in a separate PDF version; old versions/artifacts unchanged                                                   |
| Verification email                                                        | User received actual Resend message and followed it; Supabase confirmed the test account email                                                |
| Recovery email                                                            | User confirmed receipt at the isolated test alias; normal app sign-in is passwordless                                                         |
| Privacy and cleanup                                                       | Source/client checks passed; temporary acceptance and email accounts removed                                                                  |

## Scope and boundaries

The owner approved the dashboard/sign-in design at commit 18e4457 before it was applied
throughout the application. Public production access is separate from the private repository.
Development previews stay protected. The exact Name.com CNAME and production auth redirects
are configured; apex portfolio records and nameservers were preserved.

Initial production acceptance ran with the app's email registration gate paused. The final
release enables registration after the checks above. The gate is an app release switch,
not a replacement for Supabase Auth's own rate limits and email confirmation.

Real Codex ran only for an operator-controlled synthetic test account. The second independent
synthetic identity used explicit fixture output to test the same queue/revision/artifact
protocol without using the owner's agent access for another identity. No claim is made that
we signed into a second person's real Codex account or verified a second physical computer.
SQL/API tests and hosted probes verify that public users cannot route tasks to the owner's device.

Synthetic sign-in sessions for workflow checks used admin-generated links without email delivery.
Actual SMTP was tested separately with the owner-provided private alias, which is not stored in Git.
Verification confirmation was observed in Supabase; recovery email receipt was confirmed by the
recipient. No existing user's password was changed, and no normal password-login/reset UI is claimed.

Screenshots and generated PDFs are ignored under private/. The public sign-in and desktop/mobile
workspace layouts were visually inspected. The standalone Windows companion installation is
verified; macOS/Linux remain an explicit installation-test boundary. See limitations.md.
