import { z } from 'zod';

export const SCHEMA_VERSION = 1 as const;
const text = z.string().max(8000);
const short = z.string().max(300);
export const idSchema = z.string().uuid();
export const linkSchema = z
  .string()
  .max(1500)
  .refine((v) => !v || /^https?:\/\//i.test(v), 'Use an http(s) URL');
export const recordSchema = z.object({
  id: idSchema,
  kind: z.enum([
    'experience',
    'research',
    'project',
    'education',
    'publication',
    'presentation',
    'award',
    'skill',
    'coursework',
  ]),
  title: short.min(1),
  organization: short,
  startDate: short,
  endDate: short,
  url: linkSchema,
  contributions: text,
  technologies: z.array(short).max(60),
  accomplishments: text,
  metrics: z.array(z.object({ id: idSchema, value: short.min(1), context: short.min(1) })).max(30),
  sourceNotes: text,
  verification: z.enum(['draft', 'approved']),
  publicationStatus: z.enum([
    'not_applicable',
    'published',
    'accepted',
    'submitted',
    'in_progress',
  ]),
  gpa: short,
});
export const profileSchema = z
  .object({
    contact: z.object({
      name: short,
      email: z.union([z.literal(''), z.email()]),
      phone: short,
      location: short,
      links: z.array(linkSchema).max(8),
    }),
    records: z.array(recordSchema).max(150),
    masterText: z.string().max(60000),
    // Raw tailoring sources beside the master resume; older saved profiles omit them.
    portfolioText: z.string().max(30000).default(''),
    referenceResume: z.string().max(30000).default(''),
    preferences: z.object({
      roles: z.array(short).max(12),
      includeGpa: z.boolean(),
      instructions: text,
    }),
  })
  .superRefine((p, ctx) => {
    const ids = p.records.flatMap((r) => [r.id, ...r.metrics.map((m) => m.id)]);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: 'custom', message: 'Profile IDs must be unique' });
  });
export type Profile = z.infer<typeof profileSchema>;
export type SourceRecord = z.infer<typeof recordSchema>;
export const emptyProfile: Profile = {
  contact: { name: '', email: '', phone: '', location: '', links: [] },
  records: [],
  masterText: '',
  portfolioText: '',
  referenceResume: '',
  preferences: {
    roles: [
      'Software engineering',
      'Software development',
      'Systems engineering',
      'Research / ML engineering',
    ],
    includeGpa: false,
    instructions: '',
  },
};

