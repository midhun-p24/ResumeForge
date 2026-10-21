import { expect, it, vi } from 'vitest';
import type { ResumeDoc } from '@resumeforge/contracts';
import {
  draftMessage,
  fitByTrimming,
  missingSourcedKeywords,
  polishFeedback,
  removalOrder,
  trimTo,
  writeResume,
  type Measured,
} from '../apps/companion/src/writer';
import type { WriterSession } from '../apps/companion/src/providers';
import { portableSchema } from '../apps/companion/src/providers';
import { docFixture } from './fixtures';

const measured = (over: Partial<Measured> = {}): Measured => ({
  render: { status: 'ready', pageCount: 1, warnings: [] },
  pageFill: 0.97,
  shortBullets: [],
  wrappedSkills: [],
  headingCollisions: [],
  overflowLines: 0,
  ...over,
});
const overflow = (lines = 3) =>
  measured({ render: { status: 'overflow', pageCount: 2, warnings: [] }, overflowLines: lines });
/** The model returns documents without the version marker, like real structured output. */
const wire = (doc: ResumeDoc) => {
  const rest: Record<string, unknown> = structuredClone(doc);
  delete rest.schemaVersion;
  return rest;
};
function session(...replies: unknown[]) {
  const send = vi.fn<(text: string) => Promise<unknown>>();
  for (const reply of replies) send.mockResolvedValueOnce(reply);
  return { send } satisfies WriterSession;
}
const stage = async () => {};
const bulletCount = (d: ResumeDoc) =>
  d.sections.flatMap((s) => s.entries.flatMap((e) => e.bullets)).length;
/** A generous draft: four bullets on every entry, one more than the page "holds". */
function generous() {
  const { input, doc } = docFixture();
  for (const s of doc.sections)
    for (const e of s.entries)
      if (s.kind === 'entries')
        e.bullets = [
          'Cut duplicate processing by **25%** with a TypeScript task queue.',
          'Wrote PostgreSQL migrations reviewed in code reviews.',
          'Built a React and Node.js dashboard for 40 queues.',
          'Documented the TypeScript task queue for operators.',
        ];
  return { input, doc };
}

it('sends the posting and every source in tagged data blocks', () => {
  const { input } = docFixture();
  input.profile.portfolioText = 'Portfolio: Queue Visualizer case study.';
  input.profile.referenceResume = 'Reference resume text.';
  const text = draftMessage(input);
  expect(text).toContain('<job_posting>');
  expect(text).toContain(input.job.description);
  expect(text).toContain('<master_resume>');
  expect(text).toContain('<portfolio>');
  expect(text).toContain('<reference_resume>');
  expect(text).not.toContain('<current_resume_json>');
});

it('orders removals from the least important line and never empties an entry', () => {
  const { doc } = generous();
  const order = removalOrder(doc);
  // Deepest bullet of the last entry first, then the same depth in earlier entries.
  expect(order[0]).toEqual({ si: 3, ei: 0, bi: 3 });
  expect(order[1]).toEqual({ si: 2, ei: 0, bi: 3 });
  const all = trimTo(doc, order.length);
  const entries = all.sections.filter((s) => s.kind === 'entries');
  expect(entries.every((s) => s.entries.length === 1)).toBe(true);
  expect(entries.flatMap((s) => s.entries).every((e) => e.bullets.length === 1)).toBe(true);
  expect(bulletCount(trimTo(doc, 2))).toBe(bulletCount(doc) - 2);
});

it('fits an overflowing draft with the fewest removals, so the page stays full', async () => {
  const { doc } = generous();
  const total = bulletCount(doc);
  // Pretend the page holds exactly five bullets.
  const compile = vi.fn(async (d: ResumeDoc) =>
    bulletCount(d) > 5 ? overflow() : measured({ pageFill: 0.9 + bulletCount(d) / 100 }),
  );
  const fitted = await fitByTrimming(doc, compile);
  expect(fitted?.removed).toBe(total - 5);
  expect(bulletCount(fitted!.doc)).toBe(5);
  expect(compile.mock.calls.length).toBeLessThanOrEqual(Math.ceil(Math.log2(total)) + 1);
});

it('accepts a clean, full first draft without extra model turns', async () => {
  const { input, doc } = docFixture();
  const s = session(wire(doc));
  const compile = vi.fn(async () => measured());
  const result = await writeResume(input, s, compile, stage);
  expect(s.send).toHaveBeenCalledTimes(1);
  expect(compile).toHaveBeenCalledTimes(1);
  expect(result.doc.sections).toEqual(doc.sections);
});

it('trims an over-full draft deterministically instead of asking the model to guess', async () => {
  const { input, doc } = generous();
  const lines: string[] = [];
  const s = session(wire(doc));
  const compile = vi.fn(async (d: ResumeDoc) => (bulletCount(d) > 5 ? overflow(8) : measured()));
  const result = await writeResume(input, s, compile, stage, 5, (l) => lines.push(l));
  expect(s.send).toHaveBeenCalledTimes(1);
  expect(bulletCount(result.doc)).toBe(5);
  expect(lines[0]).toContain('Turn 1: 2 pages (+8 lines)');
  expect(lines[1]).toContain('fitted by removing 3 least important lines');
  expect(lines.at(-1)).toContain('Chosen: 1 page, 97% full');
});

