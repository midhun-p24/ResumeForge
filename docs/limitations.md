# Current limitations

- Public production is deployed at resume-forge.midoon.dev with private individual accounts.
  The private repository and protected development previews remain separate from public access.
- Only Codex through each user's local companion is supported. No other agent, shared owner
  account, hosted worker, or automatic application submission exists. Windows installation is
  verified; macOS/Linux prerequisites and OS-vault behavior need testing on those platforms.
- Real Codex was used for an operator-controlled synthetic account. The second independent
  synthetic account's full queue/revision/PDF protocol uses labeled fixture output to avoid
  using the owner's AI account for another identity. Independent real AI sign-in on a second
  person's machine is not claimed as tested.
- The owner confirmed Resend verification and recovery email receipt; Supabase confirms the
  emailed verification link confirmed the test account. Normal sign-in is passwordless.
  Email reputation, provider limits, and deliverability still need operational monitoring.
- Account/API/pairing quotas bound normal abuse. The app's email gate/rates do not replace
  Supabase's public Auth rate limits. Add provider CAPTCHA/stronger edge controls as traffic grows.
  No service can promise immunity from distributed abuse; monitor shared free-tier capacity.
- Manual entry and pasted-text extraction through each user's own Codex companion work. Extracted
  records remain drafts until reviewed and approved. PDF/DOCX uploads and posting/portfolio URL
  extraction remain deferred; saved URLs are references only.
- The controlled LaTeX layout is an original compatible Jake-inspired default, not the exact
  preferred upstream template. Replacements require source/license review and fresh checks.
  The supplied canonical Jake template is implemented and sample-verified locally, pending the
  owner's visual approval before production activation. See [template review](canonical-template.md).
- Source references, numeric checks, PDF extraction/order/coordinates, and overflow heuristics
  help review but cannot guarantee truth or flawless layout. Review before applying.
- Codex tools and compiler packages are restricted, outputs/time are bounded, and versions are
  pinned. Portable hard CPU/RAM quotas are not implemented on every OS. Managed Codex settings
  and future SDK upgrades require fresh restriction tests. The user's own computer is trusted.
- Workspace reads cap tasks at 100 and other collections at 500. Heavy history needs pagination.
  JSON export includes artifact metadata, not a complete PDF archive.
- SQL metadata and Storage are not one transaction. Crashes can leave orphaned files. Account
  deletion removes registered artifacts; orphan cleanup and backups remain operator duties.
- Completely malformed model text is discarded; there is no raw-output recovery editor.
- A full independent accessibility/security audit is still advisable as public usage grows.
  Current checks include keyboard focus, dialog containment, reduced motion, and mobile layouts.
- Vercel GitHub auto-deployment still needs its App granted access to the existing private repo.
  CLI production deployments work. No paid resources or email overages were enabled.
