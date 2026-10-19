import { expect, it, vi } from 'vitest';
import { fitResume } from '../apps/companion/src/fit';
import { fixture } from './fixtures';
import { renderLatex } from '@resumeforge/resume';

const layout = (pageFill: number, status = 'ready') => ({
  pageFill,
  render: { status, pageCount: status === 'overflow' ? 2 : 1, warnings: [] as string[] },
});

it('expands sparse pages, then keeps the fuller valid page when expansion overflows', async () => {
  const { input, output } = fixture();
  const compile = vi
    .fn()
    .mockResolvedValueOnce(layout(0.65))
    .mockResolvedValueOnce(layout(0.96, 'overflow'))
    .mockResolvedValueOnce(layout(0.91));
  const revise = vi.fn().mockResolvedValue(output);
  const result = await fitResume(input, output, compile, revise);
  expect(result.rendered.pageFill).toBe(0.91);
  expect(revise).toHaveBeenCalledTimes(2);
  expect(revise.mock.calls[0][0].revisionRequest).toContain('next most relevant approved record');
  expect(revise.mock.calls[1][0].revisionRequest).toContain('Shorten');
});
it('retains the original valid PDF when both extra candidates overflow', async () => {
  const { input, output } = fixture();
  const original = layout(0.7);
  const compile = vi.fn().mockResolvedValueOnce(original).mockResolvedValue(layout(1, 'overflow'));
  const result = await fitResume(input, output, compile, async () => output);
  expect(result.rendered).toBe(original);
});
it('does not regenerate manual renders or already full pages', async () => {
  const { input, output } = fixture();
  const revise = vi.fn();
  await fitResume(input, output, async () => layout(0.95), revise);
  input.operation = 'render';
  input.priorOutput = output;
  await fitResume(input, output, async () => layout(0.5), revise);
  expect(revise).not.toHaveBeenCalled();
});
it('carries source exclusions and original locks into every fitting turn', async () => {
  const { input, output } = fixture();
  input.lockedSectionIds = [output.resume.sections[0].id];
  input.excludedSourceIds = ['00000000-0000-4000-8000-000000000001'];
  const revise = vi.fn().mockResolvedValue(output);
  await fitResume(input, output, async () => layout(0.6), revise);
  for (const [snapshot] of revise.mock.calls) {
    expect(snapshot.lockedSectionIds).toEqual(input.lockedSectionIds);
    expect(snapshot.excludedSourceIds).toEqual(input.excludedSourceIds);
  }
});
it('prints actual skill technologies and separates long headings from organizations', () => {
  const { input, output } = fixture();
  const record = input.profile.records[0];
  record.kind = 'skill';
  record.title = 'Languages';
  record.technologies = ['TypeScript', 'C++'];
  output.resume.sections[0].entries[0].bullets = [];
  expect(renderLatex(input.profile, output)).toContain('Languages}: TypeScript, C++');
  record.kind = 'experience';
  expect(renderLatex(input.profile, output)).toContain('Languages}\\\\\n{\\small');
});