it('polishes named lines on the fitted page and keeps the better result', async () => {
  const { input, doc } = docFixture();
  const polished = structuredClone(doc);
  polished.sections[2].entries[0].bullets[0] = 'Cut duplicate processing by **25%** with a queue.';
  const s = session(wire(doc), wire(polished));
  const compile = vi
    .fn()
    .mockResolvedValueOnce(measured({ shortBullets: [doc.sections[2].entries[0].bullets[0]] }))
    .mockResolvedValue(measured());
  const result = await writeResume(input, s, compile, stage);
  const second = s.send.mock.calls[1][0];
  expect(second).toContain('end with only one to three words');
  expect(second).toContain('<current_resume_json>');
  expect(result.doc.sections[2].entries[0].bullets[0]).toBe(
    polished.sections[2].entries[0].bullets[0],
  );
});

it('never replaces a good page with a worse polish attempt', async () => {
  const { input, doc } = docFixture();
  const worse = structuredClone(doc);
  worse.sections[3].entries[0].bullets = ['Built a dashboard.'];
  const s = session(wire(doc), wire(worse));
  const compile = vi
    .fn()
    .mockResolvedValueOnce(measured({ pageFill: 0.95, shortBullets: ['x'] }))
    .mockResolvedValue(measured({ pageFill: 0.6 }));
  const result = await writeResume(input, s, compile, stage, 2);
  expect(result.doc.sections).toEqual(doc.sections);
});

it('names sparse space, widows, wrapped skills, collisions, missing keywords and missing bold', () => {
  const { input, doc } = docFixture();
  doc.keywords = [
    { keyword: 'PostgreSQL', covered: true, where: '' },
    { keyword: 'Kubernetes', covered: false, where: '' },
  ];
  for (const s of doc.sections)
    for (const e of s.entries) e.bullets = e.bullets.map((b) => b.replaceAll('**', ''));
  const text = polishFeedback(
    input,
    measured({
      pageFill: 0.8,
      shortBullets: ['Built a dashboard.'],
      wrappedSkills: ['Languages'],
      headingCollisions: ['Queue Visualizer'],
    }),
    doc,
  ).join(' ');
  expect(text).toContain('80% full');
  expect(text).toContain('"Built a dashboard."');
  expect(text).toContain('Languages');
  expect(text).toContain('"Queue Visualizer"');
  expect(text).toContain('appear in the sources but nowhere in the resume: PostgreSQL');
  expect(text).not.toContain('Kubernetes');
  expect(text).toContain('No bullet uses bold');
  expect(missingSourcedKeywords(input, doc)).toEqual(['PostgreSQL']);
  expect(polishFeedback(input, measured(), docFixture().doc)).toEqual([]);
});

it('rejects invented numbers before compiling and asks for a sourced fix', async () => {
  const { input, doc } = docFixture();
  const invented = structuredClone(doc);
  invented.sections[2].entries[0].bullets[0] = 'Cut latency by **99%** with a queue.';
  const s = session(wire(invented), wire(doc));
  const compile = vi.fn(async () => measured());
  const result = await writeResume(input, s, compile, stage);
  expect(s.send.mock.calls[1][0]).toContain('99');
  expect(compile).toHaveBeenCalledTimes(1);
  expect(result.doc.sections).toEqual(doc.sections);
});

it('repairs schema mismatches and fails clearly when no valid draft arrives', async () => {
  const { input, doc } = docFixture();
  const repaired = await writeResume(
    input,
    session({ sections: 'nope' }, wire(doc)),
    async () => measured(),
    stage,
  );
  expect(repaired.doc.sections).toEqual(doc.sections);
  await expect(
    writeResume(input, session({}, {}), async () => measured(), stage, 2),
  ).rejects.toMatchObject({ code: 'INVALID_OUTPUT' });
});

it('respects the turn budget, reports true keyword coverage and flags unsourced headings', async () => {
  const { input, doc } = docFixture();
  const renamed = structuredClone(doc);
  renamed.sections[3].entries[0].heading = 'Quantum Ledger Platform';
  renamed.keywords = [{ keyword: 'Kubernetes', covered: true, where: 'Skills' }];
  const s = session(wire(renamed), wire(renamed), wire(renamed));
  const result = await writeResume(input, s, async () => measured({ pageFill: 0.5 }), stage, 3);
  expect(s.send).toHaveBeenCalledTimes(3);
  expect(result.doc.keywords[0].covered).toBe(false);
  expect(result.doc.notes.join(' ')).toContain('Quantum Ledger Platform');
});

it('strips schema keywords Claude structured outputs do not accept', () => {
  expect(
    portableSchema({
      type: 'object',
      $schema: 'x',
      properties: {
        a: { type: 'string', maxLength: 5 },
        b: { type: 'array', maxItems: 2, items: { minLength: 1 } },
      },
    }),
  ).toEqual({
    type: 'object',
    properties: { a: { type: 'string' }, b: { type: 'array', items: {} } },
  });
});
