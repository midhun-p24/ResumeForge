import { readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { AgentOutput, Profile, RenderStatus } from '@resumeforge/contracts';
import { renderLatex } from '@resumeforge/resume';
import { execFile, localEnvironment } from './process';
import { AgentFailure } from './adapter';

export const tectonicPath = () => process.env.RESUMEFORGE_TECTONIC_PATH || 'tectonic';
const normalize = (s: string) =>
  s
    .normalize('NFKC')
    .replace(/[\s\u00ad]+/g, '')
    .replace(/[‐‑–—]/g, '-');
export async function compileResume(
  profile: Profile,
  output: AgentOutput,
  workspace: string,
  signal: AbortSignal,
  onStage: (s: 'Rendering PDF' | 'Checking layout') => Promise<void>,
  allowDownload = false,
): Promise<{ pdf: Buffer; render: RenderStatus }> {
  await onStage('Rendering PDF');
  const source = join(workspace, 'resume.tex');
  await writeFile(source, renderLatex(profile, output), { mode: 0o600 });
  let result;
  try {
    result = await execFile(
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
  if (result.code !== 0) throw new AgentFailure('COMPILE_FAILED', output);
  const path = join(workspace, 'resume.pdf');
  if ((await stat(path)).size > 2097152) throw new AgentFailure('COMPILE_FAILED', output);
  const pdf = await readFile(path);
  const doc = await PDFDocument.load(pdf);
  const pageCount = doc.getPageCount();
  await onStage('Checking layout');
  const warnings: string[] = [];
  let extracted = '';
  let clipped = false;
  const loading = getDocument({ data: new Uint8Array(pdf), useSystemFonts: true });
  const parsed = await loading.promise;
  for (let n = 1; n <= parsed.numPages; n++) {
    const page = await parsed.getPage(n);
    const content = await page.getTextContent();
    for (const item of content.items)
      if ('str' in item) {
        extracted += item.str + ' ';
        const x = item.transform[4],
          y = item.transform[5];
        if (x < 25 || y < 24 || x + item.width > page.view[2] - 25 || y > page.view[3] - 24)
          clipped = true;
      }
  }
  await loading.destroy();
  const expected = [
    profile.contact.name,
    ...output.resume.sections.flatMap((s) => [
      s.title,
      ...s.entries.flatMap((e) => [
        profile.records.find((r) => r.id === e.sourceId)!.title,
        ...e.bullets.map((b) => b.text),
      ]),
    ]),
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
    log = await readFile(join(workspace, 'resume.log'), 'utf8');
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
  return {
    pdf,
    render: {
      status: pageCount > 1 ? 'overflow' : clipped || !textVerified ? 'review_required' : 'ready',
      pageCount,
      textVerified,
      warnings,
    },
  };
}
