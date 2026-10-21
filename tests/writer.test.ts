import { expect, it, vi } from 'vitest';
import type { ResumeDoc } from '@resumeforge/contracts';
import {
  draftMessage,
  layoutFeedback,
  trimDoc,
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
  overflowLines: 0,
  ...over,
});
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

it('accepts a clean, full first draft without extra model turns', async () => {
  const { input, doc } = docFixture();
  const s = session(wire(doc));
  const compile = vi.fn(async () => measured());
  const result = await writeResume(input, s, compile, stage);
  expect(s.send).toHaveBeenCalledTimes(1);
  expect(compile).toHaveBeenCalledTimes(1);
  expect(result.doc.schemaVersion).toBe(2);
  expect(result.doc.sections).toEqual(doc.sections);
});

it('feeds overflow, sparse pages and widow lines back as concrete instructions', () => {
  expect(
    layoutFeedback(
      measured({ render: { status: 'overflow', pageCount: 2, warnings: [] }, overflowLines: 6 }),
    )[0],
  ).toContain('second page by about 6 printed lines');
  expect(layoutFeedback(measured({ pageFill: 0.7 }))[0]).toContain('only 70% full');
  const feedback = layoutFeedback(
    measured({ shortBullets: ['Built a dashboard.'], wrappedSkills: ['Languages'] }),
  );
  expect(feedback.join(' ')).toContain('"Built a dashboard."');
  expect(feedback.join(' ')).toContain('Languages');
  expect(layoutFeedback(measured())).toEqual([]);
});

it('revises after compiling and keeps the best one-page candidate', async () => {
  const { input, doc } = docFixture();
  const longer = structuredClone(doc);
  longer.sections[2].entries[0].bullets.push(
    'Wrote PostgreSQL migrations reviewed in code reviews.',
  );
  const s = session(wire(doc), wire(longer));
  const compile = vi.fn(async (d: ResumeDoc) =>
    d.sections[2].entries[0].bullets.length > 1
      ? measured({ render: { status: 'overflow', pageCount: 2, warnings: [] }, overflowLines: 3 })
      : measured({ pageFill: 0.8 }),
  );
  const result = await writeResume(input, s, compile, stage, 2);
  expect(s.send.mock.calls[1][0]).toContain('80% full');
  expect(result.doc.sections[2].entries[0].bullets).toHaveLength(1);
  expect(result.compiled.render.pageCount).toBe(1);
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

it('trims the lowest bullets, then entries, when no turn fits one page', async () => {
  const { input, doc } = docFixture();
  doc.sections[3].entries[0].bullets.push('Added React views for the dashboard.');
  const compile = vi.fn(async (d: ResumeDoc) =>
    d.sections[3].entries[0].bullets.length > 1
      ? measured({ render: { status: 'overflow', pageCount: 2, warnings: [] } })
      : measured(),
  );
  const result = await writeResume(input, session(wire(doc)), compile, stage, 1);
  expect(result.doc.sections[3].entries[0].bullets).toHaveLength(1);
  expect(result.compiled.render.pageCount).toBe(1);
  const single = trimDoc({ ...doc, sections: [doc.sections[0]] });
  expect(single).toBeNull();
});

it('respects the turn budget and notes headings not found in the sources', async () => {
  const { input, doc } = docFixture();
  const renamed = structuredClone(doc);
  renamed.sections[3].entries[0].heading = 'Quantum Ledger Platform';
  const s = session(wire(renamed), wire(renamed), wire(renamed));
  const result = await writeResume(input, s, async () => measured({ pageFill: 0.5 }), stage, 3);
  expect(s.send).toHaveBeenCalledTimes(3);
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
