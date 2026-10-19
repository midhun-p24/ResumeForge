import { describe, it, expect } from 'vitest';
import {
  agentOutputSchema,
  fitScore,
  taskInputSchema,
  validateEvidence,
} from '@resumeforge/contracts';
import { escapeLatex, renderLatex, safeFilename } from '@resumeforge/resume';
import { fixture } from './fixtures';

describe('shared contract and provenance', () => {
  it('accepts a valid synthetic snapshot and output', () => {
    const { input, output } = fixture();
    expect(taskInputSchema.safeParse(input).success).toBe(true);
    expect(agentOutputSchema.safeParse(output).success).toBe(true);
    expect(validateEvidence(input, output)).toEqual([]);
  });
  it('rejects executable operations and caller paths', () => {
    const { input } = fixture();
    expect(
      taskInputSchema.safeParse({ ...input, operation: 'shell', command: 'whoami' }).success,
    ).toBe(false);
    expect(taskInputSchema.parse({ ...input, path: '../../secret' })).not.toHaveProperty('path');
  });
  it('requires approved references', () => {
    const { input, output } = fixture();
    input.profile.records[0].verification = 'draft';
    expect(validateEvidence(input, output)).toContain('Bullet cites an unapproved source');
  });
  it('does not count a keyword without approved evidence', () => {
    const { input, output } = fixture();
    output.analysis.requirements[0].sourceIds = [];
    expect(validateEvidence(input, output)).toContain(
      'Supported requirement needs source evidence',
    );
  });
  it('rejects unsupported numeric claims', () => {
    const { input, output } = fixture();
    output.resume.sections[0].entries[0].bullets[0].text = 'Improved throughput by 99%';
    expect(validateEvidence(input, output)).toContain(
      'Numeric bullet claim lacks an approved metric',
    );
  });
  it('requires metric ownership as well as a metric ID', () => {
    const { input, output } = fixture();
    output.resume.sections[0].entries[0].bullets[0].metricIds = [
      '00000000-0000-4000-8000-000000000001',
    ];
    expect(validateEvidence(input, output)).toContain('Unsupported metric reference');
  });
  it('excludes sources from both selection and assessment', () => {
    const { input, output } = fixture();
    input.excludedSourceIds = [input.profile.records[0].id];
    expect(validateEvidence(input, output).length).toBeGreaterThan(0);
  });
  it('preserves locked sections and bullets including their source', () => {
    const { input, output } = fixture();
    input.operation = 'revise';
    input.priorOutput = structuredClone(output);
    input.lockedBulletIds = [output.resume.sections[0].entries[0].bullets[0].id];
    input.lockedSectionIds = [output.resume.sections[0].id];
    output.resume.sections[0].entries[0].bullets[0].text = 'Changed wording';
    expect(validateEvidence(input, output)).toEqual(
      expect.arrayContaining(['Locked section changed', 'Locked bullet changed or moved']),
    );
  });
  it('render operations cannot silently change saved content', () => {
    const { input, output } = fixture();
    input.operation = 'render';
    input.priorOutput = structuredClone(output);
    output.warnings = [];
    expect(validateEvidence(input, output)).toContain(
      'Rendering must preserve saved content exactly',
    );
  });
  it('calculates a reproducible score and handles absent requirements', () => {
    const { output } = fixture();
    expect(fitScore(output.analysis)).toBe(100);
    output.analysis.requirements[0].evidence = 'partial';
    expect(fitScore(output.analysis)).toBe(50);
    output.analysis.requirements = [];
    expect(fitScore(output.analysis)).toBeNull();
  });
});
describe('application controlled rendering', () => {
  it('escapes every executable LaTeX character without double-escaping', () => {
    expect(escapeLatex('\\input{secret}&%$#_~^')).toBe(
      '\\textbackslash{}input\\{secret\\}\\&\\%\\$\\#\\_\\textasciitilde{}\\textasciicircum{}',
    );
  });
  it('never allows agent content to add packages or execute TeX', () => {
    const { input, output } = fixture();
    output.resume.sections[0].entries[0].bullets[0].text = '\\write18{whoami}';
    const tex = renderLatex(input.profile, output);
    expect(tex).not.toContain('\\write18{');
    expect(tex).toContain('11pt');
    expect(tex).toContain('\\addtolength{\\oddsidemargin}{-0.5in}');
  });
  it('keeps dates and titles from the snapshot', () => {
    const { input, output } = fixture();
    expect(renderLatex(input.profile, output)).toContain('Jan 2025 -- Mar 2025');
  });
  it('creates portable artifact filenames', () => {
    expect(safeFilename('../Alex <Example>', 'A/B: Co', 'Engineer?')).toBe(
      'Alex_Example_A_B_Co_Engineer',
    );
  });
});