export const jobSchema = z.object({
  company: short.min(1),
  title: short.min(1),
  description: z.string().min(40).max(60000),
  url: linkSchema,
  location: short,
  notes: text,
});
export type Job = z.infer<typeof jobSchema>;
export const stages = [
  'Saved',
  'Tailoring',
  'Ready to apply',
  'Applied',
  'Interviewing',
  'Rejected',
  'Offer',
  'Withdrawn',
] as const;
export const applicationSchema = z.object({
  stage: z.enum(stages),
  notes: text,
  appliedAt: z.union([z.literal(''), z.iso.date()]),
  resumeVersionId: idSchema.nullable(),
});
export const bulletSchema = z.object({
  id: idSchema,
  text: short.min(1),
  sourceIds: z.array(idSchema).min(1).max(20),
  metricIds: z.array(idSchema).max(20),
  // Literal text spans only; never Markdown or LaTeX. Optional for saved v1 resumes.
  emphasis: z.array(short.min(1).max(100)).max(2).optional(),
});
export const sectionSchema = z.object({
  id: idSchema,
  title: short.min(1),
  entries: z
    .array(z.object({ sourceId: idSchema, bullets: z.array(bulletSchema).max(12) }))
    .max(20),
});
export const resumeSchema = z.object({ sections: z.array(sectionSchema).max(12) });
export type Resume = z.infer<typeof resumeSchema>;
export const requirementSchema = z.object({
  id: idSchema,
  category: z.enum(['required', 'responsibility', 'domain', 'preferred']),
  text: short.min(1),
  evidence: z.enum(['strong', 'partial', 'missing', 'unknown']),
  sourceIds: z.array(idSchema).max(20),
  explanation: text,
});
export const analysisSchema = z.object({
  requirements: z.array(requirementSchema).max(80),
  summary: text,
  gaps: z.array(short).max(30),
  unknowns: z.array(short).max(30),
  eligibility: z.array(short).max(30),
  education: text,
  experience: text,
  tailoringPlan: z.array(short).max(20),
});
export const agentOutputSchema = z.object({
  schemaVersion: z.literal(1),
  analysis: analysisSchema,
  selectedSourceIds: z.array(idSchema).max(150),
  resume: resumeSchema,
  warnings: z.array(short).max(40),
  // Plain-text cover letter. Optional because versions before 0.4.0 have none.
  coverLetter: z.string().max(4000).optional(),
});
export type AgentOutput = z.infer<typeof agentOutputSchema>;
// Saved v1 resumes may omit emphasis. The model-facing schema must instead
// require every property; null explicitly represents the older omitted value.
const generationBulletSchema = bulletSchema.extend({
  emphasis: bulletSchema.shape.emphasis.unwrap().nullable(),
});
export const generationOutputSchema = agentOutputSchema.extend({
  coverLetter: z.string().max(4000),
  resume: resumeSchema.extend({
    sections: z
      .array(
        sectionSchema.extend({
          entries: z
            .array(
              sectionSchema.shape.entries.element.extend({
                bullets: z.array(generationBulletSchema).max(12),
              }),
            )
            .max(20),
        }),
      )
      .max(12),
  }),
});
export function parseGeneratedAgentOutput(value: unknown): AgentOutput {
  const generated = generationOutputSchema.parse(value);
  return agentOutputSchema.parse({
    ...generated,
    resume: {
      sections: generated.resume.sections.map((section) => ({
        ...section,
        entries: section.entries.map((entry) => ({
          ...entry,
          bullets: entry.bullets.map(({ emphasis, ...bullet }) =>
            emphasis === null ? bullet : { ...bullet, emphasis },
          ),
        })),
      })),
    },
  });
}
// Version 2: the writer authors the resume directly from the raw source texts. Bullets are plain
// text where **double asterisks** mark at most two short bold spans; the renderer escapes the rest.
const docEntrySchema = z.object({
  heading: short.min(1),
  subheading: short,
  date: z.string().max(80),
  location: z.string().max(80),
  stack: short,
  bullets: z.array(z.string().min(1).max(400)).max(6),
});
const docSectionSchema = z.object({
  title: z.string().min(1).max(60),
  kind: z.enum(['education', 'skills', 'entries']),
  entries: z.array(docEntrySchema).max(12),
  skills: z.array(z.object({ category: z.string().min(1).max(80), items: short.min(1) })).max(8),
});
export const resumeDocSchema = z.object({
  schemaVersion: z.literal(2),
  sections: z.array(docSectionSchema).min(1).max(8),
  coverLetter: z.string().max(4000),
  keywords: z
    .array(z.object({ keyword: z.string().min(1).max(80), covered: z.boolean(), where: short }))
    .max(40),
  gaps: z.array(short).max(20),
  notes: z.array(short).max(20),
});
export type ResumeDoc = z.infer<typeof resumeDocSchema>;
/** Model-facing shape: every property required; the version marker is added after parsing. */
export const generationDocSchema = resumeDocSchema.omit({ schemaVersion: true });
export function parseGeneratedDoc(value: unknown): ResumeDoc {
  return resumeDocSchema.parse({ ...generationDocSchema.parse(value), schemaVersion: 2 });
}
export const versionOutputSchema = z.discriminatedUnion('schemaVersion', [
  agentOutputSchema,
  resumeDocSchema,
]);
export type VersionOutput = z.infer<typeof versionOutputSchema>;

