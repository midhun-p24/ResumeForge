import { expect, it } from 'vitest';
import { z } from 'zod';
import {
  generationOutputSchema,
  sourceImportOutputSchema,
  parseGeneratedAgentOutput,
  validateEvidence,
} from '@resumeforge/contracts';
import { classifyError } from '../apps/companion/src/adapter';
import { fixture } from './fixtures';

it('requires every model-facing object property and forbids additional properties', () => {
  function visit(value: unknown) {
    if (!value || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    if (node.properties) {
      expect(node.required).toEqual(Object.keys(node.properties));
      expect(node.additionalProperties).toBe(false);
    }
    for (const child of Object.values(node)) visit(child);
  }
  for (const schema of [generationOutputSchema, sourceImportOutputSchema]) {
    visit(z.toJSONSchema(schema, { target: 'draft-7' }));
  }
});

it('restores omitted emphasis without changing locked legacy sections', () => {
  const { input, output } = fixture();
  input.operation = 'revise';
  input.priorOutput = structuredClone(output);
  input.lockedSectionIds = output.resume.sections.map((section) => section.id);
  const wire = structuredClone(output);
  for (const section of wire.resume.sections)
    for (const entry of section.entries)
      for (const bullet of entry.bullets) Object.assign(bullet, { emphasis: null });
  expect(parseGeneratedAgentOutput(wire)).toEqual(output);
  expect(validateEvidence(input, parseGeneratedAgentOutput(wire))).toEqual([]);
  const bullet = wire.resume.sections[0].entries[0].bullets[0];
  bullet.emphasis = [];
  expect(parseGeneratedAgentOutput(wire).resume.sections[0].entries[0].bullets[0].emphasis).toEqual(
    [],
  );
});

it('identifies schema rejection separately from local authentication failures', () => {
  expect(classifyError('invalid_json_schema: Invalid schema for response_format')).toBe(
    'SCHEMA_REJECTED',
  );
});
