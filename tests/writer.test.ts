import { expect, it, vi } from 'vitest';
import type { ResumeDoc } from '@resumeforge/contracts';
import {
  draftMessage,
  fitByTrimming,
  missingSourcedKeywords,
  applyEdits,
  polishFeedback,
  removalOrder,
  sourcedAwards,
  withAwards,
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
  shortTails: [],
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
  const send = vi.fn<(text: string, schema?: unknown) => Promise<unknown>>();
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

it('polishes with small edits on the fitted page instead of a full rewrite', async () => {
  const { input, doc } = docFixture();
  const original = doc.sections[2].entries[0].bullets[0];
  const replacement = 'Cut duplicate processing by **25%** with a queue.';
  const edits = {
    bullets: [{ original: original.replaceAll('**', ''), replacement }],
    skills: [],
    headings: [],
  };
  const s = session(wire(doc), edits);
  const compile = vi
    .fn()
    .mockResolvedValueOnce(
      measured({ shortBullets: [original], shortTails: ['TypeScript task queue.'] }),
    )
    .mockResolvedValue(measured());
  const result = await writeResume(input, s, compile, stage);
  const [prompt, schema] = s.send.mock.calls[1];
  expect(prompt).toContain('ends with only "TypeScript task queue." on its last line');
  expect(prompt).toContain('Cut at least 26 characters');
  expect(prompt).toContain('<current_resume_json>');
  expect(schema).toBeDefined();
  expect(result.doc.sections[2].entries[0].bullets[0]).toBe(replacement);
  expect(s.send).toHaveBeenCalledTimes(2);
});

it('never replaces a good page with a worse polish attempt', async () => {
  const { input, doc } = docFixture();
  const s = session(wire(doc), {
    bullets: [
      {
        original: 'Built a React and Node.js dashboard monitoring 40 queues.',
        replacement: 'Built a dashboard.',
      },
    ],
    skills: [],
    headings: [],
  });
  const compile = vi
    .fn()
    .mockResolvedValueOnce(measured({ pageFill: 0.95, shortBullets: ['x'] }))
    .mockResolvedValue(measured({ pageFill: 0.6 }));
  const result = await writeResume(input, s, compile, stage, 2);
  expect(result.doc.sections).toEqual(doc.sections);
});

it('asks for a fuller document when the fitted page is sparse', async () => {
  const { input, doc } = docFixture();
  const fuller = generous().doc;
  const s = session(wire(doc), wire(fuller));
  const compile = vi.fn(async (d: ResumeDoc) =>
    measured({ pageFill: bulletCount(d) > 2 ? 0.97 : 0.7 }),
  );
  const result = await writeResume(input, s, compile, stage);
  expect(s.send.mock.calls[1][0]).toContain('only 70% full');
  expect(s.send.mock.calls[1][1]).toBeUndefined();
  expect(bulletCount(result.doc)).toBeGreaterThan(2);
});

it('skips a candidate that fails to compile and keeps the best page', async () => {
  const { input, doc } = docFixture();
  const { AgentFailure } = await import('../apps/companion/src/adapter');
  const edits = {
    bullets: [
      {
        original: 'Cut duplicate processing by 25% with a TypeScript task queue.',
        replacement: 'Cut duplicates by **25%** with a TypeScript queue.',
      },
    ],
    skills: [],
    headings: [],
  };
  const lines: string[] = [];
  const s = session(wire(doc), edits);
  const compile = vi
    .fn()
    .mockResolvedValueOnce(measured({ shortBullets: ['x'] }))
    .mockRejectedValueOnce(
      new AgentFailure('COMPILE_FAILED', null, undefined, ['! Undefined control sequence.']),
    );
  const result = await writeResume(input, s, compile, stage, 2, (l) => lines.push(l));
  expect(lines.join('\n')).toContain(
    'Compile failed, candidate skipped: ! Undefined control sequence.',
  );
  expect(result.doc.sections).toEqual(doc.sections);
});

it('applies bullet, skills and heading edits by matching original text', () => {
  const { doc } = docFixture();
  const { doc: next, applied } = applyEdits(doc, {
    bullets: [
      {
        original: '  built a react and node.js dashboard monitoring 40 queues. ',
        replacement: 'New text.',
      },
      { original: 'No such bullet', replacement: 'Ignored.' },
    ],
    skills: [{ category: 'languages', items: 'TypeScript, SQL, JavaScript' }],
    headings: [{ original: 'Queue Visualizer', heading: 'Queue Viewer', stack: 'React' }],
  });
  expect(applied).toBe(3);
  expect(next.sections[3].entries[0]).toMatchObject({
    heading: 'Queue Viewer',
    stack: 'React',
    bullets: ['New text.'],
  });
  expect(next.sections[1].skills[0].items).toBe('TypeScript, SQL, JavaScript');
  expect(doc.sections[3].entries[0].heading).toBe('Queue Visualizer');
});

it('names widows with targets, wrapped skills, collisions, missing keywords and missing bold', () => {
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
      shortBullets: ['Built a dashboard.'],
      shortTails: ['dashboard.'],
      wrappedSkills: ['Languages'],
      headingCollisions: ['Queue Visualizer'],
    }),
    doc,
  ).join(' ');
  expect(text).toContain('"Built a dashboard." ends with only "dashboard."');
  expect(text).toContain('Cut at least 14 characters');
  expect(text).toContain('Languages');
  expect(text).toContain('"Queue Visualizer"');
  expect(text).toContain('in the sources but nowhere in the resume: PostgreSQL');
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