export const taskInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    taskId: idSchema,
    operation: z.enum(['tailor', 'revise', 'render']),
    // doc_v2 tasks are written from raw sources; records_v1 is kept for rendering old versions.
    format: z.enum(['records_v1', 'doc_v2']).default('records_v1'),
    profile: profileSchema,
    job: jobSchema,
    instructions: text,
    priorOutput: versionOutputSchema.nullable(),
    revisionRequest: text,
    lockedBulletIds: z.array(idSchema).max(200),
    lockedSectionIds: z.array(idSchema).max(12),
    excludedSourceIds: z.array(idSchema).max(150),
  })
  .superRefine((t, ctx) => {
    if (t.operation !== 'tailor' && !t.priorOutput)
      ctx.addIssue({ code: 'custom', message: 'Revision/render needs a prior version' });
    if (t.operation === 'tailor' && (t.lockedBulletIds.length || t.lockedSectionIds.length))
      ctx.addIssue({ code: 'custom', message: 'Locks require a prior resume' });
    if (t.format === 'doc_v2' && t.priorOutput && t.priorOutput.schemaVersion !== 2)
      ctx.addIssue({ code: 'custom', message: 'Version 2 tasks need a version 2 prior resume' });
    if (t.format === 'records_v1' && t.priorOutput && t.priorOutput.schemaVersion !== 1)
      ctx.addIssue({ code: 'custom', message: 'Record tasks need a record-based prior resume' });
  });
export type TaskInput = z.infer<typeof taskInputSchema>;
export const COMPANION_VERSION = '0.5.4';
export const DOC_V2_CAPABILITY = 'tailor_doc_v2';
export const importTaskSchema = z.object({
  schemaVersion: z.literal(1),
  taskId: idSchema,
  operation: z.literal('import_profile'),
  rawText: z.string().trim().min(40).max(60000),
});
export type ImportTaskInput = z.infer<typeof importTaskSchema>;
const importMetricSchema = z.object({
  value: short.min(1),
  context: short.min(1),
  sourceQuote: text.min(1),
});
export const proposedRecordSchema = z.object({
  record: recordSchema
    .omit({ id: true, verification: true, metrics: true })
    .extend({ metrics: z.array(importMetricSchema).max(30) }),
  sourceQuote: text.min(1),
  warnings: z.array(short).max(20),
});
export const importOutputSchema = z.object({
  schemaVersion: z.literal(1),
  contact: profileSchema.shape.contact,
  contactSourceQuote: z.string().max(8000),
  records: z.array(proposedRecordSchema).max(100),
  warnings: z.array(short).max(30),
});
export type ImportOutput = z.infer<typeof importOutputSchema>;
const sourceRangeSchema = z.object({
  startLine: z.number().int().min(0),
  endLine: z.number().int().min(0),
});
const sourceMetricSchema = importMetricSchema
  .omit({ sourceQuote: true })
  .extend({ source: sourceRangeSchema });
export const sourceProposalSchema = proposedRecordSchema
  .omit({ sourceQuote: true, record: true })
  .extend({
    source: sourceRangeSchema,
    record: proposedRecordSchema.shape.record
      .omit({ metrics: true })
      .extend({ metrics: z.array(sourceMetricSchema).max(30) }),
  });
export const sourceImportOutputSchema = importOutputSchema
  .omit({ contactSourceQuote: true, records: true })
  .extend({
    contactSource: sourceRangeSchema,
    records: z.array(sourceProposalSchema).max(100),
  });
