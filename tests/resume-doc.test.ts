import { describe, expect, it } from 'vitest';
import {
  profileSchema,
  taskInputSchema,
  validateDoc,
  versionOutputSchema,
  docStructureIssues,
  unsourcedHeadings,
} from '@resumeforge/contracts';
import { renderDocBullet, renderLatex } from '@resumeforge/resume';
import {
  headingCollisions,
  shortWrappedBullets,
  wrappedSkillRows,
} from '../apps/companion/src/layout';
import { docFixture, fixture } from './fixtures';

describe('source-based (v2) documents', () => {
  it('parses old profiles and accepts both version formats', () => {
    const { input, doc } = docFixture();
    const old: Record<string, unknown> = { ...input.profile };
    delete old.portfolioText;
    delete old.referenceResume;
    expect(profileSchema.parse(old).portfolioText).toBe('');
    expect(versionOutputSchema.parse(doc).schemaVersion).toBe(2);
    expect(versionOutputSchema.parse(fixture().output).schemaVersion).toBe(1);
    expect(taskInputSchema.safeParse(input).success).toBe(true);
    expect(taskInputSchema.safeParse({ ...input, priorOutput: fixture().output }).success).toBe(
      false,
    );
  });

  it('allows only numbers found in the sources or posting', () => {
    const { input, doc } = docFixture();
    expect(validateDoc(input, doc)).toEqual([]);
    doc.sections[2].entries[0].bullets[0] = 'Served 120 users with a TypeScript task queue.';
    expect(validateDoc(input, doc).join(' ')).toContain('120');
    doc.sections[2].entries[0].bullets[0] = 'Cut duplicates by 25%.';
    doc.coverLetter = 'I led 12 engineers.';
    expect(validateDoc(input, doc).join(' ')).toContain('12');
  });

  it('enforces selective bold, matching section kinds and unique titles', () => {
    const { doc } = docFixture();
    doc.sections[2].entries[0].bullets[0] = '**Cut** **duplicate** **processing** by 25%.';
    doc.sections[1].skills = [];
    doc.sections[3].title = 'Experience';
    const issues = docStructureIssues(doc).join(' ');
    expect(issues).toContain('Bold');
    expect(issues).toContain('does not match its kind');
    expect(issues).toContain('unique');
  });

  it('flags headings whose wording is absent from the sources', () => {
    const { input, doc } = docFixture();
    expect(unsourcedHeadings(input, doc)).toEqual([]);
    doc.sections[3].entries[0].heading = 'Galactic Payments Engine';
    expect(unsourcedHeadings(input, doc)).toEqual(['Galactic Payments Engine']);
  });

  it('renders Jake headings, bold spans and escapes everything else', () => {
    const { input, doc } = docFixture();
    doc.sections[3].entries[0].bullets[0] = 'Shipped \\input{x} & **R&D_1** at 50% #1';
    const tex = renderLatex(input.profile, doc);
    expect(tex).toContain(
      '\\resumeSubheading{Example University}{Example City}{B.S. in Computer Science; GPA: 3.8}{Aug. 2022 -- May 2026}',
    );
    expect(tex).toContain(
      '\\resumeSubheading{Software Intern}{June 2025 -- Aug. 2025}{Example Systems}{Example City}',
    );
    expect(tex).toContain(
      '\\resumeProjectHeading{\\textbf{Queue Visualizer} $|$ \\emph{React, Node.js}}{2025}',
    );
    expect(tex).toContain('\\textbf{Languages}{: TypeScript, SQL}');
    expect(tex).toContain('\\textbf{R\\&D\\_1}');
    expect(tex).not.toContain('\\input{x}');
    expect(renderDocBullet('Unbalanced **bold')).toBe('Unbalanced **bold');
  });
});

describe('page layout measurement', () => {
  const item = (str: string, x: number, y: number, width: number) => ({ str, x, y, width });
  it('finds bullets whose last line holds only a few words', () => {
    const bullets = [
      'Designed a TypeScript task queue with retries and a **dashboard** for operators',
      'Tested retry behavior using PostgreSQL',
    ];
    const items = [
      item('Section', 32, 700, 60),
      item('•', 45, 680, 4),
      item('Designed a TypeScript task queue with retries and a', 54, 680, 520),
      item('dashboard for operators', 54, 668, 140),
      item('•', 45, 656, 4),
      item('Tested retry behavior using', 54, 656, 520),
      item('PostgreSQL', 54, 644, 60),
    ];
    expect(shortWrappedBullets(items, bullets)).toEqual([bullets[1]]);
  });
  it('finds headings that run into their right-aligned date', () => {
    const items = [
      item('FlowLens (five-person team project, in development)', 43, 600, 230),
      item('|', 276, 600, 3),
      item('React, Cytoscape.js, Python, FastAPI, Tree-sitter', 282, 600, 228),
      item('2026 – Present', 511, 600, 60),
      item('Queue Visualizer', 43, 560, 80),
      item('|', 126, 560, 3),
      item('React, Node.js', 132, 560, 70),
      item('2025', 556, 560, 24),
      item('Very Long Research Assistant Title For A Project', 43, 520, 470),
      item('Aug. 2025 – Present', 520, 520, 80),
    ];
    expect(
      headingCollisions(items, [
        'FlowLens (five-person team project, in development)',
        'Queue Visualizer',
        'Very Long Research Assistant Title For A Project',
      ]),
    ).toEqual([
      'FlowLens (five-person team project, in development)',
      'Very Long Research Assistant Title For A Project',
    ]);
  });
  it('finds skills rows that wrap onto a second line', () => {
    const items = [
      item('Languages: TypeScript, Python, Java, C#, C/C++, SQL, Go, MATLAB, Bash', 43, 600, 520),
      item('Shell', 43, 588, 30),
      item('Frameworks: React, Next.js', 43, 576, 200),
      item('Projects', 32, 556, 60),
    ];
    expect(wrappedSkillRows(items, ['Languages', 'Frameworks'])).toEqual(['Languages']);
  });
});

it('never lets line breaks in model text become TeX paragraph breaks', () => {
  const { input, doc } = docFixture();
  doc.sections[2].entries[0].bullets[0] = 'Cut duplicate processing by **25%**\n\n with a queue.';
  doc.sections[2].entries[0].heading = 'Software\nIntern';
  const tex = renderLatex(input.profile, doc);
  expect(tex).toContain('\\resumeItem{Cut duplicate processing by \\textbf{25\\%} with a queue.}');
  expect(tex).toContain('\\resumeSubheading{Software Intern}');
});

it('drops whitespace-only bullets instead of leaving a blank gap', () => {
  const { input, doc } = docFixture();
  const clean = renderLatex(input.profile, doc);
  doc.sections[2].entries[0].bullets.push('   ', '\n\n', '** **');
  expect(renderLatex(input.profile, doc)).toBe(clean);
});
