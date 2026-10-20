import type { AgentOutput, TaskInput } from '@resumeforge/contracts';

export const MIN_ENTRY_BULLETS = 3;
export function contentKind(input: TaskInput, sourceId: string) {
  const kind = input.profile.records.find((r) => r.id === sourceId)?.kind;
  return kind === 'experience' || kind === 'research'
    ? 'experience'
    : kind === 'project'
      ? 'project'
      : null;
}
export function pinnedEntry(input: TaskInput, sectionId: string, bullets: { id: string }[]) {
  return (
    input.lockedSectionIds.includes(sectionId) ||
    bullets.some((b) => input.lockedBulletIds.includes(b.id))
  );
}
export function minimumBulletIssues(input: TaskInput, output: AgentOutput): string[] {
  if (input.operation === 'render') return [];
  return output.resume.sections.flatMap((s) =>
    s.entries.flatMap((e) => {
      if (!contentKind(input, e.sourceId) || pinnedEntry(input, s.id, e.bullets)) return [];
      const distinct = new Set(
        e.bullets.map((b) => b.text.toLowerCase().replace(/\W+/g, ' ').trim()),
      );
      return distinct.size != MIN_ENTRY_BULLETS || e.bullets.length != MIN_ENTRY_BULLETS
        ? [
            `Entry ${e.sourceId} needs exactly three distinct supported bullets; omit it if evidence is insufficient. Never pad or invent facts.`,
          ]
        : [];
    }),
  );
}
export function hasShallowLockedEntry(input: TaskInput, output: AgentOutput): boolean {
  return output.resume.sections.some((s) =>
    s.entries.some(
      (e) =>
        contentKind(input, e.sourceId) &&
        pinnedEntry(input, s.id, e.bullets) &&
        e.bullets.length !== MIN_ENTRY_BULLETS,
    ),
  );
}

/** Point repairs at the offending bullet without relaxing the evidence validator. */
export function numericBulletIssues(input: TaskInput, output: AgentOutput): string[] {
  const metrics = new Map(
    input.profile.records.flatMap((r) => r.metrics.map((m) => [m.id, m.value] as const)),
  );
  return output.resume.sections.flatMap((s) =>
    s.entries.flatMap((e) =>
      e.bullets.flatMap((b) => {
        const supported = b.metricIds.flatMap(
          (id) => (metrics.get(id) ?? '').match(/\d[\d,.]*/g) ?? [],
        );
        const missing = (b.text.match(/\d[\d,.]*/g) ?? []).filter((n) => !supported.includes(n));
        return missing.length
          ? [
              `Bullet ${b.id} in source ${e.sourceId} has uncited numeric tokens: ${[...new Set(missing)].join(', ')}. Use an approved metric citation or remove the numeric wording without inventing a claim.`,
            ]
          : [];
      }),
    ),
  );
}
