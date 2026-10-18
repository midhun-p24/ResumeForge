# Current limitations

- Hosted Supabase auth/storage/pairing and the complete signed-in browser workflow require
  project credentials and have not been live-verified. PGlite tests actual SQL with auth/storage
  stubs; it does not verify mail, PostgREST, or the hosted Storage service.
- Vercel auth exists, but external integration/deployment requires approval for the specific team.
  No hosted app URL is verified yet.
- Manual profile entry and pasted reference text work. PDF/DOCX fact import and portfolio/posting
  URL extraction are not implemented; saved URLs are references only.
- The original compatible LaTeX default is inspired by Jake's layout, not the exact preferred
  approved source. A replacement requires source/license review.
- PDF parseability, page count, expected extracted text/order, coordinates, and TeX overflow logs
  are checked. Human visual/factual review remains necessary; these heuristics cannot guarantee truth.
- Numeric validation is conservative, including numeric technology names. Every numeric bullet
  token needs a cited approved metric. Metric existence does not prove contextual correctness.
- Compiler inputs, packages, output/log size, and execution time are bounded. There is no portable
  hard RAM/CPU quota on all supported OSes. Add OS/container isolation before hostile public use.
  Codex managed settings/future feature flags also require upgrade tests.
- Schema-valid failed outputs can be retained privately; completely malformed raw responses are
  discarded. There is no raw-output recovery editor.
- Workspace reads cap tasks at 100 and other collections at 500; heavy use needs pagination.
  Export is JSON and artifact metadata, not an automatic archive of all PDFs.
- SQL and Storage do not share a transaction. Crashes can leave orphan files. Maintenance must
  remove objects absent from metadata. Account deletion removes registered artifacts/records;
  crash-orphaned files need maintenance.
- Expired pairing/rate rows need cleanup. Non-Vercel proxies must validate trusted IP forwarding
  before treating client IP headers as an abuse-control boundary.
- CSP allows inline scripts/styles and eval for development compatibility. Adopt nonce-based
  production CSP before a broad release. Browser auth uses Supabase token persistence; keep
  dependencies patched and never render untrusted HTML.
- Focus visibility and keyboard navigation exist; the sign-in dialog still needs a full focus-trap
  and Escape audit before public accessibility certification.
- One active task per device, one real provider. No automatic applications, provider marketplace,
  collaborative editing, or extra services are implemented.

No paid resources were provisioned. All live model/PDF checks use explicitly synthetic inputs.
