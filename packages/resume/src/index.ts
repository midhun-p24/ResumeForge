import type { AgentOutput, Profile } from '@resumeforge/contracts';
import { renderJakeResume } from './jake';
export { renderJakeResume } from './jake';
export type ResumeTemplateId = 'compatible-v1' | 'jake-v1';
// The supplied canonical template remains review-only until the sample is approved.
export const DEFAULT_RESUME_TEMPLATE: ResumeTemplateId = 'compatible-v1';

export function escapeLatex(value: string): string {
  const chars: Record<string, string> = {
    '\\': '\\textbackslash{}',
    '{': '\\{',
    '}': '\\}',
    $: '\\$',
    '&': '\\&',
    '#': '\\#',
    '%': '\\%',
    _: '\\_',
    '~': '\\textasciitilde{}',
    '^': '\\textasciicircum{}',
  };
  return value.replace(/[\\{}$&#%_~^]/g, (c) => chars[c]).replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
}
export function safeFilename(name: string, company: string, role: string) {
  return (
    [name || 'Resume', company, role]
      .map((s) =>
        s
          .normalize('NFKD')
          .replace(/[^a-zA-Z0-9]+/g, '_')
          .replace(/^_|_$/g, '')
          .slice(0, 55),
      )
      .filter(Boolean)
      .join('_') || 'ResumeForge'
  );
}
/** Original compatible default inspired by the single-column Jake's Resume layout.
 * No upstream template source is copied; replacement is application-controlled. */
export function renderLatex(
  profile: Profile,
  output: AgentOutput,
  template: ResumeTemplateId = DEFAULT_RESUME_TEMPLATE,
): string {
  if (template === 'jake-v1') return renderJakeResume(profile, output);
  const e = escapeLatex;
  const records = new Map(
    profile.records.filter((r) => r.verification === 'approved').map((r) => [r.id, r]),
  );
  const sections = output.resume.sections
    .map(
      (s) =>
        `\\section*{${e(s.title)}}\n` +
        s.entries
          .map((entry) => {
            const r = records.get(entry.sourceId);
            if (!r) throw new Error('Unapproved rendering source');
            if (r.kind === 'skill') {
              return `\\noindent\\textbf{${e(r.title)}}${r.technologies.length ? ': ' + e(r.technologies.join(', ')) : ''}${entry.bullets.length ? ': ' + entry.bullets.map((b) => e(b.text)).join('; ') : ''}\\par\n`;
            }
            const details = [r.organization, [r.startDate, r.endDate].filter(Boolean).join(' -- ')]
              .filter(Boolean)
              .join(' | ');
            const meta = [
              r.kind === 'publication' && r.publicationStatus !== 'not_applicable'
                ? r.publicationStatus.replace('_', ' ')
                : '',
              r.kind === 'education' && profile.preferences.includeGpa && r.gpa
                ? `GPA: ${r.gpa}`
                : '',
              r.url,
            ]
              .filter(Boolean)
              .join(' | ');
            return `\\noindent\\textbf{${e(r.title)}}\\\\\n{\\small ${e(details)}}\\par\n${meta ? `{\\small ${e(meta)}}\\par\n` : ''}${entry.bullets.length ? '\\begin{itemize}\n' + entry.bullets.map((b) => `\\item ${e(b.text)}`).join('\n') + '\n\\end{itemize}' : ''}`;
          })
          .join('\n'),
    )
    .join('\n');
  return `% ResumeForge compatible default v1. Original template; not the exact Jake's Resume source.\n\\documentclass[letterpaper,11pt]{article}
\\usepackage[margin=0.6in]{geometry}
\\usepackage[T1]{fontenc}
\\usepackage{lmodern}
\\usepackage{enumitem}
\\usepackage{titlesec}
\\usepackage[hidelinks]{hyperref}
\\pagestyle{empty}
\\setlength{\\parindent}{0pt}
\\setlist[itemize]{leftmargin=14pt,itemsep=1pt,topsep=3pt,parsep=0pt}
\\titleformat{\\section}{\\large\\bfseries}{}{0em}{}[\\titlerule]
\\titlespacing*{\\section}{0pt}{8pt}{5pt}
\\begin{document}
\\begin{center}
{\\LARGE\\bfseries ${e(profile.contact.name)}}\\\\[3pt]
{\\small ${e([profile.contact.email, profile.contact.phone, profile.contact.location, ...profile.contact.links].filter(Boolean).join(' | '))}}
\\end{center}
${sections}
\\end{document}\n`;
}
