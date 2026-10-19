import { describe, it, expect } from 'vitest';
import {
  companionTaskSchema,
  importOutputSchema,
  importTaskSchema,
  recordIdentity,
  validateImport,
  resolveImportSources,
  sourceImportOutputSchema,
  recoverImportDrafts,
  numberedImportSource,
} from '@resumeforge/contracts';
import { importFixture } from './import-fixtures';
describe('private draft extraction contract', () => {
  it('resolves exact source text from line ranges instead of trusting copied excerpts', () => {
    const { input, output } = importFixture();
    const lines = input.rawText.split('\n');
    const start = lines.findIndex((line) => line.startsWith('Synthetic Queue Service')) + 1;
    const proposal = output.records[0];
    const extraction = sourceImportOutputSchema.parse({
      schemaVersion: 1,
      contact: output.contact,
      contactSource: { startLine: 1, endLine: 3 },
      warnings: [],
      records: [
        {
          warnings: [],
          source: { startLine: start, endLine: lines.length },
          record: {
            ...proposal.record,
            metrics: proposal.record.metrics.map((metric) => ({
              ...metric,
              source: { startLine: start, endLine: lines.length },
            })),
          },
        },
      ],
    });
    const resolved = resolveImportSources(input, extraction);
    expect(resolved.diagnostics).toEqual([]);
    expect(resolved.output.records[0].sourceQuote).toBe(proposal.sourceQuote);
    expect(validateImport(input, resolved.output)).toEqual([]);
    expect(numberedImportSource('First\r\nSecond')).toBe('1: First\n2: Second');
    extraction.records[0].source = { startLine: 999, endLine: 1000 };
    expect(resolveImportSources(input, extraction).diagnostics).toContain(
      'records.0: invalid source line range',
    );
  });
  it('does not count sentence punctuation as part of a verified metric number', () => {
    const { input, output } = importFixture();
    input.rawText += '\nThe mean ROC AUC increased from 0.726 to 0.771.';
    output.records[0].record.metrics = [
      {
        value: '0.726 to 0.771',
        context: 'Synthetic AUC benchmark.',
        sourceQuote: 'The mean ROC AUC increased from 0.726 to 0.771.',
      },
    ];
    expect(validateImport(input, output)).toEqual([]);
    output.records[0].record.metrics[0].value = '0.772';
    expect(validateImport(input, output)).toContain(
      'Metric number does not appear in its source excerpt',
    );
  });
  it('retains source-valid drafts with explicit omission warnings after a failed repair', () => {
    const { input, output } = importFixture();
    output.records.push({ ...structuredClone(output.records[0]), sourceQuote: 'Invented source' });
    output.records[0].record.metrics.push({
      value: '99%',
      context: 'Unsupported',
      sourceQuote: output.records[0].sourceQuote,
    });
    const recovered = recoverImportDrafts(input, output);
    expect(recovered?.records).toHaveLength(1);
    expect(recovered?.records[0].record.metrics).toHaveLength(1);
    expect(recovered?.warnings[0]).toContain('1 records and 1 metrics omitted');
    expect(validateImport(input, recovered!)).toEqual([]);
    output.records = output.records.slice(1);
    expect(recoverImportDrafts(input, output)).toBeNull();
  });
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
