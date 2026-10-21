import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { taskInputSchema } from '@resumeforge/contracts';
import { renderLatex } from '@resumeforge/resume';
import { compileResume } from '../apps/companion/src/render';
import { loadSettings, openSession, providerStatus } from '../apps/companion/src/providers';
import { writeResume, WRITER_RULES, writerSchema } from '../apps/companion/src/writer';
import { docFixture } from '../tests/fixtures';

// Runs the real configured writer (uses your Codex allowance or Anthropic credit) and Tectonic.
// Synthetic by default; --input <task.json> reads a private task input from an ignored path.
const root = resolve('private', 'smoke');
await mkdir(root, { recursive: true });
const dir = await mkdtemp(join(root, 'writer-'));
const inputArg = process.argv.indexOf('--input');
const input =
  inputArg >= 0
    ? taskInputSchema.parse(JSON.parse(await readFile(process.argv[inputArg + 1], 'utf8')))
    : docFixture().input;
const settings = await loadSettings();
console.log(`Writer: ${await providerStatus(settings)}.`);
const signal = AbortSignal.timeout(15 * 60 * 1000);
const stage = async (value: string) => console.log(value);
let turns = 0;
const session = await openSession(settings, dir, WRITER_RULES, writerSchema, signal);
const counted = {
  send: (text: string) => {
    turns++;
    return session.send(text);
  },
};
const result = await writeResume(
  input,
  counted,
  (doc) => compileResume(input.profile, doc, dir, signal, stage, process.argv.includes('--warmup')),
  stage,
  5,
  console.log,
).catch((e) => {
  console.error('Writer diagnostic:', e.code ?? e, e.diagnostics ?? '');
  throw e;
});
// Recompile the chosen document so the PDF on disk matches what would be uploaded.
const final = await compileResume(input.profile, result.doc, dir, signal, stage);
await writeFile(join(dir, 'result.json'), JSON.stringify(result.doc, null, 2));
await writeFile(join(dir, 'Resume.tex'), renderLatex(input.profile, result.doc));
await writeFile(join(dir, 'CoverLetter.txt'), result.doc.coverLetter);
console.log(
  JSON.stringify(
    {
      turns,
      ...final.render,
      pageFill: Math.round(final.pageFill * 100) / 100,
      shortBullets: final.shortBullets,
      wrappedSkills: final.wrappedSkills,
      headingCollisions: final.headingCollisions,
      keywords: `${result.doc.keywords.filter((k) => k.covered).length}/${result.doc.keywords.length}`,
      gaps: result.doc.gaps,
    },
    null,
    2,
  ),
);
console.log(`Review artifacts: ${dir}`);
if (final.render.status !== 'ready') process.exitCode = 1;
