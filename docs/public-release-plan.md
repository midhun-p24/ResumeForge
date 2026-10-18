# ResumeForge public release

The owner has authorized public production access at `https://resume-forge.midoon.dev`
with individual private accounts. The GitHub repository stays private. Development previews
remain protected. This replaces the earlier account-restricted deployment requirement.

## Gates and milestones

1. Prepare an isolated dashboard/sign-in design preview for owner review. Do not apply the
   proposed visual direction to other screens before that review.
2. Harden backend/database/file isolation, anonymous pairing, per-account quotas, request
   throttling, production CSP, and device revocation. Add focused regression checks.
3. Supply a downloadable companion that does not require private GitHub access. Explain
   installation, local Codex sign-in, pairing, troubleshooting, and disconnect. No shared
   owner companion or agent account may process other users' tasks.
4. Verify the custom domain and exact auth redirects. Preserve portfolio DNS. Configure
   production server/public environment values separately; keep secrets out of Git and bundles.
5. Keep registration gated until custom SMTP and the release safeguards are ready. Verify
   two separate synthetic users against the public production origin, including cross-account
   denial and independent devices. Distinguish token-based synthetic sign-in from mailbox delivery.
6. Open registration only after the applicable gates pass, then verify public reachability
   without Vercel authentication and preview protection independently.

## Domain record

Vercel's project-specific recommendation, saved at Name.com and verified on 2026-10-18:

| Type | Host | Target | TTL |
| --- | --- | --- | --- |
| CNAME | `resume-forge` | `64c0a9283b795757.vercel-dns-017.com` | 300 / provider default |

The apex portfolio A records remain `216.198.79.1` and `64.29.17.1`. Name.com nameservers
remain unchanged. No apex, `www`, mail, or portfolio records were modified by this work.

## External setup

Supabase's default sender does not support arbitrary public users. The owner is configuring
custom SMTP directly in Supabase. Suggested sender: `noreply@auth.midoon.dev`; Resend Free
SMTP host `smtp.resend.com`, port 465, username `resend`, password supplied privately as its
sending API key. DNS verification values must come from the email provider, not guesses.
No paid service or overage has been enabled.