export type SourceImportOutput = z.infer<typeof sourceImportOutputSchema>;
export function numberedImportSource(rawText: string): string {
  return rawText
    .split(/\r?\n/)
    .map((line, index) => `${index + 1}: ${line}`)
    .join('\n');
}
/** The application copies source lines; the model never has to reproduce long excerpts. */
export function resolveImportSources(
  input: ImportTaskInput,
  extracted: SourceImportOutput,
): { output: ImportOutput; diagnostics: string[] } {
  const lines = input.rawText.split(/\r?\n/);
  const diagnostics: string[] = [];
  const quote = (range: z.infer<typeof sourceRangeSchema>, path: string, emptyAllowed = false) => {
    if (emptyAllowed && range.startLine === 0 && range.endLine === 0) return '';
    if (range.startLine < 1 || range.endLine < range.startLine || range.endLine > lines.length) {
      diagnostics.push(`${path}: invalid source line range`);
      return '';
    }
    const text = lines.slice(range.startLine - 1, range.endLine).join('\n');
    if (!text.trim() || text.length > 8000) {
      diagnostics.push(`${path}: empty or oversized source excerpt`);
      return '';
    }
    return text;
  };
  const output: ImportOutput = {
    schemaVersion: 1,
    contact: extracted.contact,
    contactSourceQuote: quote(extracted.contactSource, 'contact', true),
    warnings: extracted.warnings,
    records: extracted.records.map((proposal, index) => ({
      warnings: proposal.warnings,
      sourceQuote: quote(proposal.source, `records.${index}`),
      record: {
        ...proposal.record,
        metrics: proposal.record.metrics.map((metric, i) => ({
          value: metric.value,
          context: metric.context,
          sourceQuote: quote(metric.source, `records.${index}.metrics.${i}`),
        })),
      },
    })),
  };
  return { output, diagnostics };
}
export const companionTaskSchema = z.union([taskInputSchema, importTaskSchema]);
const importNormalize = (text: string) => text.normalize('NFKC').replace(/\s+/g, ' ').trim();
export function validateImport(input: ImportTaskInput, output: ImportOutput): string[] {
  const errors: string[] = [];
  const source = importNormalize(input.rawText);
  const quoteExists = (quote: string) => !!quote.trim() && source.includes(importNormalize(quote));
  if (JSON.stringify(output).length > 750000) errors.push('Import result exceeds its size limit');
  if (
    Object.values(output.contact).some((value) =>
      Array.isArray(value) ? value.length : !!value,
    ) &&
    !quoteExists(output.contactSourceQuote)
  )
    errors.push('Contact information needs a literal source excerpt');
  for (const proposal of output.records) {
    if (!quoteExists(proposal.sourceQuote)) errors.push('Record needs a literal source excerpt');
    for (const metric of proposal.record.metrics) {
      if (!quoteExists(metric.sourceQuote)) errors.push('Metric needs a literal source excerpt');
      const numbers = metric.value.match(/\d+(?:[,.]\d+)*/g) ?? [];
      const supported: string[] = metric.sourceQuote.match(/\d+(?:[,.]\d+)*/g) ?? [];
      if (numbers.some((number) => !supported.includes(number)))
        errors.push('Metric number does not appear in its source excerpt');
    }
  }
  return [...new Set(errors)];
}
/** After a bounded repair, retain only source-valid proposals, with explicit omissions. */
export function recoverImportDrafts(
  input: ImportTaskInput,
  output: ImportOutput,
): ImportOutput | null {
  const emptyContact = { name: '', email: '', phone: '', location: '', links: [] };
  const base = {
    ...output,
    contact: emptyContact,
    contactSourceQuote: '',
    records: [],
    warnings: [],
  };
  let droppedMetrics = 0;
  const records = output.records.flatMap((proposal) => {
    if (
      validateImport(input, {
        ...base,
        records: [{ ...proposal, record: { ...proposal.record, metrics: [] } }],
      }).length
    )
      return [];
    const metrics = proposal.record.metrics.filter(
      (metric) =>
        !validateImport(input, {
          ...base,
          records: [{ ...proposal, record: { ...proposal.record, metrics: [metric] } }],
        }).length,
    );
    const removed = proposal.record.metrics.length - metrics.length;
    droppedMetrics += removed;
    return [
      {
        ...proposal,
        record: { ...proposal.record, metrics },
        warnings: [
          ...proposal.warnings,
          ...(removed
            ? [
                `${removed} candidate metrics omitted because source validation failed. Review the original text before approval.`,
              ]
            : []),
        ].slice(0, 20),
      },
    ];
  });
  if (!records.length) return null;
  const contactValid = !validateImport(input, { ...output, records: [] }).length;
  const dropped = output.records.length - records.length;
  const recovered = {
    ...output,
    records,
    contact: contactValid ? output.contact : emptyContact,
    contactSourceQuote: contactValid ? output.contactSourceQuote : '',
    warnings: [
      `Partial extraction after repair: ${records.length} of ${output.records.length} proposals retained; ${dropped} records and ${droppedMetrics} metrics omitted. Review the original resume for missing content.`,
      ...(!contactValid
        ? ['Contact extraction omitted because its source could not be validated.']
        : []),
      ...output.warnings,
    ].slice(0, 30),
  };
  return validateImport(input, recovered).length ? null : recovered;
}
export function recordIdentity(
  record: Pick<SourceRecord, 'kind' | 'title' | 'organization' | 'startDate' | 'endDate'>,
): string {
  return [record.kind, record.title, record.organization, record.startDate, record.endDate]
    .map((value) => value.replace(/\s+/g, ' ').trim().toLowerCase())
    .join('|');
}
export interface ProfileImportView {
  id: string;
  state: string;
  stage: string;
  error_code: string | null;
  created_at: string;
  import_applied_at: string | null;
  draft?: ImportOutput | null;
  diagnostics?: string[];
}
export const progressStages = [
  'Parsing master resume',
  'Repairing extracted records',
  'Reviewing extracted records',
  'Analyzing requirements',
  'Selecting experience',
  'Writing resume',
  'Rendering PDF',
  'Checking layout',
] as const;
export const renderSchema = z.object({
  status: z.enum(['ready', 'overflow', 'review_required', 'failed']),
  pageCount: z.number().int().min(0).max(100),
  textVerified: z.boolean(),
  warnings: z.array(short).max(30),
});
export type RenderStatus = z.infer<typeof renderSchema>;
export const completionSchema = z.object({
  leaseToken: idSchema,
  output: versionOutputSchema,
  render: renderSchema,
  pdf: z.string().max(2800000).nullable(),
});

