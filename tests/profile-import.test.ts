import { describe, it, expect } from 'vitest';
import {
  companionTaskSchema,
  importOutputSchema,
  importTaskSchema,
  recordIdentity,
  validateImport,
} from '@resumeforge/contracts';
import { importFixture } from './import-fixtures';
describe('private draft extraction contract', () => {
  it('accepts bounded import input and literal source-backed proposals', () => {
    const { input, output } = importFixture();
    expect(companionTaskSchema.parse(input).operation).toBe('import_profile');
    expect(importOutputSchema.safeParse(output).success).toBe(true);
    expect(validateImport(input, output)).toEqual([]);
  });
  it('rejects invented source excerpts and unsupported metric numbers', () => {
    const { input, output } = importFixture();
    output.records[0].sourceQuote = 'Invented record evidence';
    output.records[0].record.metrics[0].value = '99%';
    expect(validateImport(input, output)).toEqual(
      expect.arrayContaining([
        'Record needs a literal source excerpt',
        'Metric number does not appear in its source excerpt',
      ]),
    );
  });
  it('requires contact evidence and validates complete professional URLs', () => {
    const { input, output } = importFixture();
    output.contactSourceQuote = 'Invented contact evidence';
    expect(validateImport(input, output)).toContain(
      'Contact information needs a literal source excerpt',
    );
    output.contact.links = ['github.com/example'];
    expect(importOutputSchema.safeParse(output).success).toBe(false);
  });
  it('does not accept executable operations, caller paths, or oversized pasted input', () => {
    const { input } = importFixture();
    expect(companionTaskSchema.safeParse({ ...input, operation: 'shell' }).success).toBe(false);
    expect(importTaskSchema.parse({ ...input, path: '../../credentials' })).not.toHaveProperty(
      'path',
    );
    expect(importTaskSchema.safeParse({ ...input, rawText: 'x'.repeat(60001) }).success).toBe(
      false,
    );
  });
  it('identifies repeated records across case and whitespace differences', () => {
    const { output } = importFixture();
    const record = output.records[0].record;
    expect(recordIdentity({ ...record, title: '  SYNTHETIC   QUEUE Service ' })).toBe(
      recordIdentity({ ...record, title: 'Synthetic Queue Service' }),
    );
  });
  it('strips verification and model-assigned IDs from proposed records', () => {
    const { output } = importFixture();
    const parsed = importOutputSchema.parse({
      ...output,
      records: [
        {
          ...output.records[0],
          record: { ...output.records[0].record, verification: 'approved', id: 'not-an-id' },
        },
      ],
    });
    expect(parsed.records[0].record).not.toHaveProperty('verification');
    expect(parsed.records[0].record).not.toHaveProperty('id');
  });
});
