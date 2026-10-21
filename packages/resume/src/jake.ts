import type { AgentOutput, Profile, ResumeDoc, SourceRecord } from '@resumeforge/contracts';
import { escapeLatex } from './index';
import { JAKE_TEMPLATE_LICENSE, JAKE_TEMPLATE_PREAMBLE } from './jake-template';

// pdfTeX-only mapping primitives are absent in XeTeX/Tectonic, which has its own
// Unicode output. Keep the supplied preamble intact and guard just those names.
// This adapter sets no fonts, dimensions, spacing, or layout commands.
export const JAKE_TECTONIC_COMPATIBILITY = String.raw`% ResumeForge XeTeX compatibility; layout preamble below is unchanged.
\ifdefined\XeTeXrevision
  \ifdefined\pdfglyphtounicode\else\def\pdfglyphtounicode#1#2{}\fi
  \ifdefined\pdfgentounicode\else\newcount\pdfgentounicode\fi
\fi
`;

type Bullet = AgentOutput['resume']['sections'][number]['entries'][number]['bullets'][number];

/** Bold literal spans only. Every byte of agent text is escaped before entering TeX. */
export function renderEmphasizedBullet(bullet: Bullet, records: SourceRecord[]): string {
  const metricValues = records
    .filter((r) => r.verification === 'approved' && bullet.sourceIds.includes(r.id))
    .flatMap((r) => r.metrics.filter((m) => bullet.metricIds.includes(m.id)).map((m) => m.value));
  const candidates = bullet.emphasis ?? metricValues;
  const spans: { start: number; end: number }[] = [];
  let covered = 0;
  for (const phrase of candidates) {
    const start = bullet.text.indexOf(phrase);
    const end = start + phrase.length;
    if (
      !phrase ||
      start < 0 ||
      spans.length === 2 ||
      covered + phrase.length > bullet.text.length / 2 ||
      spans.some((span) => start < span.end && end > span.start)
    )
      continue;
    spans.push({ start, end });
    covered += phrase.length;
  }
  let cursor = 0;
  let result = '';
  for (const span of spans.sort((a, b) => a.start - b.start)) {
    result += escapeLatex(bullet.text.slice(cursor, span.start));
    result += `\\textbf{${escapeLatex(bullet.text.slice(span.start, span.end))}}`;
    cursor = span.end;
  }
  return result + escapeLatex(bullet.text.slice(cursor));
}

/** Fixed supplied Jake layout. The agent selects structured records, never TeX commands. */
function contactLine(profile: Profile): string {
  const e = escapeLatex;
  return [
    e(profile.contact.location),
    e(profile.contact.phone),
    profile.contact.email
      ? `\\href{mailto:${e(profile.contact.email)}}{\\underline{${e(profile.contact.email)}}}`
      : '',
    ...profile.contact.links
      .filter(Boolean)
      .map(
        (url) =>
          `\\href{${e(url)}}{\\underline{${e(/github\.com/i.test(url) ? 'GitHub' : /linkedin\.com/i.test(url) ? 'LinkedIn' : url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, ''))}}}`,
      ),
  ]
    .filter(Boolean)
    .join(' $|$ ');
}

export function renderJakeResume(profile: Profile, output: AgentOutput): string {
  const e = escapeLatex;
  const records = new Map(
    profile.records.filter((r) => r.verification === 'approved').map((r) => [r.id, r]),
  );
  const sections = output.resume.sections.map((section) => {
    if (
      section.entries.length &&
      section.entries.every((entry) => records.get(entry.sourceId)?.kind === 'skill')
    ) {
      const lines = section.entries.map((entry) => {
        const record = records.get(entry.sourceId)!;
        if (!output.selectedSourceIds.includes(record.id))
          throw new Error('Unselected rendering source');
        const content = [record.technologies.join(', '), ...entry.bullets.map((b) => b.text)]
          .filter(Boolean)
          .join('; ');
        return `\\textbf{${e(record.title)}}{: ${e(content)}}`;
      });
      // Preserve the supplied template's single-item skills list and line breaks.
      return `\\section{${e(section.title)}}\n\\begin{itemize}[leftmargin=0.15in, label={}]\n\\small{\\item{\n${lines.join(' \\\\\n')}\n}}\n\\end{itemize}`;
    }
    const entries = section.entries.map((entry) => {
      const record = records.get(entry.sourceId);
      if (!record || !output.selectedSourceIds.includes(record.id))
        throw new Error('Unapproved or unselected rendering source');
      const dates = [...new Set([record.startDate, record.endDate].filter(Boolean))]
        .map(e)
        .join(' -- ');
      const bullets = entry.bullets.length
        ? '\n\\resumeItemListStart\n' +
          entry.bullets
            .map(
              (bullet) => `\\resumeItem{${renderEmphasizedBullet(bullet, [...records.values()])}}`,
            )
            .join('\n') +
          '\n\\resumeItemListEnd'
        : '';
      const status =
        record.kind === 'publication' && record.publicationStatus !== 'not_applicable'
          ? ` (${record.publicationStatus.replaceAll('_', ' ')})`
          : '';
      const title = e(record.title + status);
      const linkedTitle = record.url ? `\\href{${e(record.url)}}{${title}}` : title;
      if (record.kind === 'skill' || record.kind === 'coursework') {
        return `\\item{\\small{\\textbf{${title}}${record.technologies.length ? ': ' + e(record.technologies.join(', ')) : ''}}}${bullets}`;
      }
      if (record.kind === 'project') {
        // The supplied heading is a single table row. Choose a concise verified
        // stack for this role rather than dumping the entire master-record list.
        const context = [
          ...output.analysis.requirements.map((r) => r.text),
          ...entry.bullets.map((b) => b.text),
        ]
          .join(' ')
          .toLowerCase();
        const ranked = record.technologies
          .map((value, index) => ({ value, index, match: context.includes(value.toLowerCase()) }))
          .sort((a, b) => Number(b.match) - Number(a.match) || a.index - b.index)
          .map((t) => t.value);
        const chosen: string[] = [];
        let length = record.title.length + 3;
        for (const value of ranked) {
          if (chosen.length === 4) break;
          const added = value.length + (chosen.length ? 2 : 0);
          if (length + added > 60) continue;
          chosen.push(value);
          length += added;
        }
        const technologies = chosen.length ? ` $|$ \\emph{${e(chosen.join(', '))}}` : '';
        return `\\resumeProjectHeading{\\textbf{${linkedTitle}}${technologies}}{${dates}}${bullets}`;
      }
      if (record.kind === 'education') {
        const gpa = profile.preferences.includeGpa && record.gpa ? `; GPA: ${record.gpa}` : '';
        // The profile has no record-location field. Leave that template cell empty.
        return `\\resumeSubheading{${e(record.organization)}}{}{${linkedTitle}${e(gpa)}}{${dates}}${bullets}`;
      }
      return `\\resumeSubheading{${linkedTitle}}{${dates}}{${e(record.organization)}}{}${bullets}`;
    });
    return `\\section{${e(section.title)}}\n\\resumeSubHeadingListStart\n${entries.join('\n')}\n\\resumeSubHeadingListEnd`;
  });
  return jakeDocument(profile, sections);
}