/** A reproducible evidence coverage heuristic; never a hiring probability. */
export function fitScore(analysis: AgentOutput['analysis']) {
  const weights = { required: 45, responsibility: 30, domain: 15, preferred: 10 };
  let earned = 0,
    possible = 0;
  for (const category of Object.keys(weights) as (keyof typeof weights)[]) {
    const items = analysis.requirements.filter((r) => r.category === category);
    if (!items.length) continue;
    possible += weights[category];
    earned +=
      (weights[category] *
        items.reduce(
          (s, r) => s + { strong: 1, partial: 0.5, missing: 0, unknown: 0 }[r.evidence],
          0,
        )) /
      items.length;
  }
  return possible ? Math.round((100 * earned) / possible) : null;
}

/** Whole numeric tokens without trailing sentence punctuation. */
export function numberTokens(value: string): string[] {
  return (value.match(/\d[\d,.]*/g) ?? []).map((n) => n.replace(/[.,]+$/, ''));
}

export function validateEvidence(input: TaskInput, output: AgentOutput): string[] {
  const errors: string[] = [];
  if (input.operation === 'render' && JSON.stringify(input.priorOutput) !== JSON.stringify(output))
    errors.push('Rendering must preserve saved content exactly');
  const approved = new Map(
    input.profile.records
      .filter((r) => r.verification === 'approved' && !input.excludedSourceIds.includes(r.id))
      .map((r) => [r.id, r]),
  );
  const metrics = new Map(
    [...approved.values()].flatMap((r) =>
      r.metrics.map((m) => [m.id, { ...m, sourceId: r.id }] as const),
    ),
  );
  const selected = new Set(output.selectedSourceIds);
  if (selected.size !== output.selectedSourceIds.length) errors.push('Duplicate selected source');
  for (const id of selected)
    if (!approved.has(id)) errors.push('Selected source is unapproved or excluded');
  const seen = new Set<string>();
  for (const s of output.resume.sections) {
    if (seen.has(s.id)) errors.push('Duplicate resume ID');
    seen.add(s.id);
    for (const entry of s.entries) {
      if (!approved.has(entry.sourceId) || !selected.has(entry.sourceId))
        errors.push('Entry source is not approved and selected');
      for (const b of entry.bullets) {
        const spans = b.emphasis ?? [];
        const ranges = spans.map((span) => ({
          start: b.text.indexOf(span),
          end: b.text.indexOf(span) + span.length,
        }));
        if (
          new Set(spans).size !== spans.length ||
          spans.some((span) => !b.text.includes(span)) ||
          spans.reduce((length, span) => length + span.length, 0) > b.text.length / 2 ||
          ranges.some((span, i) =>
            ranges.some((other, j) => i !== j && span.start < other.end && span.end > other.start),
          )
        )
          errors.push('Emphasis must be selective, distinct literal bullet spans');
        if (seen.has(b.id)) errors.push('Duplicate resume ID');
        seen.add(b.id);
        if (!b.sourceIds.includes(entry.sourceId)) errors.push('Bullet must cite its entry source');
        for (const id of b.sourceIds)
          if (!approved.has(id)) errors.push('Bullet cites an unapproved source');
        for (const id of b.metricIds)
          if (!metrics.has(id) || !b.sourceIds.includes(metrics.get(id)!.sourceId))
            errors.push('Unsupported metric reference');
        // Every numeric token in a generated bullet must appear in an explicitly cited metric.
        const numbers = b.text.match(/\d[\d,.]*/g) ?? [];
        const supported = b.metricIds.flatMap(
          (id) => (metrics.get(id)?.value ?? '').match(/\d[\d,.]*/g) ?? [],
        );
        if (numbers.some((n) => !supported.includes(n)))
          errors.push('Numeric bullet claim lacks an approved metric');
      }
    }
  }
  for (const r of output.analysis.requirements) {
    if (['strong', 'partial'].includes(r.evidence) && !r.sourceIds.length)
      errors.push('Supported requirement needs source evidence');
    if (r.sourceIds.some((id) => !approved.has(id)))
      errors.push('Requirement cites an unapproved source');
  }
  // Cover letter numbers must already exist in approved profile facts or the posting itself.
  // Compare whole numeric tokens from human-readable fields only; IDs and URLs contain digits.
  const facts = [...approved.values()].flatMap((r) => [
    r.title,
    r.organization,
    r.startDate,
    r.endDate,
    r.contributions,
    r.accomplishments,
    r.gpa,
    ...r.technologies,
    ...r.metrics.flatMap((m) => [m.value, m.context]),
  ]);
  const supported = new Set(
    numberTokens(
      [
        ...facts,
        input.job.company,
        input.job.title,
        input.job.description,
        input.job.location,
      ].join(' '),
    ),
  );
  if (numberTokens(output.coverLetter ?? '').some((n) => !supported.has(n)))
    errors.push('Cover letter numeric claim lacks profile or posting support');
  if (input.priorOutput?.schemaVersion === 1) {
    const before = input.priorOutput.resume;
    for (const id of input.lockedSectionIds) {
      const a = before.sections.find((s) => s.id === id),
        b = output.resume.sections.find((s) => s.id === id);
      if (!a || JSON.stringify(a) !== JSON.stringify(b)) errors.push('Locked section changed');
    }
    const oldBullets = before.sections.flatMap((s) =>
      s.entries.flatMap((e) =>
        e.bullets.map((b) => ({ bullet: b, section: s.id, source: e.sourceId })),
      ),
    );
    const newBullets = output.resume.sections.flatMap((s) =>
      s.entries.flatMap((e) =>
        e.bullets.map((b) => ({ bullet: b, section: s.id, source: e.sourceId })),
      ),
    );
    for (const id of input.lockedBulletIds) {
      const a = oldBullets.find((b) => b.bullet.id === id),
        b = newBullets.find((b) => b.bullet.id === id);
      if (!a || JSON.stringify(a) !== JSON.stringify(b))
        errors.push('Locked bullet changed or moved');
    }
  }
  return [...new Set(errors)];
}

