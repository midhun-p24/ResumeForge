import type { Profile, ResumeDoc } from '@resumeforge/contracts';

/**
 * A synthetic resume that uses every part of the template: contact separators and links,
 * education, skills, roles with italic organization lines, projects, bold, dates and escaped
 * symbols. Tectonic downloads a separate file for each font size and shape, so warming up with
 * anything smaller leaves real resumes unable to compile offline.
 */
export function warmupDocument(): { profile: Profile; doc: ResumeDoc } {
  const profile: Profile = {
    contact: {
      name: 'Synthetic Compiler Check',
      email: 'test@example.invalid',
      phone: '555-0100',
      location: 'Example City, ST',
      links: [
        'https://example.invalid',
        'https://github.com/example',
        'https://www.linkedin.com/in/example',
      ],
    },
    records: [],
    masterText: '',
    portfolioText: '',
    referenceResume: '',
    preferences: { roles: [], includeGpa: false, instructions: '' },
  };
  const entry = (heading: string, subheading: string, stack: string, bullets: string[]) => ({
    heading,
    subheading,
    date: 'Aug. 2023 -- Present',
    location: subheading ? 'Example City, ST' : '',
    stack,
    bullets,
  });
  const doc: ResumeDoc = {
    schemaVersion: 2,
    sections: [
      {
        title: 'Education',
        kind: 'education',
        skills: [],
        entries: [
          entry('Example University', 'B.S. in Computer Science; GPA: 3.50/4.00', '', [
            "**Honors:** 1st Place, Example Paper; President's List",
          ]),
        ],
      },
      {
        title: 'Technical Skills',
        kind: 'skills',
        entries: [],
        skills: [
          { category: 'Languages', items: 'TypeScript, C#, C/C++, SQL, HTML/CSS' },
          { category: 'Tools & DevOps', items: 'Git, Docker, CI/CD, AWS (EC2, S3)' },
        ],
      },
      {
        title: 'Experience',
        kind: 'entries',
        skills: [],
        entries: [
          entry('Research Assistant', 'Example University, Example Lab', '', [
            'Raised mean ROC AUC by **+0.045** with R&D on 32-channel data at 100% coverage #1 ~ 20,000+.',
            'Implemented A* routing over 700+ tasks for **~20%** better efficiency.',
          ]),
        ],
      },
      {
        title: 'Projects',
        kind: 'entries',
        skills: [],
        entries: [
          entry('Compiler Check', '', 'TypeScript, React, Node.js', [
            'Warmed the **fixed** template packages and fonts for offline compilation.',
          ]),
        ],
      },
    ],
    coverLetter: '',
    keywords: [],
    gaps: [],
    notes: [],
  };
  return { profile, doc };
}
