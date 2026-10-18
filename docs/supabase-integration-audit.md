# Existing Supabase integration audit

The deployment authority is the existing Supabase GitHub integration for
`midhun-p24/ResumeForge`, using project `wonqmnvpmwpcmvdvxhqd`.

The owner confirmed these saved settings:

- Working directory: `.` (the parent of `supabase/`).
- Production branch: `main`.
- Deploy to production: enabled.

After those settings were saved, commit `9f02a21` triggered a successful Supabase check.
Read-only CLI history reports migrations `202610180001` and `202610180002` applied remotely.
All 13 application tables have RLS enabled and `resume-artifacts` is a private bucket.
Connected synthetic local and hosted API acceptance checks pass against that schema.

No migration was applied through a CLI push, SQL editor, or parallel GitHub Actions runner.
The repository CI validates migrations in PostgreSQL but does not deploy them. The minimal
root `supabase/config.toml` enables migrations and disables seeds without auth overrides.

Before the owner saved these settings, authenticated inspection found both migrations
pending and the public schema empty; those earlier blockers are resolved. Supabase CLI login
is now working. The Supabase plugin remains admin-disabled, so official CLI commands were used.
CLI configuration of exact auth redirect origins is separate from migration deployment:
only `auth.site_url` and `auth.additional_redirect_urls` were changed after reviewing the diff;
undeclared service settings were left unchanged.

[Supabase's official integration guide](https://supabase.com/docs/guides/deployment/branching/github-integration)
documents that the working directory is the parent of `supabase/`, the integration tracks
applied migration versions, and production pushes run migrations when Deploy to production
is enabled. Check remote history before any future change of migration runner; never apply
already-recorded SQL a second time.