/** Every human-readable string in a v2 document, for checks and text verification. */
export function docTexts(doc: ResumeDoc): string[] {
  return [
    ...doc.sections.flatMap((s) => [
      s.title,
      ...s.entries.flatMap((e) => [
        e.heading,
        e.subheading,
        e.date,
        e.location,
        e.stack,
        ...e.bullets,
      ]),
      ...s.skills.flatMap((k) => [k.category, k.items]),
    ]),
    doc.coverLetter,
  ];
}
/** The facts a v2 document may draw on: the raw sources, the posting and the user's request. */
export function docSourceText(input: TaskInput): string {
  const { profile, job } = input;
  return [
    profile.masterText,
    profile.portfolioText,
    profile.referenceResume,
    profile.contact.name,
    profile.contact.location,
    job.company,
    job.title,
    job.description,
    job.location,
    input.revisionRequest,
  ].join('\n');
}
/** Layout-independent structure rules, including selective **bold** spans. */
export function docStructureIssues(doc: ResumeDoc): string[] {
  const errors: string[] = [];
  for (const s of doc.sections) {
    if (s.kind === 'skills' ? !s.skills.length || s.entries.length : !s.entries.length)
      errors.push(`Section "${s.title}" does not match its kind`);
    for (const bullet of s.entries.flatMap((e) => e.bullets)) {
      const marks = bullet.split('**').length - 1;
      const bold = [...bullet.matchAll(/\*\*(.+?)\*\*/g)].map((m) => m[1]);
      if (marks % 2 || marks / 2 > 2 || bold.join('').length > bullet.length / 2)
        errors.push(`Bold must be at most two short **spans**: "${bullet.slice(0, 50)}"`);
    }
  }
  if (new Set(doc.sections.map((s) => s.title.toLowerCase())).size !== doc.sections.length)
    errors.push('Section titles must be unique');
  return errors;
}
/** Numbers that appear in the document but nowhere in the sources or posting. */
export function unsupportedDocNumbers(input: TaskInput, doc: ResumeDoc): string[] {
  const supported = new Set(numberTokens(docSourceText(input)));
  return [...new Set(docTexts(doc).flatMap(numberTokens))].filter((n) => !supported.has(n));
}
/** Headings whose distinctive words mostly do not occur in the sources (a review warning). */
export function unsourcedHeadings(input: TaskInput, doc: ResumeDoc): string[] {
  const source = docSourceText(input).toLowerCase();
  return doc.sections
    .flatMap((s) => s.entries.map((e) => e.heading))
    .filter((heading) => {
      const words = heading.toLowerCase().match(/[a-z][a-z0-9+#.]{3,}/g) ?? [];
      return words.length > 0 && words.filter((w) => source.includes(w)).length < words.length / 2;
    });
}
export function validateDoc(input: TaskInput, doc: ResumeDoc): string[] {
  const errors = docStructureIssues(doc);
  if (input.operation === 'render' && JSON.stringify(input.priorOutput) !== JSON.stringify(doc))
    errors.push('Rendering must preserve saved content exactly');
  const numbers = unsupportedDocNumbers(input, doc);
  if (numbers.length)
    errors.push(
      `These numbers do not appear in the sources or posting: ${numbers.join(', ')}. Use only sourced numbers.`,
    );
  return errors;
}

export interface DeviceView {
  companion_version?: string | null;
  capabilities?: string[];
  id: string;
  name: string;
  last_seen: string | null;
  revoked_at: string | null;
  agent_status: string;
}
export interface JobView {
  id: string;
  data: Job;
  created_at: string;
}
export interface TaskView {
  id: string;
  job_id: string;
  state: string;
  stage: string;
  error_code: string | null;
  created_at: string;
  input: TaskInput;
  draft: AgentOutput | null;
}
export interface VersionView {
  id: string;
  job_id: string;
  task_id: string | null;
  parent_id: string | null;
  output: VersionOutput;
  profile: Profile;
  render: RenderStatus;
  created_at: string;
  label: string;
}
export interface ApplicationView {
  id: string;
  job_id: string;
  stage: (typeof stages)[number];
  notes: string;
  applied_at: string | null;
  resume_version_id: string | null;
}
export interface ArtifactView {
  id: string;
  version_id: string;
  kind: 'pdf' | 'tex' | 'json';
  filename: string;
}
export interface WorkspaceData {
  profile: Profile;
  jobs: JobView[];
  tasks: TaskView[];
  versions: VersionView[];
  applications: ApplicationView[];
  devices: DeviceView[];
  artifacts: ArtifactView[];
}
