# Local runbook

1. `npm ci`; if absent, copy `.env.example` to `apps/web/.env.local`; configure the existing
   ResumeForge Supabase project using the deployment guide. Keep real values ignored.
2. `npm run dev`; open `http://localhost:3000`; sign in using the secure email link.
3. Enter contact data and structured source records; review/approve facts. Pasted master text
   is a private reference and is never silently approved.
4. `codex login`; install Tectonic; `npm run companion -- doctor`, then `warmup`.
5. `npm run companion -- pair --url http://localhost:3000`; approve the code; wait for success;
   `npm run companion -- run --url http://localhost:3000`.
6. Paste/save a full posting and start tailoring. Offline tasks stay queued.
7. Review requirements, sources, gaps, eligibility, warnings, and PDF before use.
8. Edit/save as a new version; render it with the companion. Save edits before revisions;
   choose locks/exclusions and enter a revision request. Old PDFs never change silently.
9. Manually record application stage, date, and exact resume version, then refresh.

`npm run check` runs lint, typecheck, synthetic unit/PostgreSQL tests, and production build.
`npm run test:ui` starts a separate server on 3101 and checks public setup, forms, approval,
mobile navigation, and unauthorized access. Install Chromium with `npx playwright install chromium`.
No live Codex auth is used in CI.

`npm run smoke:codex -- --pdf` uses actual local Codex and Tectonic with synthetic inputs.
Ignored outputs go in `private/smoke`. `--warmup` permits initial fixed-template downloads.
Account usage limits apply. Never replace committed fixtures with real profile facts.

For an optional live connected acceptance check, start the configured local app on port 3000,
then run `npx tsx scripts/smoke-connected.ts --browser`. This uses the ignored local server
configuration to create two temporary synthetic accounts without sending email, runs real Codex
and Tectonic, checks isolation and the signed-in UI, and deletes the test accounts/artifacts.
It never signs in as an existing user. `--fixture-output` explicitly substitutes synthetic
structured output to repeat browser checks without AI usage; it is not a live Codex test.
All screenshots and generated files remain under ignored `private/smoke/`.

To test a protected Vercel preview with the authenticated official Vercel CLI, set
`RESUMEFORGE_TEST_URL` to its exact HTTPS origin and `RESUMEFORGE_TEST_VERCEL=1`, then run the
connected script without `--browser`. The CLI supplies hosting authorization normally;
app/device credentials go through stdin and are never placed in command-line arguments.
Unset those test variables afterward. This test transport does not configure the companion's
separate optional `RESUMEFORGE_VERCEL_BYPASS` setting.

To run a local production build, stop dev, run `npm run build` then `npm start`. Avoid simultaneous
dev/build processes using the same `.next` directory.

## Troubleshooting

- PowerShell policy: use `npm.cmd` / `npx.cmd` without changing system execution policy.
- Setup banner: check `.env.local` location and restart the server.
- Database failure: apply the migration and verify the server service key.
- Missing email code: check OTP template, SMTP settings, and Supabase delivery limits.
- Offline device: check matching app origin, revocation, local sign-in, and running terminal.
- Compiler failure: check Tectonic path and run warmup.
- Expired preview: click Open / refresh PDF preview for a new 60-second URL.
- Locks conflict with one page: unlock/shorten content; the renderer does not shrink the font.
- New numeric claim rejected: approve its metric/context in the profile, then start a fresh
  tailoring task so the snapshot includes that evidence.

## Git

Review staged diffs and filenames for secrets/private facts at each milestone. Never force-push.
Commit source, docs, migrations, CI, and lockfile; push to the existing origin. Keep personal
inputs, outputs, and machine state under ignored paths.