/** Escape a v2 bullet, turning balanced **double-asterisk** spans into bold. */
// A line break inside model text would become a TeX paragraph break (a visible blank gap).
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

export function renderDocBullet(raw: string): string {
  const text = oneLine(raw);
  const parts = text.split('**');
  // An unbalanced marker is shown literally rather than guessing which span was meant.
  if (parts.length % 2 === 0) return escapeLatex(text);
  return parts
    .map((part, i) => (i % 2 ? `\\textbf{${escapeLatex(part)}}` : escapeLatex(part)))
    .join('');
}

/** Version 2 documents: the writer chose every heading, date, location and stack. */
export function renderJakeDoc(profile: Profile, doc: ResumeDoc): string {
  const e = (text: string) => escapeLatex(oneLine(text));
  // A whitespace-only bullet renders as an invisible item: a blank gap with no bullet mark.
  const bulletList = (raw: string[]) => {
    const bullets = raw.filter((b) => oneLine(b.replaceAll('**', '')));
    return bullets.length
      ? '\n\\resumeItemListStart\n' +
          bullets.map((b) => `\\resumeItem{${renderDocBullet(b)}}`).join('\n') +
          '\n\\resumeItemListEnd'
      : '';
  };
  const sections = doc.sections.map((section) => {
    if (section.kind === 'skills') {
      const lines = section.skills.map((s) => `\\textbf{${e(s.category)}}{: ${e(s.items)}}`);
      return `\\section{${e(section.title)}}\n\\begin{itemize}[leftmargin=0.15in, label={}]\n\\small{\\item{\n${lines.join(' \\\\\n')}\n}}\n\\end{itemize}`;
    }
    const entries = section.entries.map((entry) => {
      if (section.kind === 'education')
        return `\\resumeSubheading{${e(entry.heading)}}{${e(entry.location)}}{${e(entry.subheading)}}{${e(entry.date)}}${bulletList(entry.bullets)}`;
      if (entry.stack || !entry.subheading) {
        const stack = entry.stack ? ` $|$ \\emph{${e(entry.stack)}}` : '';
        return `\\resumeProjectHeading{\\textbf{${e(entry.heading)}}${stack}}{${e(entry.date)}}${bulletList(entry.bullets)}`;
      }
      return `\\resumeSubheading{${e(entry.heading)}}{${e(entry.date)}}{${e(entry.subheading)}}{${e(entry.location)}}${bulletList(entry.bullets)}`;
    });
    return `\\section{${e(section.title)}}\n\\resumeSubHeadingListStart\n${entries.join('\n')}\n\\resumeSubHeadingListEnd`;
  });
  return jakeDocument(profile, sections);
}

function jakeDocument(profile: Profile, sections: string[]): string {
  const e = escapeLatex;
  const notices = JAKE_TEMPLATE_LICENSE.trimEnd()
    .split('\n')
    .map((line) => `% ${line}`)
    .join('\n');
  return (
    JAKE_TECTONIC_COMPATIBILITY +
    JAKE_TEMPLATE_PREAMBLE +
    String.raw`% User-requested Simplify-style margins (~0.45in sides, ~0.4in top/bottom) and tight
% bullet spacing; original Jake preamble retained above. Font sizes are unchanged.
\addtolength{\oddsidemargin}{-0.05in}
\addtolength{\evensidemargin}{-0.05in}
\addtolength{\textwidth}{0.1in}
\addtolength{\topmargin}{-0.1in}
\addtolength{\textheight}{0.2in}
\titleformat{\section}{
  \vspace{-6pt}\scshape\raggedright\large
}{}{0em}{}[\color{black}\titlerule \vspace{-5pt}]
\renewcommand{\resumeItemListStart}{\begin{itemize}[itemsep=0pt]}
` +
    notices +
    '\n% ResumeForge controlled body; synthetic review or user-approved facts only.\n' +
    '\\begin{document}\n\\begin{center}\n' +
    `\\textbf{\\Huge \\scshape ${e(profile.contact.name)}} \\\\ \\vspace{1pt}\n\\footnotesize ${contactLine(profile)}\n` +
    `\\end{center}\n\n${sections.join('\n\n')}\n\\end{document}\n`
  );
}
