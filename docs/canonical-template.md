# Supplied Jake template: review milestone

Status: implemented and locally verified; awaiting the owner's sample approval.
Production still uses `compatible-v1`. No template activation or deployment is included
in this milestone. Approval is the explicit condition requested by the owner.

`packages/resume/src/jake-template.ts` preserves the entire pre-document layout from the
supplied `JakesResumeTemplate.tex`, with line endings normalized to LF. Its SHA-256 is
`8dcdc011da653cb8db26ed7d644ae52866f701b491c8382ccb1965b8ea662461`.
A regression test verifies this digest. The original document class, font choices, packages,
margin adjustments, section rules, header styling, list spacing, and heading/item commands
are retained. The sample personal body is replaced by a controlled structured-content renderer.
The canonical layout is application code; model output cannot change it.

The supplied source uses pdfTeX-only `pdfglyphtounicode` and `pdfgentounicode` commands.
An engine-conditional compatibility prefix provides harmless definitions under XeTeX/Tectonic.
The supplied preamble remains intact after this prefix. The adapter changes no layout settings.
Unicode extraction is checked on the compiled PDF, rather than assumed from those commands.

## Content and safety

- Select only approved sources relevant to the specific posting. Exclusions and locks still apply.
- Accomplishment writing uses “Accomplished X through Y using Z” as a flexible guide.
  Numeric claims still require approved, cited metrics. Scope must not be inflated.
- Optional `emphasis` contains at most two distinct, nonoverlapping literal bullet substrings,
  totaling at most half the bullet. Invalid emphasis is rejected. No raw markup is accepted.
  For older outputs without this field, the Jake renderer can emphasize cited metric values
  that appear literally in the bullet. Explicit empty emphasis disables that fallback.
- All inserted text, including emphasized spans and link arguments, is LaTeX-escaped.
  Only the renderer emits formatting commands. Metadata comes from approved profile records.
- Education uses the supplied education subheading structure; experience uses its two-row
  subheading; projects use its project heading; skills use its label-free small-text list.
  There is no record-location field in the current profile: that template cell stays blank.
- One page is the target. The existing bounded shortening pass removes or shortens lower-priority
  unlocked content before any typography changes. Font and margins are never automatically reduced.
  Remaining overflow is reported honestly and the draft is retained.

## License and distribution

The source credits Jake Gutierrez, based on Sourabh Bajaj. MIT notices are retained in
`packages/resume/LICENSE-JAKE`, the companion package, and every generated Jake LaTeX source.
The template license does not change the private application's license or repository visibility.
Upstream notices checked at:

- https://github.com/jakegut/resume/blob/master/LICENSE
- https://github.com/sb2nov/resume/blob/master/LICENSE

## Reproduce the review

Run `npx tsx scripts/preview-jake-template.ts --warmup` from the repository root.
Warmup allows the fixed template's first-run Tectonic package downloads; omit it when cached.
The script uses explicitly synthetic approved facts, not real personal data or live AI output.
It compiles through the actual companion renderer and checks evidence, one-page status,
extracted content/order, clipping coordinates, and TeX overflow warnings. It also renders a PNG
for visual inspection. Outputs remain ignored under `private/template-review/jake/`.
Poppler is unavailable in this environment; the existing PDF.js canvas renderer provides the
visual check. The sample passed with `ready`, one page, text verified, and no warnings.

## After approval

Switch `DEFAULT_RESUME_TEMPLATE` to `jake-v1`, update the pending-approval test and documentation,
increment the distributed companion version, verify live generation/revision/PDF and LaTeX
downloads, and deploy the web and companion release together. Existing saved PDF files remain
immutable; new generations and explicit renders use the approved canonical template. Existing
companion installations need updating because rendering happens on each user's computer.
