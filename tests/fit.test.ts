import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { fitResume, trimLowestPriority } from '../apps/companion/src/fit';
import { minimumBulletIssues } from '../apps/companion/src/content-policy';
import { validateEvidence, type AgentOutput } from '@resumeforge/contracts';
import { fixture } from './fixtures';

const layout = (pageFill: number, status = 'ready') => ({
  pageFill,
  render: { status, pageCount: status === 'overflow' ? 2 : 1, warnings: [] as string[] },
});
function pool() {
  const { input, output } = fixture();
  const base = input.profile.records[0];
  input.profile.records = [];
  output.selectedSourceIds = [];
  output.resume.sections = [];
  for (const kind of ['experience', 'project'] as const) {
    const entries = [];
    for (let n = 0; n < 3; n++) {
      const id = kind === 'experience' && n === 0 ? base.id : randomUUID();
      input.profile.records.push({ ...base, id, kind, metrics: [] });
      output.selectedSourceIds.push(id);
      entries.push({
        sourceId: id,
        bullets: [
          'Designed a TypeScript task queue.',
          'Tested retry behavior using PostgreSQL.',
          'Reduced duplicate task processing.',
        ].map((text) => ({ id: randomUUID(), text, sourceIds: [id], metricIds: [] })),
      });
    }
    output.resume.sections.push({ id: randomUUID(), title: kind, entries });
  }
  return { input, output };
}
it('builds one experience and one project at a time, retaining three bullets each', async () => {
  const { input, output } = pool();
  const counts: number[][] = [];
  const compile = vi.fn(async (candidate: AgentOutput) => {
    counts.push(candidate.resume.sections.map((s) => s.entries.length));
    return layout(counts.length === 1 ? 0.6 : 0.94);
  });
  const revise = vi.fn();
  const result = await fitResume(input, output, compile, revise);
  expect(counts).toEqual([
    [1, 1],
    [2, 2],
  ]);
  expect(revise).not.toHaveBeenCalled();
  expect(minimumBulletIssues(input, result.output)).toEqual([]);
  expect(validateEvidence(input, result.output)).toEqual([]);
});
it('never trims an entry below three bullets and keeps education/skills intact', () => {
  const { input, output } = pool();
  const entry = output.resume.sections[1].entries[2];
  entry.bullets.push({ ...entry.bullets[0], id: randomUUID(), text: 'Documented the task queue.' });
  const trimmed = trimLowestPriority(input, output)!;
  expect(trimmed.resume.sections[1].entries[2].bullets).toHaveLength(3);
  const next = trimLowestPriority(input, trimmed)!;
  expect(next.resume.sections[1].entries).toHaveLength(2);
  expect(next.resume.sections.flatMap((s) => s.entries).every((e) => e.bullets.length >= 3)).toBe(
    true,
  );
  expect(validateEvidence(input, next)).toEqual([]);
});
it('rejects shallow or repeated bullets instead of accepting filler', async () => {
  const { input, output } = pool();
  output.resume.sections[0].entries[0].bullets.pop();
  expect(minimumBulletIssues(input, output)).toHaveLength(1);
  await expect(fitResume(input, output, async () => layout(0.95), vi.fn())).rejects.toMatchObject({
    code: 'INVALID_OUTPUT',
  });
  const { input: i, output: o } = pool();
  const e = o.resume.sections[0].entries[0];
  e.bullets[1].text = e.bullets[0].text;
  expect(minimumBulletIssues(i, o)).toHaveLength(1);
});
it('keeps locked legacy entries unchanged and does not rewrite manual renders', async () => {
  const { input, output } = fixture();
  input.operation = 'render';
  input.priorOutput = output;
  const revise = vi.fn();
  const result = await fitResume(input, output, async () => layout(0.5), revise);
  expect(result.output).toBe(output);
  expect(revise).not.toHaveBeenCalled();
  input.operation = 'revise';
  input.lockedSectionIds = [output.resume.sections[0].id];
  expect(minimumBulletIssues(input, output)).toEqual([]);
  expect(trimLowestPriority(input, output)).toBeNull();
  const locked = await fitResume(input, output, async () => layout(0.95), revise);
  expect(locked.output.resume).toEqual(output.resume);
  expect(locked.output.warnings.join(' ')).toContain('Locked legacy content');
});
it('preserves locked bullets, source exclusions and provenance through fitting', async () => {
  const { input, output } = pool();
  input.operation = 'revise';
  input.priorOutput = structuredClone(output);
  const section = output.resume.sections[0];
  input.lockedSectionIds = [section.id];
  input.excludedSourceIds = [randomUUID()];
  const revise = vi.fn().mockImplementation(async (snapshot) => {
    expect(snapshot.excludedSourceIds).toEqual(input.excludedSourceIds);
    return output;
  });
  const result = await fitResume(input, output, async () => layout(0.95), revise);
  expect(result.output.resume.sections.find((s) => s.id === section.id)).toEqual(section);
  expect(validateEvidence(input, result.output)).toEqual([]);
});
it('retains the best clean page when another pair overflows with locked content', async () => {
  const { input, output } = pool();
  input.operation = 'revise';
  input.priorOutput = structuredClone(output);
  for (const s of output.resume.sections)
    for (const e of s.entries) input.lockedBulletIds.push(...e.bullets.map((b) => b.id));
  const original = layout(0.7);
  const compile = vi.fn().mockResolvedValueOnce(original).mockResolvedValue(layout(1, 'overflow'));
  const result = await fitResume(input, output, compile, async () => output);
  expect(result.rendered).toBe(original);
  expect(result.output).toEqual(output);
});
