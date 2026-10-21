export type TextItem = { str: string; x: number; y: number; width: number };

const squash = (s: string) =>
  s
    .normalize('NFKC')
    .replace(/\*\*/g, '')
    .replace(/[\s­]+/g, '')
    .replace(/[‐‑–—]/g, '-')
    .toLowerCase();

/** Group text items into printed lines, top to bottom, each sorted left to right. */
export function textLines(items: TextItem[]): TextItem[][] {
  const lines: TextItem[][] = [];
  for (const item of items.filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = lines.at(-1);
    if (line && Math.abs(line[0].y - item.y) < 2) line.push(item);
    else lines.push([item]);
  }
  for (const line of lines) line.sort((a, b) => a.x - b.x);
  return lines;
}
const left = (line: TextItem[]) => line[0].x;
const right = (line: TextItem[]) => Math.max(...line.map((i) => i.x + i.width));
const isBullet = (line: TextItem[]) => line[0].str.trim().startsWith('•');
const lineText = (line: TextItem[]) => line.map((t) => t.str).join('');

/**
 * Bullets whose final wrapped line holds only a few words (a "widow" line). A bullet starts
 * with a "•" glyph and continues on following lines that begin at the bullet text indent.
 * Returns each matching bullet with the words printed on its short last line.
 */
export function shortWrappedLines(
  items: TextItem[],
  bullets: string[],
  shortFraction = 0.2,
): { bullet: string; tail: string }[] {
  const lines = textLines(items);
  const indents = lines.filter((l) => isBullet(l) && l.length > 1).map((l) => Math.round(l[1].x));
  if (!indents.length) return [];
  const textX = indents.sort(
    (a, b) => indents.filter((v) => v === b).length - indents.filter((v) => v === a).length,
  )[0];
  const textWidth = Math.max(...lines.map(right)) - textX;
  const found: { bullet: string; tail: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!isBullet(lines[i])) continue;
    let j = i;
    while (
      lines[j + 1] &&
      !isBullet(lines[j + 1]) &&
      Math.abs(left(lines[j + 1]) - textX) < 2 &&
      lines[j][0].y - lines[j + 1][0].y < 16
    )
      j++;
    if (j === i || right(lines[j]) - left(lines[j]) >= textWidth * shortFraction) continue;
    const text = squash(
      lines
        .slice(i, j + 1)
        .map(lineText)
        .join('')
        .replace(/^\s*•/, ''),
    );
    const bullet = bullets.find((b) => {
      const target = squash(b);
      return target.length && (text.startsWith(target.slice(0, 30)) || target === text);
    });
    if (bullet)
      found.push({
        bullet,
        tail: lines[j]
          .map((t) => t.str)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim(),
      });
  }
  return found;
}
export function shortWrappedBullets(items: TextItem[], bullets: string[]): string[] {
  return shortWrappedLines(items, bullets).map((s) => s.bullet);
}

/** Skills rows ("Category: items") that spill onto a second printed line. */
export function wrappedSkillRows(items: TextItem[], categories: string[]): string[] {
  const lines = textLines(items);
  const starts = (line: TextItem[]) =>
    categories.find((c) => squash(lineText(line)).startsWith(squash(c)));
  const found: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const category = starts(lines[i]);
    const next = lines[i + 1];
    if (
      category &&
      next &&
      !isBullet(next) &&
      !starts(next) &&
      Math.abs(left(next) - left(lines[i])) < 2 &&
      lines[i][0].y - next[0].y < 16
    )
      found.push(category);
  }
  return found;
}

/**
 * Entry headings whose left text runs into (or pushes past) the right-aligned date column.
 * A heading row normally has a wide gap before its date; a collision leaves almost none.
 */
export function headingCollisions(
  items: TextItem[],
  headings: string[],
  pageWidth = 612,
  margin = 25,
): string[] {
  const found: string[] = [];
  for (const line of textLines(items)) {
    const heading = headings.find((h) => squash(lineText(line)).startsWith(squash(h).slice(0, 24)));
    if (!heading || line.length < 2) continue;
    const date = line[line.length - 1];
    const before = Math.max(...line.slice(0, -1).map((i) => i.x + i.width));
    if (date.x - before < 6 || date.x + date.width > pageWidth - margin) found.push(heading);
  }
  return [...new Set(found)];
}
