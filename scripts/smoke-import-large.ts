import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { CodexAdapter } from '../apps/companion/src/adapter';
import { importTaskSchema, validateImport } from '@resumeforge/contracts';

// Deliberately long and entirely synthetic. Never substitute a real person's resume.
const counts = {
  education: 1,
  experience: 3,
  research: 3,
  project: 9,
  publication: 2,
  presentation: 4,
  award: 4,
  skill: 7,
  coursework: 2,
};
const blocks = ['Alex Example\nalex@example.invalid\nhttps://example.invalid/alex'];
let total = 0;
for (const [kind, count] of Object.entries(counts))
  for (let i = 1; i <= count; i++) {
    total++;
    blocks.push(
      `${kind.toUpperCase()}: Synthetic ${kind} ${i}\nOrganization: Example ${kind} Lab ${i}\nDates: January 2025 - October 2026\n${kind === 'publication' ? 'Publication status: accepted\n' : ''}Personal contribution: Developed the assigned component within a team, using Python and TypeScript.\nAccomplishment: Improved the reliability of the synthetic demonstration through repeatable tests.\n${['research', 'project'].includes(kind) ? 'Measured outcome: Mean ROC AUC increased from 0.726 to 0.771.\nMeasurement context: Synthetic within-subject evaluation; values are AUC, not accuracy.\n' : ''}Source note: This is a distinct synthetic ${kind} entry, not a duplicate or real background.`,
    );
  }
const input = importTaskSchema.parse({
  schemaVersion: 1,
  taskId: randomUUID(),
  operation: 'import_profile',
  rawText: blocks.join('\n\n'),
});
const root = resolve('private/import-large');
await mkdir(root, { recursive: true });
const folder = await mkdtemp(join(root, 'synthetic-'));
const started = Date.now();
console.log(
  `Starting synthetic large-resume extraction: ${total} distinct entries, ${input.rawText.length} characters.`,
);
const timer = setInterval(
  () =>
    console.log(`Large extraction still running (${Math.round((Date.now() - started) / 1000)}s).`),
  30000,
);
try {
  const output = await new CodexAdapter().extract(
    input,
    folder,
    AbortSignal.timeout(540000),
    async (stage) => console.log(stage),
  );
  await writeFile(join(folder, 'result.json'), JSON.stringify(output, null, 2), { mode: 0o600 });
  assert.deepEqual(validateImport(input, output), []);
  assert.equal(output.records.length, total, 'Every distinct synthetic entry must be recovered');
  assert.ok(
    output.records.filter((record) => record.record.metrics.length).length >= 12,
    'Research/project metrics must survive sentence-ending decimals',
  );
  assert.ok(
    !output.warnings.some((warning) => warning.startsWith('Partial extraction')),
    'Large acceptance must pass without dropping records',
  );
  console.log(
    `Real large extraction passed: ${output.records.length} source-backed proposals in ${Math.round((Date.now() - started) / 1000)}s.`,
  );
} catch (error) {
  if (error instanceof Error && 'diagnostics' in error)
    console.error('Validation checks:', error.diagnostics);
  throw error;
} finally {
  clearInterval(timer);
}
