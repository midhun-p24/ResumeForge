# Companion installation and connection

## 0.3.3: fuller evidence and measured page fitting

Tailoring now prioritizes Education, Technical Skills, Engineering and Research
Experience, then Projects. Coursework is omitted. Skill records render their actual
technology lists, and long experience headings place organization/date metadata on
a separate line. Font size and margins stay fixed.

After compilation, a draft below 90% of usable page height can receive additional
relevant approved accomplishments or the next ranked record. At most two extra
model turns expand or shorten content; the fullest clean one-page candidate wins.
Profiles with limited evidence can still produce shorter pages. Locks and source
exclusions apply throughout; manual render operations never rewrite content.
This can take longer and use more of the user's own Codex allowance.

## 0.3.2: tailoring schema correction

If tailoring stopped at “Analyzing requirements” with `AGENT_FAILED`, update the
companion and retry. The previous generation schema declared optional bullet
emphasis, which Codex strict structured outputs rejected before generation.
Version 0.3.2 introduced a nullable model field and restores omitted fields for
older saved resumes, preserving locked content. Saved profile records are unaffected.
Schema rejections now have the distinct `SCHEMA_REJECTED` status.

The public guide is https://resume-forge.midoon.dev/companion. Users do not need private
GitHub access. Each person installs the companion on their own computer and uses their own
supported Codex ChatGPT sign-in. There is no shared owner worker or paid API fallback.

## Install and authenticate

Requirements: Node 22.14+, Tectonic 0.17+, and Windows Credential Manager, macOS Keychain,
or Linux Secret Service. Windows installation is verified; other platforms need their own check.

```powershell
npm install --global https://resume-forge.midoon.dev/downloads/resumeforge-companion-0.3.3.tgz
resumeforge login
resumeforge doctor
resumeforge warmup
resumeforge pair
# Sign in on the website, approve the code in Agent & Settings, wait for Paired.
resumeforge run
```

Use npm.cmd/resumeforge.cmd if PowerShell blocks .ps1 files. Install Tectonic using its official
instructions; put the executable on PATH or set RESUMEFORGE_TECTONIC_PATH to its absolute path.
Warmup permits fixed-template package/font downloads once. Normal tasks use untrusted,
only-cached compilation. Doctor checks the bundled Codex CLI's local sign-in, compiler, and vault.
The supported login command invokes the bundled official CLI without a shell, including Windows.

The distribution contains only the allowlisted runtime bundle, manifest, and README; public
npm dependencies install separately. Check the adjacent .sha256 file before installing a saved
package. The private repository, web server source, credentials, profiles, and generated files
are not part of that allowlist. Codex account/model access and usage depend on the user's plan.

## Pairing and authorization

Companion 0.3.0 supports pasted master-resume extraction into reviewable drafts. To upgrade,
stop the old worker, rerun the install command above, then run doctor and run. Your pairing is
retained; do not pair again just to upgrade. Older workers skip imports and continue tailoring.

The default origin is https://resume-forge.midoon.dev. Credentials are scoped per origin.
For development, pass --url http://localhost:3000 to both pair and run. HTTPS is required except
loopback; URL credentials, arbitrary paths, queries, and redirects are rejected.

The companion proposes a random device token and stores it in the OS vault. The server sees
only its hash. An independent code expires after 10 minutes; authenticated approval and
credential consumption are single-use. Approve only a companion you started. Existing successful
pairing cannot silently be overwritten; disconnect first. Pairing/active-device limits apply.

All requests are outbound. A device claims only its owner's tasks, with one active lease and
heartbeats. The companion sends complete snapshots to its own local Codex client, validates
structured output, compiles and checks PDFs, and uploads private results. It exposes no inbound
port. Local execution is not offline AI: the model service receives task content. Credentials
for Codex are never uploaded to ResumeForge or inherited as API keys by task children.

Ctrl+C cancels active local work and stops polling. Disconnect in the UI revokes the device
immediately. Run resumeforge disconnect to revoke and remove the local credential; an already
remotely revoked token can still be removed locally. If the network is unavailable, revoke from
the UI when reachable and remove the origin's ResumeForge entry in the OS vault. Use a separate
OS account on shared computers; never reuse someone else's Codex/vault sign-in.

For protected previews only, developers may set RESUMEFORGE_VERCEL_BYPASS locally with an
authorized hosting bypass credential. It is excluded from Codex/compiler environments.
Public production does not require Vercel authentication or that extra credential.

## Failures

| Code                      | Action                                                              |
| ------------------------- | ------------------------------------------------------------------- |
| AUTH_REQUIRED             | Run resumeforge login and doctor.                                   |
| USAGE_LIMIT               | Wait for your Codex allowance; no paid fallback occurs.             |
| MODEL_ACCESS              | Check your permitted model/workspace.                               |
| INVALID_OUTPUT            | One repair failed; review retained schema-valid draft if available. |
| COMPILER_MISSING          | Install Tectonic or correct its executable path.                    |
| COMPILE_FAILED            | Check doctor/warmup and fixed-template dependencies.                |
| TIMEOUT                   | Shorten the request and retry.                                      |
| ALREADY_PAIRED            | Disconnect that origin before replacing pairing.                    |
| PAIR_LIMIT / DEVICE_LIMIT | Finish pending pairing, wait for expiry, or revoke an old device.   |
| TASK_LIMIT / QUEUE_FULL   | Finish/cancel pending work or wait for allowance renewal.           |
| HOST_PROTECTED            | You selected a protected development preview; production is public. |

Task directories under ~/.resumeforge/tasks are removed on success/failure. Crashes and Codex's
own local session retention can leave private local files; protect your OS account and clean
stale work only when no task is active. There is no plaintext device-credential fallback.
