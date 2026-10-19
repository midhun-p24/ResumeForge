import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fixture } from '../tests/fixtures';
import { CodexAdapter } from '../apps/companion/src/adapter';
import { compileResume } from '../apps/companion/src/render';
import { validateEvidence } from '@resumeforge/contracts';
import { denseFixture } from '../tests/dense-fixture';
import { fitResume } from '../apps/companion/src/fit';

const root = resolve('private', 'smoke');
await mkdir(root, { recursive: true });
const dir = await mkdtemp(join(root, 'codex-'));
const { input } = process.argv.includes('--dense') ? denseFixture() : fixture();
await writeFile(join(dir, 'input.json'), JSON.stringify(input, null, 2));
const adapter = new CodexAdapter();
console.log(`Local sign-in: ${await adapter.status()}. Synthetic input only.`);
const signal = AbortSignal.timeout(540000);
let output = await adapter
  .run(input, dir, signal, async (stage) => {
    console.log(stage);
  })
  .catch((e) => {
    console.error(
      'Synthetic smoke diagnostic:',
      e.cause instanceof Error ? e.cause.message : e.code,
    );
    throw e;
  });
if (validateEvidence(input, output).length) throw new Error('Evidence validation failed');
await writeFile(join(dir, 'result.json'), JSON.stringify(output, null, 2));
console.log('Live Codex structured tailoring passed.');
if (process.argv.includes('--pdf')) {
  const stage = async (value: string) => {
    console.log(value);
  };
  const fitted = await fitResume(
    input,
    output,
    (candidate) =>
      compileResume(
        input.profile,
        candidate,
        dir,
        signal,
        stage,
        process.argv.includes('--warmup'),
      ),
    (snapshot) => adapter.run(snapshot, dir, signal, stage),
  );
  output = fitted.output;
  await writeFile(join(dir, 'result.json'), JSON.stringify(output, null, 2));
  // Recompile retained content so the on-disk review PDF matches the returned best draft.
  const rendered = await compileResume(input.profile, output, dir, signal, stage);
  console.log(
    JSON.stringify({
      ...rendered.render,
      pageFill: rendered.pageFill,
      sections: output.resume.sections.map((s) => ({ title: s.title, entries: s.entries.length })),
    }),
  );
  console.log(`Synthetic review artifacts: ${dir}`);
  if (rendered.render.status !== 'ready') process.exitCode = 1;
}
