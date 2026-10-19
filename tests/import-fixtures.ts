import { randomUUID } from 'node:crypto';
import { fixture } from './fixtures';
import type { ImportOutput, ImportTaskInput } from '@resumeforge/contracts';

export function importFixture(): { input: ImportTaskInput; output: ImportOutput } {
  const { input: base } = fixture();
  const record = base.profile.records[0];
  const sourceQuote =
    'Synthetic Queue Service | Example Lab | Jan 2025 - Mar 2025\nDesigned a TypeScript task queue using PostgreSQL. Reduced duplicate task processing by 25% in a synthetic benchmark.';
  const contactSourceQuote =
    'Alex Example\nalex@example.invalid\nhttps://example.invalid/portfolio';
  const input: ImportTaskInput = {
    schemaVersion: 1,
    taskId: randomUUID(),
    operation: 'import_profile',
    rawText: `${contactSourceQuote}\n\n${sourceQuote}`,
  };
  const { id: _id, verification: _verification, metrics: _metrics, ...rest } = record;
  void _id;
  void _verification;
  void _metrics;
  const output: ImportOutput = {
    schemaVersion: 1,
    contact: { ...base.profile.contact, phone: '', location: '' },
    contactSourceQuote,
    records: [
      {
        record: {
          ...rest,
          contributions: 'Designed a TypeScript task queue using PostgreSQL.',
          metrics: [
            {
              value: '25%',
              context: 'Synthetic benchmark reduction in duplicate processing.',
              sourceQuote,
            },
          ],
        },
        sourceQuote,
        warnings: ['Synthetic example; review the metric before approval.'],
      },
    ],
    warnings: [],
  };
  return { input, output };
}
