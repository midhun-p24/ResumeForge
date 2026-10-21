import type { AgentOutput, TaskInput } from '@resumeforge/contracts';
import { AgentFailure } from './adapter';
import { contentKind, pinnedEntry, bulletCountIssues, TRIM_FLOOR_BULLETS } from './content-policy';

type Layout = {
  render: { status: string; pageCount: number; warnings: string[] };
  pageFill: number;
  shortBullets?: string[];
};
type Fitted<T> = { output: AgentOutput; rendered: T };

// Below this fill a page reads as sparse, so the model is asked for more relevant content.
const TARGET_FILL = 0.9;
const MODEL_TURNS = 2;

/** Remove only existing unlocked content: lowest-priority bullets first, then whole entries. */
export function trimLowestPriority(input: TaskInput, output: AgentOutput): AgentOutput | null {
  const next = structuredClone(output);
  const sections = [...next.resume.sections].reverse();
  const eligible = (section: AgentOutput['resume']['sections'][number]) =>
    !input.lockedSectionIds.includes(section.id);
  for (const section of sections.filter(eligible)) {
    for (const entry of [...section.entries].reverse()) {
      if (!contentKind(input, entry.sourceId) || entry.bullets.length <= TRIM_FLOOR_BULLETS)
        continue;
      const index = entry.bullets.findLastIndex((b) => !input.lockedBulletIds.includes(b.id));
      if (index < 0) continue;
      entry.bullets.splice(index, 1);
      return next;
    }
  }
  // Keep education and technical skills; remove a whole low-ranked experience/project only last.
  for (const section of sections.filter(eligible)) {
    if (section.entries.length < 2) continue;
    for (const entry of [...section.entries].reverse()) {
      const kind = input.profile.records.find((r) => r.id === entry.sourceId)?.kind;
      if (
        !['experience', 'research', 'project'].includes(kind ?? '') ||
        entry.bullets.some((b) => input.lockedBulletIds.includes(b.id))
      )
        continue;
      section.entries.splice(section.entries.indexOf(entry), 1);
      next.resume.sections = next.resume.sections.filter((s) => s.entries.length);
      return next;
    }
  }
  return null;
}

/** What still keeps a compiled candidate from a full, clean single page. */
export function layoutProblems(input: TaskInput, candidate: Fitted<Layout>): string[] {
  const { render, pageFill, shortBullets = [] } = candidate.rendered;
  if (render.status === 'overflow')
    return [
      'The resume overflowed one page. Shorten wording first, then drop the lowest-priority bullets, then lower-priority entries. Keep education and relevant skills.',
    ];
  const problems: string[] = [];
  if (shortBullets.length) {
    const texts = candidate.output.resume.sections
      .flatMap((s) => s.entries.flatMap((e) => e.bullets))
      .filter((b) => shortBullets.includes(b.id))
      .map((b) => `"${b.text.slice(0, 60)}..." (${b.id})`);
    problems.push(
      `These bullets wrap with only one to three words on their last line: ${texts.join('; ')}. Tighten each to one full line or extend it with supported detail to fill two lines.`,
    );
  }
  if (pageFill < TARGET_FILL) {
    const used = new Set(
      candidate.output.resume.sections.flatMap((s) => s.entries).map((e) => e.sourceId),
    );
    const unused = input.profile.records.filter(
      (r) =>
        r.verification === 'approved' &&
        !input.excludedSourceIds.includes(r.id) &&
        ['experience', 'research', 'project'].includes(r.kind) &&
        !used.has(r.id),
    );
    problems.push(
      `The page is only ${Math.round(pageFill * 100)}% full. Add the most relevant remaining approved content: more supported bullets for the top entries (up to four)${unused.length ? ' or the next most relevant unused records' : ''}.`,
    );
  }
  return problems;
}

const onePage = (c: Fitted<Layout>) => c.rendered.render.status !== 'overflow';
const quality = (c: Fitted<Layout>) =>
  (c.rendered.render.status === 'ready' ? 1 : 0) * 10 +
  Math.min(c.rendered.pageFill, 1) * 100 -
  (c.rendered.shortBullets?.length ?? 0) * 4;

/**
 * Compile, then spend at most two model turns on overflow, sparse pages, or short wrapped
 * lines. Never discard a valid page for a worse candidate. Trimming is the last resort.
 */
export async function fitResume<T extends Layout>(
  input: TaskInput,
  initial: AgentOutput,
  compile: (output: AgentOutput) => Promise<T>,
  revise: (input: TaskInput) => Promise<AgentOutput>,
): Promise<Fitted<T>> {
  if (input.operation === 'render') return { output: initial, rendered: await compile(initial) };
  if (bulletCountIssues(input, initial).length) throw new AgentFailure('INVALID_OUTPUT', initial);
  let candidate = initial;
  let best: Fitted<T> | null = null;
  let last: Fitted<T>;
  for (let turn = 0; ; turn++) {
    last = { output: candidate, rendered: await compile(candidate) };
    if (onePage(last) && (!best || quality(last) > quality(best))) best = last;
    const problems = layoutProblems(input, last);
    if (!problems.length || turn === MODEL_TURNS) break;
    try {
      candidate = await revise({
        ...input,
        operation: 'revise',
        priorOutput: last.output,
        revisionRequest: `${input.revisionRequest}\n${problems.join(' ')} Keep every fact, citation and lock exactly. Do not change fonts or margins.`,
      });
    } catch (error) {
      if (
        !(error instanceof AgentFailure) ||
        ['CANCELLED', 'AUTH_REQUIRED', 'USAGE_LIMIT'].includes(error.code)
      )
        throw error;
      (best ?? last).rendered.render.warnings.push(
        'Automatic content fitting stopped; retained the best compiled draft.',
      );
      break;
    }
  }
  let chosen = best ?? last;
  for (let trims = 0; chosen.rendered.render.status === 'overflow' && trims < 16; trims++) {
    const output = trimLowestPriority(input, chosen.output);
    if (!output) break;
    chosen = { output, rendered: await compile(output) };
  }
  if (
    chosen.output.resume.sections.some((s) =>
      s.entries.some((e) => pinnedEntry(input, s.id, e.bullets) && e.bullets.length > 4),
    )
  )
    chosen.output.warnings = [
      ...new Set([
        'Locked content with more than four bullets was preserved. Unlock it to let fitting shorten it.',
        ...chosen.output.warnings,
      ]),
    ].slice(0, 40);
  const used = new Set(
    chosen.output.resume.sections.flatMap((s) =>
      s.entries.flatMap((e) => [e.sourceId, ...e.bullets.flatMap((b) => b.sourceIds)]),
    ),
  );
  chosen.output.selectedSourceIds = chosen.output.selectedSourceIds.filter((id) => used.has(id));
  return chosen;
}
