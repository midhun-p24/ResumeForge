import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { fitResume, trimLowestPriority } from '../apps/companion/src/fit';
import { bulletCountIssues, numericBulletIssues } from '../apps/companion/src/content-policy';
import { shortWrappedBullets } from '../apps/companion/src/layout';
import { validateEvidence, type AgentOutput, type TaskInput } from '@resumeforge/contracts';
import { fixture } from './fixtures';

const layout = (pageFill: number, status = 'ready', shortBullets: string[] = []) => ({
  pageFill,
  shortBullets,
  render: { status, pageCount: status === 'overflow' ? 2 : 1, warnings: [] as string[] },
});
const texts = [
  'Designed a TypeScript task queue.',
  'Tested retry behavior using PostgreSQL.',
  'Reduced duplicate task processing.',
  'Documented the task queue for operators.',
];
function pool(count = 3, bullets = 3) {
  const { input, output } = fixture();
  const base = input.profile.records[0];
  input.profile.records = [];
  output.selectedSourceIds = [];
  output.resume.sections = [];
  for (const kind of ['experience', 'project'] as const) {
    const entries = [];
    for (let n = 0; n < count; n++) {
      const id = kind === 'experience' && n === 0 ? base.id : randomUUID();
      input.profile.records.push({ ...base, id, kind, metrics: [] });
      output.selectedSourceIds.push(id);
      entries.push({
        sourceId: id,
        bullets: texts
          .slice(0, bullets)
          .map((text) => ({ id: randomUUID(), text, sourceIds: [id], metricIds: [] })),
      });
    }
    output.resume.sections.push({ id: randomUUID(), title: kind, entries });
  }
  return { input, output };
}
const entryCounts = (o: AgentOutput) => o.resume.sections.map((s) => s.entries.length);

it('accepts one to four distinct bullets and rejects empty, padded or repeated entries', () => {
  const { input, output } = pool();
  const [first, second] = output.resume.sections[0].entries;
  first.bullets = first.bullets.slice(0, 1);
  second.bullets.push({ ...second.bullets[0], id: randomUUID(), text: texts[3] });
  expect(bulletCountIssues(input, output)).toEqual([]);
  second.bullets.push({ ...second.bullets[0], id: randomUUID(), text: 'Wrote runbooks.' });
  expect(bulletCountIssues(input, output)).toHaveLength(1);
  const { input: i, output: o } = pool();
  o.resume.sections[0].entries[0].bullets = [];
  o.resume.sections[1].entries[0].bullets[1].text = texts[0];
  expect(bulletCountIssues(i, o)).toHaveLength(2);
});

it('accepts a full, clean first page without spending model turns', async () => {
  const { input, output } = pool();
  const compile = vi.fn(async () => layout(0.95));
  const revise = vi.fn();
  const result = await fitResume(input, output, compile, revise);
  expect(compile).toHaveBeenCalledTimes(1);
  expect(revise).not.toHaveBeenCalled();
  expect(entryCounts(result.output)).toEqual([3, 3]);
  expect(validateEvidence(input, result.output)).toEqual([]);
});

it('rejects invalid bullet counts instead of accepting filler', async () => {
  const { input, output } = pool(3, 4);
  output.resume.sections[0].entries[0].bullets.push({
    ...output.resume.sections[0].entries[0].bullets[0],
    id: randomUUID(),
    text: 'Wrote runbooks.',
  });
  await expect(fitResume(input, output, async () => layout(0.95), vi.fn())).rejects.toMatchObject({
    code: 'INVALID_OUTPUT',
  });
});

it('asks for more relevant content when the page is sparse and keeps the fuller page', async () => {
  const { input, output } = pool(2);
  const fuller = pool(3).output;
  const revise = vi.fn<(snapshot: TaskInput) => Promise<AgentOutput>>(async () => fuller);
  const compile = vi.fn(async (o: AgentOutput) =>
    layout(o.resume.sections[0].entries.length === 3 ? 0.96 : 0.7),
  );
  const result = await fitResume(input, output, compile, revise);
  expect(revise).toHaveBeenCalledTimes(1);
  expect(revise.mock.calls[0][0].revisionRequest).toContain('70% full');
  expect(revise.mock.calls[0][0].operation).toBe('revise');
  expect(result.output).toBe(fuller);
});

