import type { AgentOutput, TaskInput } from '@resumeforge/contracts';
import { AgentFailure } from './adapter';

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
      if (entry.bullets.length < 2) continue;
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
  let current = { output: initial, rendered: await compile(initial) };
  if (input.operation === 'render') return current;
  let trims = 0;
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
      ? `The draft is ${current.rendered.render.pageCount} pages. Shorten lower-priority unlocked bullets or remove the least relevant unlocked content until one page fits. Preserve the strongest evidence and substantive technical skills.`
      : `The compiled draft uses only ${Math.round(current.rendered.pageFill * 100)}% of usable page height. Fill remaining space with distinct supported accomplishments for the strongest selected experience/projects, then the next most relevant approved record. Populate approved technical skills. Omit coursework. Do not pad, repeat, invent, or alter font size/margins.`;
    try {
      const output = await revise({
        ...input,
        operation: 'revise',
        priorOutput: current.output,
        revisionRequest: `${input.revisionRequest}\n${instruction} Preserve every lock exactly.`,
      });
      current = { output, rendered: await compile(output) };
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
  return best ?? current;
}
