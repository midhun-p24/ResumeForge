import { readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { Profile, RenderStatus, VersionOutput } from '@resumeforge/contracts';
import { renderLatex } from '@resumeforge/resume';
import type { ResumeTemplateId } from '@resumeforge/resume';
import { execFile, localEnvironment } from './process';
import { AgentFailure } from './adapter';
import {
  headingCollisions,
  shortWrappedLines,
  textLines,
  wrappedSkillRows,
  type TextItem,
} from './layout';

export const tectonicPath = () => {
  const bundled = fileURLToPath(
    new URL(
      `../../../private/tools/tectonic${process.platform === 'win32' ? '.exe' : ''}`,
      import.meta.url,
    ),
  );
  const sourceCheckout = import.meta.url.replaceAll('\\', '/').includes('/apps/companion/src/');
  return (
    process.env.RESUMEFORGE_TECTONIC_PATH ||
    (sourceCheckout && existsSync(bundled) ? bundled : 'tectonic')
  );
};
const normalize = (s: string) =>
  s
    .normalize('NFKC')
    .replace(/[\s\u00ad]+/g, '')
    .replace(/[‐‑–—]/g, '-')
    .replace(/-{2,3}/g, '-')
    .replace(/[‘’`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\*\*/g, '');
export type Compiled = {
  pdf: Buffer;
  render: RenderStatus;
  pageFill: number;
  /** v2 bullets whose last printed line holds only a few words. */
  shortBullets: string[];
  /** The words printed on each short last line, aligned with `shortBullets`. */
  shortTails: string[];
  /** v2 entry headings that run into their right-aligned date. */
  headingCollisions: string[];
  /** v2 skills categories whose row wraps onto a second line. */
  wrappedSkills: string[];
  /** Printed lines beyond the first page. */
  overflowLines: number;
};
export async function compileResume(
  profile: Profile,
  output: VersionOutput,
  workspace: string,
  signal: AbortSignal,
  onStage: (s: 'Rendering PDF' | 'Checking layout') => Promise<void>,
  allowDownload = false,
  template?: ResumeTemplateId,
): Promise<Compiled> {
  await onStage('Rendering PDF');
  const source = join(workspace, 'Resume.tex');
  await writeFile(source, renderLatex(profile, output, template), { mode: 0o600 });
  const run = async () => {
    try {
      return await execFile(
        tectonicPath(),
        [
          '-X',
          'compile',
          '--untrusted',
          '--keep-logs',
          ...(allowDownload ? [] : ['--only-cached']),
          source,
        ],
        {
          cwd: workspace,
          signal,
          timeout: 60000,
          env: { ...localEnvironment(), TECTONIC_UNTRUSTED_MODE: '1' },
        },
      );
    } catch (e) {
      throw new AgentFailure(
        (e as NodeJS.ErrnoException).code === 'ENOENT'
          ? 'COMPILER_MISSING'
          : signal.aborted
            ? 'CANCELLED'
            : /TIMEOUT/.test(String(e))
              ? 'TIMEOUT'
              : 'COMPILE_FAILED',
        output,
      );
    }
  };
  let result = await run();
  // A failed run can be transient on Windows (a PDF still held open); retry once before failing.
  if (result.code !== 0) {
    await new Promise((resolve) => setTimeout(resolve, 750));
    result = await run();
  }
  if (result.code !== 0) {
    let log = '';
    try {
      log = await readFile(join(workspace, 'Resume.log'), 'utf8');
    } catch {
      /* compiler can omit logs */
    }
    const errors = [
      ...log.split(/\r?\n/).filter((line) => line.startsWith('!')),
      ...`${result.stderr}`.split(/\r?\n/).filter((line) => /error/i.test(line)),
    ];
    throw new AgentFailure(
      'COMPILE_FAILED',
      output,
      undefined,
      errors.slice(0, 3).map((line) => line.slice(0, 200)),
    );
  }
  const path = join(workspace, 'Resume.pdf');
  if ((await stat(path)).size > 2097152) throw new AgentFailure('COMPILE_FAILED', output);
  const pdf = await readFile(path);
  const doc = await PDFDocument.load(pdf);
  const pageCount = doc.getPageCount();
  await onStage('Checking layout');
  const warnings: string[] = [];
  let extracted = '';
  let clipped = false;
  let bottom = Infinity;
  let firstPageHeight = 792;
  const firstPage: TextItem[] = [];
  const laterPages: TextItem[] = [];
  const loading = getDocument({ data: new Uint8Array(pdf), useSystemFonts: true });
  const parsed = await loading.promise;
  for (let n = 1; n <= parsed.numPages; n++) {
    const page = await parsed.getPage(n);
    if (n === 1) firstPageHeight = page.view[3] - page.view[1];
    const content = await page.getTextContent();
    for (const item of content.items)
      if ('str' in item) {
        if (n === 1 && item.str.trim()) bottom = Math.min(bottom, item.transform[5]);
        extracted += item.str + ' ';
        const x = item.transform[4],
          y = item.transform[5];
        // Later pages are offset downward so their lines never merge with each other.
        if (n === 1) firstPage.push({ str: item.str, x, y, width: item.width });
        else laterPages.push({ str: item.str, x, y: y - n * 1000, width: item.width });
        if (x < 25 || y < 24 || x + item.width > page.view[2] - 25 || y > page.view[3] - 24)
          clipped = true;
      }
  }
  await loading.destroy();
  const v2 = output.schemaVersion === 2 ? output : null;
  const expected = [
    profile.contact.name,
    ...(output.schemaVersion === 2
      ? output.sections.flatMap((s) => [
          s.title,
          ...s.entries.flatMap((e) => [e.heading, ...e.bullets]),
          ...s.skills.map((k) => k.category),
        ])
      : output.resume.sections.flatMap((s) => [
          s.title,
          ...s.entries.flatMap((e) => [
            profile.records.find((r) => r.id === e.sourceId)!.title,
            ...(profile.records.find((r) => r.id === e.sourceId)!.kind === 'skill'
              ? profile.records.find((r) => r.id === e.sourceId)!.technologies
              : []),
            ...e.bullets.map((b) => b.text),
          ]),
        ])),
  ].filter(Boolean);
  let cursor = 0;
  const flat = normalize(extracted);
  let textVerified = true;
  for (const text of expected) {
    const found = flat.indexOf(normalize(text), cursor);
    if (found === -1) {
      textVerified = false;
      break;
    }
    cursor = found + normalize(text).length;
  }
  let log = '';
  try {
    log = await readFile(join(workspace, 'Resume.log'), 'utf8');
  } catch {
    /* compiler can omit logs */
  }
  if (/Overfull \\[hv]box/.test(log)) clipped = true;
  if (clipped) warnings.push('Possible clipping or overflow detected. Review the PDF.');
  if (!textVerified)
    warnings.push('Expected text or reading order was not verified. Review the PDF.');
  if (pageCount !== 1)
    warnings.push(
      `Resume is ${pageCount} pages. Shorten content; font and margins were not reduced.`,
    );
  const onePage = v2 && pageCount === 1;
  const short = onePage
    ? shortWrappedLines(
        firstPage,
        v2.sections.flatMap((s) => s.entries.flatMap((e) => e.bullets)),
      )
    : [];
  const shortBullets = short.map((s) => s.bullet);
  const wrappedSkills = onePage
    ? wrappedSkillRows(
        firstPage,
        v2.sections.flatMap((s) => s.skills.map((k) => k.category)),
      )
    : [];
  const collisions = v2
    ? headingCollisions(
        firstPage,
        v2.sections.flatMap((s) => s.entries.map((e) => e.heading)),
      )
    : [];
  if (shortBullets.length)
    warnings.push(
      `${shortBullets.length} bullet(s) wrap with only a few words on the last line. Consider tightening them.`,
    );
  if (collisions.length) {
    clipped = true;
    warnings.push(`Heading runs into its date: ${collisions.join(', ')}. Review the PDF.`);
  }
  // The template uses 0.4in top and bottom margins.
  return {
    pdf,
    shortBullets,
    shortTails: short.map((s) => s.tail),
    wrappedSkills,
    headingCollisions: collisions,
    overflowLines: textLines(laterPages).length,
    pageFill: Number.isFinite(bottom)
      ? Math.min(1, Math.max(0, (firstPageHeight - 28.8 - bottom) / (firstPageHeight - 57.6)))
      : 0,
    render: {
      status: pageCount > 1 ? 'overflow' : clipped || !textVerified ? 'review_required' : 'ready',
      pageCount,
      textVerified,
      warnings,
    },
  };
}
