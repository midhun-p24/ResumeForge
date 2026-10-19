import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { fixture } from '../tests/fixtures';
import { validateEvidence, taskInputSchema, agentOutputSchema } from '@resumeforge/contracts';
import type { SourceRecord } from '@resumeforge/contracts';
import { compileResume } from '../apps/companion/src/render';

// Every fact below is synthetic review data, not a person's actual background.
const { input, output } = fixture();
input.profile.contact = {
  name: 'Alex Example',
  email: 'alex@example.invalid',
  phone: '555-010-0200',
  location: '',
  links: ['https://example.invalid/alex', 'https://github.com/example'],
};
const project = input.profile.records[0];
const projectEntry = output.resume.sections[0].entries[0];
projectEntry.bullets[0].emphasis = ['25%'];
projectEntry.bullets.push({
  id: randomUUID(),
  text: 'Improved retry reliability through idempotent task handling using PostgreSQL transactions.',
  sourceIds: [project.id],
  metricIds: [],
  emphasis: ['idempotent task handling'],
});
function record(overrides: Partial<SourceRecord>): SourceRecord {
  return {
    ...structuredClone(project),
    id: randomUUID(),
    metrics: [],
    gpa: '',
    url: '',
    ...overrides,
  };
}
const education = record({
  kind: 'education',
  title: 'Bachelor of Science in Computer Science',
  organization: 'Example University',
  startDate: 'Aug 2021',
  endDate: 'May 2025',
  technologies: [],
  contributions: 'Completed a computer science degree.',
  accomplishments: '',
});
const metric = randomUUID();
const experience = record({
  kind: 'experience',
  title: 'Software Engineering Intern',
  organization: 'Example Systems',
  startDate: 'May 2024',
  endDate: 'Aug 2024',
  technologies: ['TypeScript', 'PostgreSQL'],
  contributions: 'Implemented backend pagination and query tests within an existing team service.',
  accomplishments: 'Reduced query latency in a synthetic benchmark.',
  metrics: [
    {
      id: metric,
      value: '30%',
      context: 'Synthetic benchmark median latency reduction after indexed query changes.',
    },
  ],
});
const skills = record({
  kind: 'skill',
  title: 'Languages & Databases',
  organization: '',
  startDate: '',
  endDate: '',
  technologies: ['TypeScript', 'SQL', 'PostgreSQL'],
  contributions: 'Used in the approved synthetic project and internship.',
  accomplishments: '',
});
input.profile.records.push(education, experience, skills);
output.selectedSourceIds.push(education.id, experience.id, skills.id);
output.resume.sections = [
  { id: randomUUID(), title: 'Education', entries: [{ sourceId: education.id, bullets: [] }] },
  {
    id: randomUUID(),
    title: 'Experience',
    entries: [
      {
        sourceId: experience.id,
        bullets: [
          {
            id: randomUUID(),
            text: 'Reduced median query latency by 30% through indexed query changes using PostgreSQL.',
            sourceIds: [experience.id],
            metricIds: [metric],
            emphasis: ['30%'],
          },
          {
            id: randomUUID(),
            text: 'Improved API reliability through pagination edge-case tests using TypeScript.',
            sourceIds: [experience.id],
            metricIds: [],
            emphasis: [],
          },
        ],
      },
    ],
  },
  output.resume.sections[0],
  { id: randomUUID(), title: 'Technical Skills', entries: [{ sourceId: skills.id, bullets: [] }] },
];
taskInputSchema.parse(input);
agentOutputSchema.parse(output);
const errors = validateEvidence(input, output);
if (errors.length) throw new Error(errors.join('; '));
const folder = resolve('private/template-review/jake');
await mkdir(folder, { recursive: true });
const compiled = await compileResume(
  input.profile,
  output,
  folder,
  AbortSignal.timeout(120000),
  async (stage) => console.log(stage),
  process.argv.includes('--warmup'),
  'jake-v1',
);
if (
  compiled.render.status !== 'ready' ||
  compiled.render.pageCount !== 1 ||
  !compiled.render.textVerified
)
  throw new Error(JSON.stringify(compiled.render));
const task = getDocument({ data: new Uint8Array(compiled.pdf), useSystemFonts: true });
const pdf = await task.promise;
const page = await pdf.getPage(1);
const text = (await page.getTextContent()).items
  .flatMap((item) => ('str' in item ? [item.str] : []))
  .join('\n');
await writeFile(join(folder, 'extracted-text.txt'), text);
const viewport = page.getViewport({ scale: 1.7 });
const factory = pdf.canvasFactory as {
  create(
    width: number,
    height: number,
  ): {
    canvas: HTMLCanvasElement & { toBuffer(mime: string): Buffer };
    context: CanvasRenderingContext2D;
  };
};
const canvas = factory.create(viewport.width, viewport.height);
await page.render({ canvasContext: canvas.context, canvas: canvas.canvas, viewport }).promise;
await writeFile(join(folder, 'preview.png'), canvas.canvas.toBuffer('image/png'));
await writeFile(
  join(folder, 'checks.json'),
  JSON.stringify(
    { template: 'jake-v1', synthetic: true, evidenceErrors: errors, ...compiled.render },
    null,
    2,
  ),
);
await task.destroy();
console.log(`Verified synthetic Jake review PDF: ${folder}/resume.pdf`);
