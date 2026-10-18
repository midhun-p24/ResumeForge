# Deploy ResumeForge

Reuse the existing `midhun-p24/ResumeForge` repository and configured Supabase/Vercel projects.
Do not upgrade plans or provision paid resources. See the [verification record](verification.md)
for the tested local and hosted workflows and the remaining personal setup steps.

## Supabase

1. The owner has connected Supabase to this existing GitHub repository. Inspect that project's
   Settings → Integrations first: Working directory should be `.`, production branch should
   be the intended branch, and Deploy to production determines migration automation.
   Do not create a second project or a parallel migration deployment pipeline.
2. Let the existing integration apply pending migrations if enabled. Check deployment logs
   and `supabase_migrations.schema_migrations` for versions `202610180001` and `202610180002`
   before any CLI action. Both are now applied by the existing GitHub integration.
   Do not run SQL manually after automation applied it. If automation is disabled, explicitly
   choose CLI as the sole runner, link the existing project, inspect `supabase migration list`,
   and run `supabase db push --dry-run` before applying missing versions. Never reset/repair
   history just to bypass a mismatch. The migration creates RLS, RPCs, and private Storage.
3. Enable email auth and keep Supabase's default secure email-link template. The browser
   client detects the returned session; no callback route is required. If a custom SMTP
   provider is already configured, an OTP template can optionally show `{{ .Token }}` and
   users can enter that code. This project's Free/default mail service rejected template
   customization, so ResumeForge supports standard links without an upgrade.
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

The owner approved preview deployment to team `midoon1` on Hobby. The `resumeforge` project
exists and has preview environment values. Vercel's GitHub App could not access the private
repository. Grant that App access to this existing repository in GitHub's Installed Apps
settings, then connect the existing Vercel project; do not create a second repository/project.
Direct CLI previews work independently of that optional automatic push integration.

- Framework: Next.js; Root Directory: `apps/web`.
- Enable access to files outside Root Directory for shared workspace packages.
- Install Command: `cd ../.. && npm ci`.
- Build Command: `cd ../.. && npm run build`.
- Output Directory: default `.next` relative to `apps/web`.
- Node: 22.x; set the intended preview/production environment values above.

Use `vercel deploy --target preview --scope midoon1 --yes --no-wait` explicitly: the first
deployment of a new Vercel project can otherwise be assigned to production. An unconfigured public
dashboard alone is not a verified personal application. Do not place secrets in CLI arguments,
committed config, shell history, or build logs.

Vercel preview authentication is separate from ResumeForge account authentication. Protected
previews require a deployment-protection bypass credential for companion polling; do not
silently disable protection. Use the local origin while verifying the backend, or configure
an explicitly authorized bypass/production deployment before expecting the hosted companion
to work. Keep any bypass credential local and outside Git.

## Hosted acceptance

Use two synthetic accounts to verify isolation. Sign in; approve profile records; paste a
posting; pair using the deployed origin; confirm online Codex; queue tailoring; observe stages;
review evidence/PDF; request a locked revision; download all formats; track the exact resume;
refresh for persistence; revoke the device and verify claims/completion are denied. Only then
use real personal background. Maintain backups and a housekeeping schedule for expired pairing
rows, rate counters, and orphaned Storage objects.
