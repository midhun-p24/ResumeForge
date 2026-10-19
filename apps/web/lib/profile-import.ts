import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  importTaskSchema,
  importOutputSchema,
  proposedRecordSchema,
  profileSchema,
  validateImport,
  idSchema,
} from '@resumeforge/contracts';
import { ApiError, body, checked, db, owned, rate } from './server';

const fields = 'id,state,stage,error_code,created_at,import_applied_at';
const ok = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export async function profileImportRoute(
  request: Request,
  path: string[],
  userId: string,
): Promise<Response | null> {
  if (path[0] !== 'profile' || path[1] !== 'imports') return null;
  if (path.length === 2 && request.method === 'GET')
    return ok(
      checked(
        await db()
          .from('tasks')
          .select(fields)
          .eq('user_id', userId)
          .eq('input->>operation', 'import_profile')
          .order('created_at', { ascending: false })
          .limit(10),
      ),
    );
  if (path.length === 2 && request.method === 'POST') {
    await rate(`import:${userId}`, 3, 3600);
    const b = z
      .object({ rawText: importTaskSchema.shape.rawText })
      .parse(await body(request, 250000));
    const input = importTaskSchema.parse({
      schemaVersion: 1,
      taskId: randomUUID(),
      operation: 'import_profile',
      rawText: b.rawText,
    });
    checked(await db().rpc('rf_enqueue_import', { p_user: userId, p_input: input }));
    return ok({ id: input.taskId }, 201);
  }
  if (!path[2]) return null;
  const task = await owned('tasks', idSchema.parse(path[2]), userId);
  if (task.input?.operation !== 'import_profile')
    throw new ApiError(404, 'NOT_FOUND', 'Import not found.');
  if (path.length === 3 && request.method === 'GET')
    return ok({
      ...Object.fromEntries(fields.split(',').map((key) => [key, task[key]])),
      draft: task.draft,
    });
  if (path[3] === 'apply' && request.method === 'POST') {
    await rate(`import-apply:${userId}`, 10, 60);
    if (task.state !== 'completed')
      throw new ApiError(409, 'IMPORT_NOT_READY', 'Wait for extraction to finish.');
    const b = z
      .object({
        records: z
          .array(
            z.object({
              index: z.number().int().min(0).max(99),
              record: proposedRecordSchema.shape.record,
            }),
          )
          .max(100),
        includeContact: z.boolean(),
      })
      .parse(await body(request, 1000000));
    if (new Set(b.records.map((r) => r.index)).size !== b.records.length)
      throw new ApiError(400, 'IMPORT_INVALID', 'Select each proposal only once.');
    const output = importOutputSchema.parse(task.draft);
    const reviewed = {
      ...output,
      records: b.records.map((edit) => {
        const original = output.records[edit.index];
        if (!original) throw new ApiError(400, 'IMPORT_INVALID', 'Unknown proposed record.');
        return { ...original, record: edit.record };
      }),
    };
    const errors = validateImport(importTaskSchema.parse(task.input), reviewed);
    if (errors.length) throw new ApiError(422, 'IMPORT_EVIDENCE', errors.join('; '));
    const records = reviewed.records.map(({ record, sourceQuote, warnings }) => ({
      ...record,
      id: randomUUID(),
      verification: 'draft',
      metrics: record.metrics.map(({ value, context }) => ({ id: randomUUID(), value, context })),
      sourceNotes: [
        `ResumeForge import ${task.id}. Candidate facts; not independently verified.`,
        record.sourceNotes,
        ...warnings,
        `Source excerpt:\n${sourceQuote}`,
        ...record.metrics.map((metric) => `Metric excerpt:\n${metric.sourceQuote}`),
      ]
        .filter(Boolean)
        .join('\n\n')
        .slice(0, 8000),
    }));
    const contact = b.includeContact
      ? Object.fromEntries(
          Object.entries(output.contact).filter(([, value]) =>
            Array.isArray(value) ? value.length : !!value,
          ),
        )
      : null;
    if (!records.length && (!contact || !Object.keys(contact).length))
      throw new ApiError(400, 'IMPORT_EMPTY', 'Select records or nonempty contact information.');
    // Validate individual records before the transaction; it merges with the latest saved profile.
    records.forEach((record) => profileSchema.shape.records.element.parse(record));
    return ok(
      checked(
        await db().rpc('rf_apply_import', {
          p_user: userId,
          p_task: task.id,
          p_records: records,
          p_contact: contact,
        }),
      ),
    );
  }
  return null;
}
