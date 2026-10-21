import type { AgentOutput } from '@resumeforge/contracts';

export type TextItem = { str: string; x: number; y: number; width: number };

const squash = (s: string) =>
  s
    .normalize('NFKC')
    .replace(/[\s­]+/g, '')
    .replace(/[‐‑–—]/g, '-')
    .toLowerCase();

/**
 * Bullets whose final wrapped line holds only a few words (a "widow" line).
 * Lines are grouped by baseline; a bullet starts with a "•" glyph and continues on
 * following lines that begin at the bullet text indent. Returns bullet IDs.
 */
export function shortWrappedBullets(
  items: TextItem[],
  output: AgentOutput,
  shortFraction = 0.2,
): string[] {
  const lines: TextItem[][] = [];
  for (const item of items.filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = lines.at(-1);
    if (line && Math.abs(line[0].y - item.y) < 2) line.push(item);
    else lines.push([item]);
  }
  for (const line of lines) line.sort((a, b) => a.x - b.x);
  const left = (line: TextItem[]) => line[0].x;
  const right = (line: TextItem[]) => Math.max(...line.map((i) => i.x + i.width));
  const isBullet = (line: TextItem[]) => line[0].str.trim().startsWith('•');
  const indents = lines.filter((l) => isBullet(l) && l.length > 1).map((l) => Math.round(l[1].x));
  if (!indents.length) return [];
  const textX = indents.sort(
    (a, b) => indents.filter((v) => v === b).length - indents.filter((v) => v === a).length,
  )[0];
  const textWidth = Math.max(...lines.map(right)) - textX;
  const bullets = output.resume.sections.flatMap((s) => s.entries.flatMap((e) => e.bullets));
  const found: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!isBullet(lines[i])) continue;
    let j = i;
    while (
      lines[j + 1] &&
      !isBullet(lines[j + 1]) &&
      Math.abs(left(lines[j + 1]) - textX) < 2 &&
      lines[j].at(0)!.y - lines[j + 1][0].y < 16
    )
      j++;
    if (j === i || right(lines[j]) - left(lines[j]) >= textWidth * shortFraction) continue;
    const text = squash(
      lines
        .slice(i, j + 1)
        .flat()
        .map((t) => t.str)
        .join('')
        .replace(/^\s*•/, ''),
    );
    const bullet = bullets.find((b) => {
      const target = squash(b.text);
      return target.length && (text.startsWith(target.slice(0, 30)) || target === text);
    });
    if (bullet) found.push(bullet.id);
  }
  return found;
}
