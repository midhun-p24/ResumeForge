import type { AgentOutput, TaskInput } from '@resumeforge/contracts';
import { AgentFailure } from './adapter';

type Layout = {
  render: { status: string; pageCount: number; warnings: string[] };
  pageFill: number;
};
/** At most two additional model turns. Never discard a valid page for a worse candidate. */
export async function fitResume<T extends Layout>(
  input: TaskInput,
  initial: AgentOutput,
  compile: (output: AgentOutput) => Promise<T>,
  revise: (input: TaskInput) => Promise<AgentOutput>,
): Promise<{ output: AgentOutput; rendered: T }> {
  let current = { output: initial, rendered: await compile(initial) };
  if (input.operation === 'render') return current;
  let best = current.rendered.render.status === 'ready' ? current : null;
  for (let turn = 0; turn < 2; turn++) {
    const overflow = current.rendered.render.status === 'overflow';
    if (
      !overflow &&
      (current.rendered.render.status !== 'ready' || current.rendered.pageFill >= 0.9)
    )
      break;
    const instruction = overflow
      ? `The draft is ${current.rendered.render.pageCount} pages. Shorten lower-priority unlocked bullets or remove the least relevant unlocked content until one page fits. Preserve the strongest evidence and substantive technical skills.`
      : `The compiled draft uses only ${Math.round(current.rendered.pageFill * 100)}% of usable page height. Fill remaining space with distinct supported accomplishments for the strongest selected experience/projects, then the next most relevant approved record. Populate approved technical skills. Omit coursework. Do not pad, repeat, invent, or alter font size/margins.`;
    try {
      const output = await revise({
        ...input,
        operation: 'revise',
        priorOutput: current.output,
        revisionRequest: `${input.revisionRequest}\n${instruction} Preserve every lock exactly.`,
      });
      current = { output, rendered: await compile(output) };
      if (
        current.rendered.render.status === 'ready' &&
        (!best || current.rendered.pageFill > best.rendered.pageFill)
      )
        best = current;
    } catch (error) {
      if (
        !(error instanceof AgentFailure) ||
        ['CANCELLED', 'AUTH_REQUIRED', 'USAGE_LIMIT'].includes(error.code)
      )
        throw error;
      (best ?? current).rendered.render.warnings.push(
        'Automatic content fitting stopped; retained the best compiled draft.',
      );
      break;
    }
  }
  return best ?? current;
}
