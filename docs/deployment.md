# Deploy ResumeForge

Reuse the existing `midhun-p24/ResumeForge` repository. Do not upgrade plans or provision paid
resources. Hosted operation is not yet verified; account configuration must be completed.

## Supabase

1. The owner has connected Supabase to this existing GitHub repository. Inspect that project's
   Settings → Integrations first: Working directory should be `.`, production branch should
   be the intended branch, and Deploy to production determines migration automation.
   Do not create a second project or a parallel migration deployment pipeline.
2. Let the existing integration apply pending migrations if enabled. Check deployment logs
   and `supabase_migrations.schema_migrations` for version `202610180001` before any CLI action.
   Do not run SQL manually after automation applied it. If automation is disabled, explicitly
   choose CLI as the sole runner, link the existing project, inspect `supabase migration list`,
   and run `supabase db push --dry-run` before applying missing versions. Never reset/repair
   history just to bypass a mismatch. The migration creates RLS, RPCs, and private Storage.
3. Enable email auth. Set the magic-link email template to display the OTP, for example:
   `<p>Your ResumeForge sign-in code is {{ .Token }}</p>`. The app verifies codes directly;
   it needs no auth callback route.
4. Set Auth Site URL to the deployed origin. Allow exact development/preview/production
   redirect origins as needed. Avoid broad production wildcards. Configure SMTP before
   opening to other users; default email delivery has restrictions and limits.
5. Set local and Vercel environment values without committing them or pasting secrets in chat.

| Variable                             | Visibility / purpose                                   |
| ------------------------------------ | ------------------------------------------------------ |
| NEXT_PUBLIC_SUPABASE_URL             | Browser: selected Supabase project origin              |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Browser: public authentication key                     |
| SUPABASE_SERVICE_ROLE_KEY            | Server only: owner-checked database/Storage operations |
| RESUMEFORGE_APP_URL                  | Server setup reference: deployed app origin            |
| RESUMEFORGE_URL                      | Companion only: matching web app origin                |
| RESUMEFORGE_CODEX_PATH               | Companion only, optional local executable              |
| RESUMEFORGE_TECTONIC_PATH            | Companion only, optional local compiler                |

Never prefix the service key with `NEXT_PUBLIC_`. Public environment values are bundled at
build time; redeploy after changing them. No Codex credentials belong in Vercel or Supabase.
Serverless functions never attempt to access the user's local agent.

## Vercel

The detected team is `midoon1` on Hobby. Linking needs specific approval in this environment.
Use the existing GitHub repository for future push builds when authorized:

- Framework: Next.js; Root Directory: `apps/web`.
- Enable access to files outside Root Directory for shared workspace packages.
- Install Command: `cd ../.. && npm ci`.
- Build Command: `cd ../.. && npm run build`.
- Output Directory: default `.next` relative to `apps/web`.
- Node: 22.x; set the intended preview/production environment values above.

Create a preview first, inspect its build, and verify its actual URL. An unconfigured public
dashboard alone is not a verified personal application. Do not place secrets in CLI arguments,
committed config, shell history, or build logs.

## Hosted acceptance

Use two synthetic accounts to verify isolation. Sign in; approve profile records; paste a
posting; pair using the deployed origin; confirm online Codex; queue tailoring; observe stages;
review evidence/PDF; request a locked revision; download all formats; track the exact resume;
refresh for persistence; revoke the device and verify claims/completion are denied. Only then
use real personal background. Maintain backups and a housekeeping schedule for expired pairing
rows, rate counters, and orphaned Storage objects.
