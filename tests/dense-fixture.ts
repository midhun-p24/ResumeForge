import { randomUUID } from 'node:crypto';
import { fixture } from './fixtures';
import type { SourceRecord } from '@resumeforge/contracts';

/** Fictional evidence only, for checking content selection and page fitting. */
export function denseFixture() {
  const result = fixture();
  const base = result.input.profile.records[0];
  function add(
    kind: SourceRecord['kind'],
    title: string,
    contributions: string,
    technologies: string[],
  ) {
    result.input.profile.records.push({
      ...base,
      id: randomUUID(),
      kind,
      title,
      organization: 'Example University',
      metrics: [],
      contributions,
      technologies,
      accomplishments: contributions,
    });
  }
  add('education', 'Bachelor of Science in Computer Science', 'Studying computer science.', [
    'Algorithms',
    'Databases',
  ]);
  add('skill', 'Languages', 'Uses these languages in the approved projects.', [
    'TypeScript',
    'Python',
    'SQL',
    'Bash',
  ]);
  add('skill', 'Web and Databases', 'Uses these tools in approved engineering work.', [
    'React',
    'Next.js',
    'PostgreSQL',
    'Redis',
    'FastAPI',
  ]);
  add('skill', 'Systems and Delivery', 'Uses these tools in approved engineering work.', [
    'Linux',
    'Docker',
    'Git',
    'GitHub Actions',
  ]);
  add(
    'experience',
    'Software Engineering Assistant',
    'Implemented authenticated service endpoints and request validation. Built PostgreSQL query and indexing improvements. Added integration tests for authorization boundaries. Investigated production logs and documented incident recovery steps. Reviewed pull requests and coordinated releases.',
    ['TypeScript', 'PostgreSQL', 'Docker'],
  );
  add(
    'research',
    'Research Assistant',
    'Built reproducible dataset preprocessing and experiment configuration in Python. Compared baseline classifiers under consistent evaluation splits. Investigated erroneous predictions and documented limitations. Added automated validation of data shapes and evaluation outputs.',
    ['Python', 'PyTorch'],
  );
  add(
    'project',
    'Code Dependency Explorer',
    'Built interactive React graphs for inspecting dependencies. Parsed source code into structured dependency edges. Implemented FastAPI endpoints and WebSocket updates. Added malformed-input and reconnect tests. Documented local setup and architectural tradeoffs.',
    ['React', 'Python', 'FastAPI'],
  );
  add(
    'project',
    'Shared Expense Planner',
    'Built receipt entry and group expense allocation workflows. Implemented access-controlled API endpoints. Designed relational schemas and transaction handling. Added validation tests and keyboard-accessible forms.',
    ['TypeScript', 'React', 'PostgreSQL'],
  );
  add(
    'project',
    'Local Documentation Search',
    'Implemented document chunking and local search indexing. Built a query API and React search interface. Added source links and handled missing-document results. Evaluated retrieval behavior with manually reviewed queries.',
    ['Python', 'React'],
  );
  return result;
}
