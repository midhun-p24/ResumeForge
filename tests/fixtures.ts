import { randomUUID } from 'node:crypto';
import { emptyProfile } from '@resumeforge/contracts';
import type { AgentOutput, ResumeDoc, TaskInput } from '@resumeforge/contracts';
/** Entirely synthetic; never replace with a real person's profile. */
export function fixture(): { input: TaskInput; output: AgentOutput } {
  const source = randomUUID(),
    metric = randomUUID();
  const profile = structuredClone(emptyProfile);
  profile.contact = {
    name: 'Alex Example',
    email: 'alex@example.invalid',
    phone: '',
    location: 'Example City',
    links: ['https://example.invalid/portfolio'],
  };
  profile.records = [
    {
      id: source,
      kind: 'project',
      title: 'Synthetic Queue Service',
      organization: 'Example Lab',
      startDate: 'Jan 2025',
      endDate: 'Mar 2025',
      url: '',
      contributions: 'Designed a TypeScript task queue and tested retry behavior.',
      technologies: ['TypeScript', 'PostgreSQL'],
      accomplishments: 'Reduced duplicate task processing.',
      metrics: [
        {
          id: metric,
          value: '25%',
          context: 'Synthetic benchmark reduction in duplicate processing.',
        },
      ],
      sourceNotes: 'Synthetic fixture only.',
      verification: 'approved',
      publicationStatus: 'not_applicable',
      gpa: '',
    },
  ];
  const input: TaskInput = {
    schemaVersion: 1,
    taskId: randomUUID(),
    operation: 'tailor',
    format: 'records_v1',
    profile,
    job: {
      company: 'Example Systems',
      title: 'Software Engineer',
      description:
        'Build reliable backend systems with TypeScript and PostgreSQL. Experience with task queues is preferred.',
      url: '',
      location: 'Remote',
      notes: '',
    },
    instructions: 'Use only approved synthetic facts.',
    priorOutput: null,
    revisionRequest: '',
    lockedBulletIds: [],
    lockedSectionIds: [],
    excludedSourceIds: [],
  };
  const output: AgentOutput = {
    schemaVersion: 1,
    analysis: {
      requirements: [
        {
          id: randomUUID(),
          category: 'required',
          text: 'TypeScript',
          evidence: 'strong',
          sourceIds: [source],
          explanation: 'Approved project uses TypeScript.',
        },
      ],
      summary: 'Supported TypeScript evidence; other requirements need review.',
      gaps: [],
      unknowns: ['Work authorization not specified.'],
      eligibility: ['Review location and work authorization.'],
      education: 'Not specified.',
      experience: 'Project evidence available.',
      tailoringPlan: ['Prioritize the queue project.'],
    },
    selectedSourceIds: [source],
    resume: {
      sections: [
        {
          id: randomUUID(),
          title: 'Projects',
          entries: [
            {
              sourceId: source,
              bullets: [
                {
                  id: randomUUID(),
                  text: 'Reduced duplicate task processing by 25% through a TypeScript queue.',
                  sourceIds: [source],
                  metricIds: [metric],
                },
              ],
            },
          ],
        },
      ],
    },
    warnings: ['Synthetic fixture; review before use.'],
  };
  return { input, output };
}

/** A synthetic source-based (v2) task and document. Never replace with a real profile. */
export function docFixture(): { input: TaskInput; doc: ResumeDoc } {
  const { input } = fixture();
  input.format = 'doc_v2';
  input.profile.masterText = [
    'Alex Example, Example City',
    'Example University, B.S. Computer Science, Aug. 2022 - May 2026, GPA 3.8',
    'Software Intern, Example Systems, June 2025 - Aug. 2025',
    '- Built a TypeScript task queue that cut duplicate processing by 25%.',
    '- Wrote PostgreSQL migrations reviewed in code reviews.',
    'Queue Visualizer (2025): React and Node.js dashboard for 40 queues.',
  ].join('\n');
  const doc: ResumeDoc = {
    schemaVersion: 2,
    sections: [
      {
        title: 'Education',
        kind: 'education',
        entries: [
          {
            heading: 'Example University',
            subheading: 'B.S. in Computer Science; GPA: 3.8',
            date: 'Aug. 2022 -- May 2026',
            location: 'Example City',
            stack: '',
            bullets: [],
          },
        ],
        skills: [],
      },
      {
        title: 'Technical Skills',
        kind: 'skills',
        entries: [],
        skills: [{ category: 'Languages', items: 'TypeScript, SQL' }],
      },
      {
        title: 'Experience',
        kind: 'entries',
        entries: [
          {
            heading: 'Software Intern',
            subheading: 'Example Systems',
            date: 'June 2025 -- Aug. 2025',
            location: 'Example City',
            stack: '',
            bullets: ['Cut duplicate processing by **25%** with a TypeScript task queue.'],
          },
        ],
        skills: [],
      },
      {
        title: 'Projects',
        kind: 'entries',
        entries: [
          {
            heading: 'Queue Visualizer',
            subheading: '',
            date: '2025',
            location: '',
            stack: 'React, Node.js',
            bullets: ['Built a React and Node.js dashboard monitoring **40 queues**.'],
          },
        ],
        skills: [],
      },
    ],
    coverLetter:
      'Dear Example Systems Hiring Team,\n\nMy task queue cut duplicate processing by 25%.\n\nSincerely,\nAlex Example',
    keywords: [{ keyword: 'TypeScript', covered: true, where: 'Experience' }],
    gaps: [],
    notes: [],
  };
  return { input, doc };
}
