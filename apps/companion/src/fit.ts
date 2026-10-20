import type { AgentOutput, TaskInput } from '@resumeforge/contracts';
import { AgentFailure } from './adapter';
import {
  contentKind,
  pinnedEntry,
  minimumBulletIssues,
  MIN_ENTRY_BULLETS,
  hasShallowLockedEntry,
} from './content-policy';

type Layout = {
  render: { status: string; pageCount: number; warnings: string[] };
  pageFill: number;
};
/** Remove only existing unlocked content, preferring to retain every ranked entry. */
export function trimLowestPriority(input: TaskInput, output: AgentOutput): AgentOutput | null {
  const next = structuredClone(output);
  const sections = [...next.resume.sections].reverse();
  const eligible = (section: AgentOutput['resume']['sections'][number]) =>
    !input.lockedSectionIds.includes(section.id);
  for (const section of sections.filter(eligible)) {
    for (const entry of [...section.entries].reverse()) {
      if (!contentKind(input, entry.sourceId) || entry.bullets.length <= MIN_ENTRY_BULLETS)
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
/** At most two additional model turns. Never discard a valid page for a worse candidate. */
export async function fitResume<T extends Layout>(
  input: TaskInput,
  initial: AgentOutput,
  compile: (output: AgentOutput) => Promise<T>,
  revise: (input: TaskInput) => Promise<AgentOutput>,
): Promise<{ output: AgentOutput; rendered: T }> {
  if (input.operation === 'render') return { output: initial, rendered: await compile(initial) };
  if (minimumBulletIssues(input, initial).length) throw new AgentFailure('INVALID_OUTPUT', initial);
  let trims = 0;
  async function buildIncrementally(candidate: AgentOutput) {
    if (minimumBulletIssues(input, candidate).length)
      throw new AgentFailure('INVALID_OUTPUT', candidate);
    const queues = { experience: [] as string[], project: [] as string[] };
    for (const section of candidate.resume.sections)
      for (const entry of section.entries) {
        const kind = contentKind(input, entry.sourceId);
        if (kind && !pinnedEntry(input, section.id, entry.bullets))
          queues[kind].push(entry.sourceId);
      }
    const selected = new Set<string>();
    let retained: { output: AgentOutput; rendered: T } | null = null;
    const steps = Math.min(6, Math.max(1, queues.experience.length, queues.project.length));
    for (let step = 0; step < steps; step++) {
      for (const kind of ['experience', 'project'] as const)
        if (queues[kind][step]) selected.add(queues[kind][step]);
      const output = structuredClone(candidate);
      if (hasShallowLockedEntry(input, output))
        output.warnings = [
          ...new Set([
            'Locked legacy content has fewer than three bullets per entry and was preserved. Unlock it to revise under the new minimum.',
            ...output.warnings,
          ]),
        ].slice(0, 40);
      output.resume.sections = output.resume.sections
        .map((section) => ({
          ...section,
          entries: section.entries.filter(
            (entry) =>
              !contentKind(input, entry.sourceId) ||
              pinnedEntry(input, section.id, entry.bullets) ||
              selected.has(entry.sourceId),
          ),
        }))
        .filter((s) => s.entries.length);
      let current = { output, rendered: await compile(output) };
      while (current.rendered.render.status === 'overflow' && trims < 16) {
        const trimmed = trimLowestPriority(input, current.output);
        if (!trimmed) break;
        trims++;
        current = { output: trimmed, rendered: await compile(trimmed) };
      }
      if (current.rendered.render.status !== 'ready') return retained ?? current;
      if (!retained || current.rendered.pageFill > retained.rendered.pageFill) retained = current;
      if (current.rendered.pageFill >= 0.9) break;
    }
    return retained!;
  }
  let current = await buildIncrementally(initial);
  async function fitOverflow() {
    while (current.rendered.render.status === 'overflow' && trims < 16) {
      const output = trimLowestPriority(input, current.output);
      if (!output) break;
      trims++;
      current = { output, rendered: await compile(output) };
    }
  }
  await fitOverflow();
  let best = current.rendered.render.status === 'ready' ? current : null;
  for (let turn = 0; turn < 2; turn++) {
    const overflow = current.rendered.render.status === 'overflow';
    if (
      !overflow &&
      (current.rendered.render.status !== 'ready' || current.rendered.pageFill >= 0.9)
    )
      break;
    const instruction = overflow
      ? `The draft is ${current.rendered.render.pageCount} pages. Shorten wording or remove whole lower-priority unlocked entries. Keep at least three substantive supported bullets per experience/project; never cut an entry below three to fit. Preserve strongest evidence, education and skills.`
      : `The compiled draft uses only ${Math.round(current.rendered.pageFill * 100)}% of usable page height. Strengthen supported bullets, then propose the next most relevant experience and next project, one of each at a time. Every included experience/project needs at least three distinct supported bullets. Populate approved technical skills; omit coursework. Do not pad, repeat, invent, or alter font size/margins.`;
    try {
      const output = await revise({
        ...input,
        operation: 'revise',
        priorOutput: current.output,
        revisionRequest: `${input.revisionRequest}\n${instruction} Preserve every lock exactly.`,
      });
      current = await buildIncrementally(output);
      await fitOverflow();
      if (
        current.rendered.render.status === 'ready' &&
        (!best || current.rendered.pageFill > best.rendered.pageFill)
      )
        best = current;
    } catch (error) {
      if (
        !(error instanceof AgentFailure) ||
        ['CANCELLED', 'AUTH_REQUIRED', 'USAGE_LIMIT'].includes(error.code)
      )
        throw error;
      (best ?? current).rendered.render.warnings.push(
        'Automatic content fitting stopped; retained the best compiled draft.',
      );
      break;
    }
  }
  const chosen = best ?? current;
  const used = new Set(
    chosen.output.resume.sections.flatMap((s) =>
      s.entries.flatMap((e) => [e.sourceId, ...e.bullets.flatMap((b) => b.sourceIds)]),
    ),
  );
  chosen.output.selectedSourceIds = chosen.output.selectedSourceIds.filter((id) => used.has(id));
  return chosen;
}
