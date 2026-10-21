import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { renderLatex, DEFAULT_RESUME_TEMPLATE } from '@resumeforge/resume';
import { validateEvidence, agentOutputSchema } from '@resumeforge/contracts';
import { JAKE_TEMPLATE_PREAMBLE } from '../packages/resume/src/jake-template';
import { fixture } from './fixtures';

describe('supplied canonical Jake template (active)', () => {
  it('preserves the complete supplied LF-normalized preamble byte for byte', () => {
    expect(createHash('sha256').update(JAKE_TEMPLATE_PREAMBLE).digest('hex')).toBe(
      '8dcdc011da653cb8db26ed7d644ae52866f701b491c8382ccb1965b8ea662461',
    );
    const { input, output } = fixture();
    const tex = renderLatex(input.profile, output, 'jake-v1');
    expect(renderLatex(input.profile, output)).toBe(tex);
    expect(tex).toContain(JAKE_TEMPLATE_PREAMBLE);
    expect(tex).toContain('Copyright (c) 2020 Jake Gutierrez');
    expect(tex).toContain('Copyright (c) 2026 Sourabh Bajaj');
    expect(tex).not.toContain('Jake Ryan');
    expect(tex).toContain('\\resumeProjectHeading');
    expect(tex).toContain('\\textbf{25\\%}');
    expect(DEFAULT_RESUME_TEMPLATE).toBe('jake-v1');
  });
  it('escapes emphasized text and links without executing agent markup', () => {
    const { input, output } = fixture();
    const bullet = output.resume.sections[0].entries[0].bullets[0];
    bullet.text = 'Improved safety through \\input{secret} using a controlled renderer.';
    bullet.emphasis = ['\\input{secret}'];
    expect(validateEvidence(input, output)).toEqual([]);
    const tex = renderLatex(input.profile, output, 'jake-v1');
    expect(tex).toContain('\\textbf{\\textbackslash{}input\\{secret\\}}');
    expect(tex).not.toContain('\\input{secret}');
  });
  it('rejects invented emphasis, excessive emphasis, and too many spans', () => {
    const { input, output } = fixture();
    const bullet = output.resume.sections[0].entries[0].bullets[0];
    bullet.emphasis = ['Invented achievement'];
    expect(validateEvidence(input, output)).toContain(
      'Emphasis must be selective, distinct literal bullet spans',
    );
    bullet.emphasis = [bullet.text];
    expect(validateEvidence(input, output).length).toBeGreaterThan(0);
    bullet.emphasis = ['Reduced', '25%', 'queue'];
    expect(agentOutputSchema.safeParse(output).success).toBe(false);
  });
  it('accepts old saved resumes and preserves emphasis in locked bullets', () => {
    const { input, output } = fixture();
    expect(agentOutputSchema.safeParse(output).success).toBe(true);
    const bullet = output.resume.sections[0].entries[0].bullets[0];
    bullet.emphasis = ['25%'];
    input.operation = 'revise';
    input.priorOutput = structuredClone(output);
    input.lockedBulletIds = [bullet.id];
    bullet.emphasis = [];
    expect(validateEvidence(input, output)).toContain('Locked bullet changed or moved');
  });
  it('keeps approved metadata, GPA preference, skills and publication status', () => {
    const { input, output } = fixture();
    const record = input.profile.records[0];
    record.kind = 'education';
    record.gpa = '3.8';
    expect(renderLatex(input.profile, output, 'jake-v1')).not.toContain('GPA:');
    input.profile.preferences.includeGpa = true;
    expect(renderLatex(input.profile, output, 'jake-v1')).toContain('GPA: 3.8');
    record.kind = 'publication';
    record.publicationStatus = 'submitted';
    expect(renderLatex(input.profile, output, 'jake-v1')).toContain('(submitted)');
    record.kind = 'skill';
    expect(renderLatex(input.profile, output, 'jake-v1')).toContain('TypeScript, PostgreSQL');
  });
  it('keeps project headers concise without truncating verified technology names', () => {
    const { input, output } = fixture();
    const record = input.profile.records[0];
    record.technologies.push(
      'A very long master-record technology label that cannot fit in a project heading',
    );
    const tex = renderLatex(input.profile, output);
    expect(tex).toContain('TypeScript, PostgreSQL');
    expect(tex).not.toContain('A very long master-record technology label');
    expect(tex).toContain(JAKE_TEMPLATE_PREAMBLE);
    expect(tex).toContain(record.title);
  });
});

it('uses compact contact labels, location first, and Simplify-style margins', () => {
  const { input, output } = fixture();
  input.profile.contact.links = [
    'https://github.com/example',
    'https://www.linkedin.com/in/example-long-id',
  ];
  const tex = renderLatex(input.profile, output);
  expect(tex).toContain('\\href{https://github.com/example}{\\underline{GitHub}}');
  expect(tex).toContain(
    '\\href{https://www.linkedin.com/in/example-long-id}{\\underline{LinkedIn}}',
  );
  expect(tex).toContain('\\Huge \\scshape');
  expect(tex).toContain('\\footnotesize Example City $|$');
  expect(tex).toContain('\\addtolength{\\oddsidemargin}{-0.05in}');
  expect(tex).toContain('\\addtolength{\\textheight}{0.2in}');
  expect(tex).toContain('\\resumeItemListStart}{\\begin{itemize}[itemsep=0pt]}');
});
