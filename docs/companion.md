# Companion installation and connection

## 0.5.4: keep metrics and awards, add posting skills, fewer wasted turns

The first page that 0.5.3 produced on free Codex was full and clean, but two later
whole-document expansions brought back short last lines; trimming also dropped research metrics
the model had listed last; awards and some posting skills were missing.

- Fill counts toward page quality only up to 90%, and short lines cost more, so a clean 92% page
  beats a 100% page with flawed lines. Whole-document expansion happens at most once, and only
  below 85% fill; otherwise turns polish specific lines.
- Trimming removes plain bullets before bullets with numbers or bold (never an entry's last
  bullet), and the writer is told to lead each entry with its strongest sourced metric.
- Skills check: items from the sources' "Category: a, b, c" lines that the posting mentions but
  the resume does not (for example HTML, CSS, React) are sent back to be put at the front of the
  matching skills rows. The posting itself never counts as a source, so posting-only skills such
  as Kubernetes are never pushed onto the resume (this fixes a 0.5.2 check that did).
- Awards check: placed awards in the sources (first/second/third place) whose names are absent
  from the education honors line are sent back as an `honors` replacement edit.

## 0.5.3: edit-based polish, resilient compiles

A live 0.5.2 run fitted the page to 99% in one turn, but each polish turn rewrote the whole
document (20 lines over again) and a later compile failure ended the task, discarding the good
page. Polish turns now use a small edits schema: the model returns only replacement bullets,
skills rows or headings, matched to the fitted page by their original text, so a fitted page is
never rewritten wholesale. Each short last line comes with the words printed on it and an exact
character cut ("Cut at least 26 characters"). Full rewrites happen only to expand a sparse page or
shorten one that cannot be fitted. A failed compile is retried once after a short pause, logs its
TeX error lines, and skips that candidate instead of ending the task.

## 0.5.2: deterministic page fitting, targeted polish

Live runs showed models overshooting in both directions when asked to fix fill (27 lines over,
then 81% full), exhausting the turn budget. The model now drafts generously, with entries and
bullets ordered by importance, and the companion fits the page itself: it binary-searches the
fewest least-important lines to remove (deepest bullets of the latest entries first, every entry
keeps one bullet, one entry stays per section), typically in about five compiles. Remaining model
calls only polish the fitted page: named short last lines, wrapped skills rows, heading
collisions, posting keywords present in the sources but absent from the resume, missing bold, or
a page under 93% full (where overshooting is safe because trimming follows). A worse polish never
replaces the best page. Keyword coverage shown in the app is recomputed from the final text.

## 0.5.1: heading collisions, stricter rules, turn log

The layout check now detects entry headings that run into their right-aligned date (or past the
margin) and sends the model a precise fix; such a page is marked for review. Writer rules keep
headings to plain names (status and team notes go in bullets), cap heading and stack length, put
roles and competition teams under Experience, put sourced awards on the honors line, lead skills
rows with the posting's supported technologies and forbid filler skills. Sparse-page feedback names
the entries that have room for more sourced bullets. The companion prints one line per attempt
(pages, percent full, short last lines, wrapped skills rows, heading collisions) and the chosen
result, so a weak resume can be explained from the terminal.

## 0.5.0: source-based writer, Codex or Claude

Tailoring no longer reads approved records. The writer receives the job posting plus the raw
tailoring sources from Master Profile (master resume, optional portfolio text, optional reference
resume) and authors a version 2 document: sections, headings, dates, locations, project stacks,
bullets with `**bold**` spans, skills rows, a cover letter and a keyword check. The companion
renders it into the Jake template, compiles with Tectonic, measures the page (lines overflowing,
percent filled, bullets whose last line holds one to three words, skills rows that wrap) and sends
that feedback back in the same conversation. At most five model calls; the best one-page result
wins, and trimming the lowest bullets is only a last resort.

