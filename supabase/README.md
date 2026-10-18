# ResumeForge database deployment

This directory is deployed by the existing Supabase GitHub integration for
`midhun-p24/ResumeForge`. The owner confirmed these dashboard settings:

- Working directory: `.` (the parent of this directory).
- Production Git branch: `main`.
- Deploy to production: enabled.

A push after saving those settings triggers the integration. It should apply the
pending migration files once and record their versions in
`supabase_migrations.schema_migrations`. GitHub Actions in this repository validate
the code and SQL; they do not deploy database migrations.

Use `supabase migration list --project-ref <existing-project-ref>` to inspect
history. Do not run `db push`, paste migration SQL into the editor, reset the
database, or repair migration history alongside the GitHub deployment. A change
of migration runner requires an explicit decision and a history check first.

No real profile data or generated resumes belong here. Seeding is disabled.
The migrations create tables, ownership policies, transactional task functions,
explicit server permissions, and a private artifact bucket. They do not create
user accounts or import personal background.

See [the deployment guide](../docs/deployment.md) for environment and auth setup.
