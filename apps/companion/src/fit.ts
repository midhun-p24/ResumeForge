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
    const steps = Math.max(1, queues.experience.length, queues.project.length);
    for (let step = 0; step < steps; step++) {
      for (const kind of ['experience', 'project'] as const)
        if (queues[kind][step]) selected.add(queues[kind][step]);
      const output = structuredClone(candidate);
      if (hasShallowLockedEntry(input, output))
        output.warnings = [
          ...new Set([
            'Locked legacy content does not have exactly three bullets per entry and was preserved. Unlock it to revise under the new policy.',
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
      // Reserve space for substantive entries before retaining a fourth skills category.
      if (current.rendered.render.status === 'overflow') {
        const compact = structuredClone(output);
        let changed = false;
        for (const section of compact.resume.sections) {
          if (
            !section.entries.every(
              (e) => input.profile.records.find((r) => r.id === e.sourceId)?.kind === 'skill',
            )
          )
            continue;
          for (const entry of [...section.entries].reverse()) {
            if (section.entries.length <= 3) break;
            if (pinnedEntry(input, section.id, entry.bullets)) continue;
            section.entries.splice(section.entries.indexOf(entry), 1);
            changed = true;
          }
        }
        if (changed) current = { output: compact, rendered: await compile(compact) };
      }
      // Try the whole next pair before trimming anything. Compression gets the full
      // overflowing candidate, so a sparse retained page cannot hide missing records.
      if (current.rendered.render.status !== 'ready')
        return { current, retained, overflowed: current.rendered.render.status === 'overflow' };
      retained = current;
    }
    return { current: retained!, retained, overflowed: false };
  }
  let attempt = await buildIncrementally(initial);
  let best = attempt.retained;
  const counts = (output: AgentOutput) => {
    const entries = output.resume.sections.flatMap((s) => s.entries);
    return ['experience', 'project'].map(
      (kind) => entries.filter((e) => contentKind(input, e.sourceId) === kind).length,
    );
  };
  const quality = (candidate: { output: AgentOutput; rendered: T }) => {
    const sizes = counts(candidate.output);
    return (
      Math.min(...sizes) * 1000 +
      sizes.reduce((a, b) => a + b, 0) * 10 +
      candidate.rendered.pageFill
    );
  };
  for (let turn = 0; turn < 2; turn++) {
    const enough = best && counts(best.output).every((n) => n >= 3);
    if (enough) break;
    const instruction = `Rank ALL eligible experience/research and projects independently and return the full candidate pool. Target at least three of each with EXACTLY three distinct supported bullets per entry. The next candidate ${attempt.overflowed ? 'overflowed the page' : 'did not supply three entries per category'}. Compress bullet wording to 12-18 words each, preserving the specific contribution, concrete method and supported outcome. Remove redundant context and repeated technology lists; aim for a mix of one-line and two-line bullets. Select three relevant skill categories if needed to reserve room for the six core entries. Preserve facts and selective emphasis. No coursework, filler or repeated claims. Keep education and relevant skills. Do not change fonts or margins. Explain any evidence shortage in warnings.`;
    try {
      const output = await revise({
        ...input,
        operation: 'revise',
        priorOutput: attempt.current.output,
        revisionRequest: `${input.revisionRequest}\n${instruction} Preserve every lock exactly.`,
      });
      attempt = await buildIncrementally(output);
      if (attempt.retained && (!best || quality(attempt.retained) > quality(best)))
        best = attempt.retained;
    } catch (error) {
      if (
        !(error instanceof AgentFailure) ||
        ['CANCELLED', 'AUTH_REQUIRED', 'USAGE_LIMIT'].includes(error.code)
      )
        throw error;
      (best ?? attempt.current).rendered.render.warnings.push(
        'Automatic content fitting stopped; retained the best compiled draft.',
      );
      break;
    }
  }
  // Only after concise revisions fail, remove whole low-priority entries.
  let chosen = best ?? attempt.current;
  while (chosen.rendered.render.status === 'overflow' && trims++ < 16) {
    const output = trimLowestPriority(input, chosen.output);
    if (!output) break;
    chosen = { output, rendered: await compile(output) };
  }
  if (counts(chosen.output).some((n) => n < 3)) {
    const warning =
      'The three-experience / three-project target was not met within verified evidence and a readable single page. Review source coverage and the omitted lower-priority records.';
    chosen.output.warnings = [...new Set([warning, ...chosen.output.warnings])].slice(0, 40);
    chosen.rendered.render.warnings.push(warning);
  }
  const used = new Set(
    chosen.output.resume.sections.flatMap((s) =>
      s.entries.flatMap((e) => [e.sourceId, ...e.bullets.flatMap((b) => b.sourceIds)]),
    ),
  );
  chosen.output.selectedSourceIds = chosen.output.selectedSourceIds.filter((id) => used.has(id));
  return chosen;
}