it('asks the model to shorten overflow, then trims bullets before whole entries', async () => {
  const { input, output } = pool(3, 4);
  const revise = vi.fn(async () => output);
  const compile = vi.fn(async (o: AgentOutput) => {
    const bullets = o.resume.sections.flatMap((s) => s.entries).flatMap((e) => e.bullets).length;
    return layout(0.99, bullets > 20 ? 'overflow' : 'ready');
  });
  const result = await fitResume(input, output, compile, revise);
  expect(revise).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(revise.mock.calls[0])).toContain('Shorten wording first');
  expect(result.rendered.render.status).toBe('ready');
  expect(entryCounts(result.output)).toEqual([3, 3]);
  expect(
    result.output.resume.sections.flatMap((s) => s.entries).every((e) => e.bullets.length >= 2),
  ).toBe(true);
});

it('names short wrapped bullets so the model can tighten them', async () => {
  const { input, output } = pool();
  const target = output.resume.sections[0].entries[1].bullets[0];
  const revise = vi.fn(async () => output);
  let calls = 0;
  const result = await fitResume(
    input,
    output,
    async () => (calls++ ? layout(0.95) : layout(0.95, 'ready', [target.id])),
    revise,
  );
  expect(JSON.stringify(revise.mock.calls[0])).toContain(target.id);
  expect(result.rendered.shortBullets).toEqual([]);
});

it('retains the best clean page when a revision overflows', async () => {
  const { input, output } = pool();
  const original = layout(0.8);
  const compile = vi.fn().mockResolvedValueOnce(original).mockResolvedValue(layout(1, 'overflow'));
  const revised = structuredClone(output);
  const result = await fitResume(input, output, compile, async () => revised);
  expect(result.rendered).toBe(original);
  expect(result.output).toBe(output);
});

it('never trims below two bullets before removing a low-ranked entry', () => {
  const { input, output } = pool(3, 3);
  const trimmed = trimLowestPriority(input, output)!;
  expect(trimmed.resume.sections[1].entries[2].bullets).toHaveLength(2);
  let next = trimmed;
  for (let i = 0; i < 5; i++) next = trimLowestPriority(input, next)!;
  expect(next.resume.sections.flatMap((s) => s.entries).every((e) => e.bullets.length === 2)).toBe(
    true,
  );
  next = trimLowestPriority(input, next)!;
  expect(entryCounts(next)).toEqual([3, 2]);
  expect(validateEvidence(input, next)).toEqual([]);
});

it('does not rewrite manual renders', async () => {
  const { input, output } = fixture();
  input.operation = 'render';
  input.priorOutput = output;
  const revise = vi.fn();
  const result = await fitResume(input, output, async () => layout(0.5), revise);
  expect(result.output).toBe(output);
  expect(revise).not.toHaveBeenCalled();
});

it('preserves locked content, source exclusions and provenance through fitting', async () => {
  const { input, output } = pool();
  input.operation = 'revise';
  input.priorOutput = structuredClone(output);
  const section = output.resume.sections[0];
  input.lockedSectionIds = [section.id];
  input.excludedSourceIds = [randomUUID()];
  const revise = vi.fn().mockImplementation(async (snapshot) => {
    expect(snapshot.excludedSourceIds).toEqual(input.excludedSourceIds);
    expect(snapshot.revisionRequest).toContain('lock');
    return output;
  });
  const result = await fitResume(input, output, async () => layout(0.7), revise);
  expect(result.output.resume.sections.find((s) => s.id === section.id)).toEqual(section);
  expect(
    trimLowestPriority(
      { ...input, lockedSectionIds: output.resume.sections.map((s) => s.id) },
      output,
    ),
  ).toBeNull();
  expect(validateEvidence(input, result.output)).toEqual([]);
});

it('pinpoints uncited numeric claims for repair without accepting them', () => {
  const { input, output } = pool();
  const bullet = output.resume.sections[0].entries[0].bullets[0];
  bullet.text = 'Reduced latency by 99%.';
  expect(numericBulletIssues(input, output)[0]).toContain(bullet.id);
  expect(validateEvidence(input, output)).toContain(
    'Numeric bullet claim lacks an approved metric',
  );
});

it('detects bullets whose last wrapped line holds only a few words', () => {
  const { output } = pool(1, 2);
  const [long, short] = output.resume.sections[0].entries[0].bullets;
  long.text = 'Designed a TypeScript task queue with retries and a dashboard for operators';
  short.text = 'Tested retry behavior using PostgreSQL';
  const item = (str: string, x: number, y: number, width: number) => ({ str, x, y, width });
  const items = [
    item('Section', 32, 700, 60),
    item('•', 45, 680, 4),
    item('Designed a TypeScript task queue with retries and a', 54, 680, 520),
    item('dashboard for operators', 54, 668, 140),
    item('•', 45, 656, 4),
    item('Tested retry behavior using', 54, 656, 520),
    item('PostgreSQL', 54, 644, 60),
  ];
  expect(shortWrappedBullets(items, output)).toEqual([short.id]);
});