Truth guard: every number in the resume and cover letter must appear in the sources or the posting,
or the draft is sent back for repair and is never uploaded. Headings whose wording is not found in
the sources are listed in the writer notes for review. Manual edits are your own words and are only
structure-checked.

Writers: `resumeforge login` (Codex, your ChatGPT sign-in) or `resumeforge login --claude` (your
Anthropic API key, stored in the OS vault, never sent to ResumeForge, never passed to Tectonic or
Codex). Claude defaults to `claude-opus-5-5` with adaptive thinking, high effort and server-side
refusal fallback; usage is billed to your Anthropic account. `resumeforge provider claude|codex
[--model name]` switches writers and models; `doctor` shows the active writer. Older companions
claim no version 2 task; the server fails it with `COMPANION_UPGRADE_REQUIRED`. Old record-based
versions stay viewable and re-renderable; revising one starts a fresh source-based draft.

## 0.4.0: paste-a-job prompt rules and cover letters

Tailoring follows the owner's portable paste-a-job prompt (one filled page, truth first,
posting keywords only where the profile supports them). Projects or Experience comes first,
whichever is more relevant to the posting. Unlocked entries carry one to four distinct
supported bullets: three or four for the most relevant, one or two for supporting entries.
The fitter compiles, then spends at most two model turns on overflow, a page under 90% full,
or bullets whose last line holds only a few words. It keeps the best one-page candidate and
only then trims bullets (never below two) before whole low-ranked entries.
Every result includes a plain-text cover letter grounded in approved facts and the posting;
its numbers must appear in either. The template moves to ~0.45in side and ~0.4in top/bottom
margins, adds the profile location to a footnote-size contact line, and keeps body fonts.
Older saved versions have no cover letter; tailor a fresh version to get one.

## 0.3.7: relevance and depth before breadth

The fitter starts with the best experience/research entry and best project, then
adds the next experience and next project one at a time. Every included unlocked
experience or project needs at least three distinct supported bullets. Extra bullets
can be trimmed down to three; whole lower-priority entries are removed before the
minimum is violated. Records without enough verified evidence must be omitted with
an explanation, never padded or fabricated. Education and skills are exempt.
Existing locked legacy content is preserved, and manual renders do not rewrite it.
Each candidate pool has at most six incremental fitting steps, sixteen total
content trims, and two additional model turns. The supplied Jake template stays fixed.

## 0.3.6: retain ranked entries while fitting

The fitter can remove existing unlocked bullets one at a time, compiling after each
removal, before dropping whole low-ranked entries. It preserves at least one bullet
per entry and one entry per section, education, skills, and all locks. At most sixteen
such trims and two model revision turns are allowed. No facts or formatting are invented.

## 0.3.5: concise project stacks

Project headings select up to four relevant verified technologies within a fixed
text budget, preventing full master-record stack lists from overflowing the supplied
single-row heading. The template commands and preamble remain unchanged.

## 0.3.4: supplied Jake template active

The default now uses the supplied Jake source with its original layout commands,
font settings and margins. Codex returns structured content only. The companion
inserts escaped content into `Resume.tex`, then compiles `Resume.pdf`. Existing
PDFs require regeneration after updating the companion.

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
npm install --global https://resume-forge.midoon.dev/downloads/resumeforge-companion-0.5.4.tgz
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

## 0.3.8: ranked pairs with exactly three bullets

Tailoring ranks all eligible experiences/research and projects independently for the posting.
Each unlocked included entry must have exactly three distinct supported accomplishment bullets.
The fitter tries successive ranked pairs until actual compilation overflows, without a 90% fill
cutoff. A lower-priority fourth skill category may be removed to reserve space for core entries.
Up to two bounded revision turns shorten wording when the three-pair minimum does not fit.
The target is at least three entries per category; evidence shortages or page constraints produce
an explicit warning rather than invented content. Education and relevant skills remain included.
Jake's original source and license are retained with owner-requested compact list/section spacing,
a slightly smaller name and short clickable contact labels. Body type and page margins stay fixed.
Existing locks take precedence and manual renders do not rewrite content.