const awardsSource =
  '\n- Co-led the NASA MINDS 2025 team, which won first place for its technical paper.\nAWARDS\nFirst Place Technical Paper, NASA MINDS 2025 (team award, lunar swarm simulation)\nFirst Place, ECoG Data Analysis category, BR41N.IO Hackathon at IEEE SMC 2026 (team award)';

it('phrases each sourced award once, from its shortest mention', () => {
  const { input } = docFixture();
  input.profile.masterText += awardsSource;
  expect(sourcedAwards(input)).toEqual([
    'First Place Technical Paper, NASA MINDS 2025 (team)',
    'First Place, ECoG Data Analysis category, BR41N.IO Hackathon at IEEE SMC 2026 (team)',
  ]);
});

it('puts missing awards at the front of the honors line and leaves everything else alone', () => {
  const { input, doc } = docFixture();
  input.profile.masterText += awardsSource;
  doc.sections[0].entries[0].bullets = ["President's List (2 terms)"];
  const next = withAwards(input, doc)!;
  expect(next.sections[0].entries[0].bullets[0]).toBe(
    "First Place Technical Paper, NASA MINDS 2025 (team); First Place, ECoG Data Analysis category, BR41N.IO Hackathon at IEEE SMC 2026 (team); President's List (2 terms)",
  );
  expect(next.sections.slice(1)).toEqual(doc.sections.slice(1));
  expect(withAwards(input, next)).toBeNull();
});

it('adds awards after writing without another model call, trimming only if it overflows', async () => {
  const { input, doc } = docFixture();
  input.profile.masterText += awardsSource;
  doc.sections[0].entries[0].bullets = ["President's List"];
  const s = session(wire(doc));
  const lines: string[] = [];
  const compile = vi.fn(async (d: ResumeDoc) =>
    d.sections[0].entries[0].bullets[0].includes('NASA') && bulletCount(d) > 3
      ? measured({ render: { status: 'overflow', pageCount: 2, warnings: [] }, overflowLines: 1 })
      : measured(),
  );
  const result = await writeResume(input, s, compile, stage, 5, (l) => lines.push(l));
  expect(s.send).toHaveBeenCalledTimes(1);
  expect(result.doc.sections[0].entries[0].bullets[0]).toContain('NASA MINDS 2025');
  expect(result.compiled.render.pageCount).toBe(1);
  expect(lines.join('\n')).toContain('Awards added to the honors line');
});
