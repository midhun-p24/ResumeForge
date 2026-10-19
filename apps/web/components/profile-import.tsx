'use client';
import { useEffect, useRef, useState } from 'react';
import { COMPANION_VERSION, recordIdentity } from '@resumeforge/contracts';
import type { ImportOutput, Profile, ProfileImportView } from '@resumeforge/contracts';
import { api } from '../lib/client';

type Proposal = ImportOutput['records'][number]['record'];
const matchWithoutDates = (record: Proposal | Profile['records'][number]) =>
  recordIdentity({ ...record, startDate: '', endDate: '' });
export function ProfileImporter({
  rawText,
  records,
  canSave,
  dirty,
  connected,
  busy,
  run,
  onApplied,
}: {
  rawText: string;
  records: Profile['records'];
  canSave: boolean;
  dirty: boolean;
  connected: boolean;
  busy: boolean;
  run: (action: () => Promise<void>, success?: string) => Promise<void>;
  onApplied: (profile: Profile) => void;
}) {
  const [imports, setImports] = useState<ProfileImportView[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<ProfileImportView | null>(null);
  const [edits, setEdits] = useState<Proposal[]>([]);
  const [selected, setSelected] = useState<boolean[]>([]);
  const [includeContact, setIncludeContact] = useState(false);
  const [loadError, setLoadError] = useState('');
  const recordsRef = useRef(records);
  useEffect(() => {
    recordsRef.current = records;
  }, [records]);
  useEffect(() => {
    if (!canSave) return;
    let active = true;
    const load = async () => {
      try {
        const rows = await api<ProfileImportView[]>('profile/imports');
        if (active) {
          setImports(rows);
          setSelectedId((id) => id || rows[0]?.id || '');
          setLoadError('');
        }
      } catch (error) {
        if (active)
          setLoadError(error instanceof Error ? error.message : 'Could not load imports.');
      }
    };
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [canSave]);
  const item = imports.find((entry) => entry.id === selectedId);
  useEffect(() => {
    if (!selectedId || !canSave) return;
    let active = true;
    setDetail(null);
    setEdits([]);
    setSelected([]);
    setIncludeContact(false);
    void api<ProfileImportView>(`profile/imports/${selectedId}`)
      .then((next) => {
        if (!active) return;
        setDetail(next);
        const proposals = next.draft?.records ?? [];
        const seen = new Set(recordsRef.current.map(matchWithoutDates));
        setEdits(proposals.map((proposal) => proposal.record));
        setSelected(
          proposals.map(({ record }) => {
            const key = matchWithoutDates(record);
            const exists = seen.has(key);
            seen.add(key);
            return !exists;
          }),
        );
      })
      .catch((error) => {
        if (active) setLoadError(error instanceof Error ? error.message : 'Could not load import.');
      });
    return () => {
      active = false;
    };
  }, [selectedId, item?.state, item?.import_applied_at, canSave]);
  const update = (index: number, change: Partial<Proposal>) =>
    setEdits((current) =>
      current.map((record, i) => (i === index ? { ...record, ...change } : record)),
    );
  const output = detail?.draft;
  const applied = !!(detail?.import_applied_at || item?.import_applied_at);
  const duplicates = new Set(records.map(recordIdentity));
  const possibleDuplicates = new Set(records.map(matchWithoutDates));
  const count = edits.filter(
    (record, index) => selected[index] && !duplicates.has(recordIdentity(record)),
  ).length;
  const active = imports.some((entry) => ['queued', 'running'].includes(entry.state));
  return (
    <div className="resume-import">
      <p className="muted">
        Your own Codex companion extracts proposed records. Nothing is approved automatically.
        Review source excerpts and edit proposals before adding drafts.
      </p>
      {!connected && (
        <p className="notice subtle">
          Start your local companion {COMPANION_VERSION} or newer to process imports. An older
          companion can still tailor resumes. Update with the instructions in{' '}
          <a href="/companion">the companion guide</a>.
        </p>
      )}
      <button
        className="button secondary"
        disabled={
          !canSave || busy || active || rawText.trim().length < 40 || rawText.length > 60000
        }
        onClick={() =>
          void run(async () => {
            const result = await api<{ id: string }>('profile/imports', 'POST', { rawText });
            setSelectedId(result.id);
            setImports(await api<ProfileImportView[]>('profile/imports'));
          }, 'Import queued. Keep your own companion running.')
        }
      >
        Parse master resume into records
      </button>
      <small className="muted">
        40–60,000 characters · Up to 100 proposals · 3 imports/hour, 10/day
      </small>
      {loadError && (
        <p role="alert" className="notice">
          {loadError}
        </p>
      )}
      {!!imports.length && (
        <label className="field">
          <span>Resume import</span>
          <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
            {imports.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {new Date(entry.created_at).toLocaleString()} · {entry.stage}
                {entry.import_applied_at ? ' · Drafts added' : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      {item && (
        <div className="section-heading">
          <p role="status">
            {item.stage}
            {item.error_code ? ` · ${item.error_code}` : ''}
          </p>
          {['queued', 'running'].includes(item.state) && (
            <button
              className="button ghost small"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api(`tasks/${item.id}`, 'DELETE');
                  setImports(await api<ProfileImportView[]>('profile/imports'));
                }, 'Import cancelled.')
              }
            >
              Cancel import
            </button>
          )}
        </div>
      )}
      {item?.state === 'failed' && (
        <p className="muted">
          Check your companion diagnostics and Codex access, then start a new import. Invalid
          extraction gets one repair attempt; it is never silently accepted.
        </p>
      )}
      {!!detail?.diagnostics?.length && (
        <ul className="import-warnings" aria-label="Import validation details">
          {detail.diagnostics.map((diagnostic, index) => (
            <li key={index}>{diagnostic}</li>
          ))}
        </ul>
      )}
      {output && (
        <>
          <h3>Review proposed records ({output.records.length})</h3>
          <p className="muted">
            These are AI-extracted candidates. Check dates, team credit, publication status, and
            every metric. Existing records are retained. Duplicate identities are skipped.
          </p>
          {!!output.warnings.length && (
            <ul className="import-warnings">
              {output.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          )}
          <details>
            <summary>Proposed contact information</summary>
            <dl>
              {Object.entries(output.contact).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{Array.isArray(value) ? value.join(', ') : value || 'Not supplied'}</dd>
                </div>
              ))}
            </dl>
            <blockquote className="import-excerpt">{output.contactSourceQuote}</blockquote>
          </details>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={includeContact}
              disabled={
                applied ||
                !Object.values(output.contact).some((value) =>
                  Array.isArray(value) ? value.length : !!value,
                )
              }
              onChange={(event) => setIncludeContact(event.target.checked)}
            />
            Use proposed nonempty contact fields, replacing matching saved fields
          </label>
          {edits.map((record, index) => {
            const duplicate = duplicates.has(recordIdentity(record));
            const possibleDuplicate =
              !duplicate && possibleDuplicates.has(matchWithoutDates(record));
            return (
              <div key={index} className="import-proposal">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={!!selected[index] && !duplicate}
                    disabled={applied || duplicate}
                    onChange={(event) =>
                      setSelected((current) =>
                        current.map((value, i) => (i === index ? event.target.checked : value)),
                      )
                    }
                  />
                  <span>
                    {record.title} <span className="badge">{record.kind}</span>
                    {duplicate
                      ? ' · Already in your profile'
                      : possibleDuplicate
                        ? ' · Possible duplicate: compare dates before selecting'
                        : ''}
                  </span>
                </label>
                <details>
                  <summary>Edit proposal {index + 1} and inspect evidence</summary>
                  <fieldset disabled={applied || busy}>
                    <div className="form-grid">
                      <label className="field">
                        <span>Record type</span>
                        <select
                          value={record.kind}
                          onChange={(event) =>
                            update(index, { kind: event.target.value as Proposal['kind'] })
                          }
                        >
                          {[
                            'education',
                            'experience',
                            'research',
                            'project',
                            'publication',
                            'presentation',
                            'award',
                            'skill',
                            'coursework',
                          ].map((kind) => (
                            <option key={kind}>{kind}</option>
                          ))}
                        </select>
                      </label>
                      {(
                        [
                          ['title', 'Title / degree / skill'],
                          ['organization', 'Organization'],
                          ['startDate', 'Start date'],
                          ['endDate', 'End / graduation date'],
                          ['url', 'Source URL'],
                          ['gpa', 'GPA'],
                        ] as const
                      ).map(([key, label]) => (
                        <label className="field" key={key}>
                          <span>{label}</span>
                          <input
                            value={record[key]}
                            maxLength={key === 'url' ? 1500 : 300}
                            onChange={(event) => update(index, { [key]: event.target.value })}
                          />
                        </label>
                      ))}
                      <label className="field">
                        <span>Publication status</span>
                        <select
                          value={record.publicationStatus}
                          onChange={(event) =>
                            update(index, {
                              publicationStatus: event.target
                                .value as Proposal['publicationStatus'],
                            })
                          }
                        >
                          {[
                            'not_applicable',
                            'published',
                            'accepted',
                            'submitted',
                            'in_progress',
                          ].map((status) => (
                            <option key={status}>{status}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {(
                      [
                        ['contributions', 'Personal contributions'],
                        ['accomplishments', 'Accomplishments'],
                        ['sourceNotes', 'Source notes'],
                      ] as const
                    ).map(([key, label]) => (
                      <label className="field" key={key}>
                        <span>{label}</span>
                        <textarea
                          rows={3}
                          maxLength={8000}
                          value={record[key]}
                          onChange={(event) => update(index, { [key]: event.target.value })}
                        />
                      </label>
                    ))}
                    <label className="field">
                      <span>Technologies actually used (comma-separated)</span>
                      <input
                        value={record.technologies.join(', ')}
                        onChange={(event) =>
                          update(index, {
                            technologies: event.target.value
                              ? event.target.value.split(',').map((text) => text.trim())
                              : [],
                          })
                        }
                      />
                    </label>
                    {!!record.metrics.length && (
                      <p>Candidate metrics — review evidence; remove unsupported claims.</p>
                    )}
                    {record.metrics.map((metric, metricIndex) => (
                      <div className="import-metric" key={metricIndex}>
                        <label className="field">
                          <span>Metric value</span>
                          <input
                            maxLength={300}
                            value={metric.value}
                            onChange={(event) =>
                              update(index, {
                                metrics: record.metrics.map((value, i) =>
                                  i === metricIndex
                                    ? { ...value, value: event.target.value }
                                    : value,
                                ),
                              })
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Measurement context</span>
                          <textarea
                            rows={2}
                            maxLength={300}
                            value={metric.context}
                            onChange={(event) =>
                              update(index, {
                                metrics: record.metrics.map((value, i) =>
                                  i === metricIndex
                                    ? { ...value, context: event.target.value }
                                    : value,
                                ),
                              })
                            }
                          />
                        </label>
                        <blockquote className="import-excerpt">{metric.sourceQuote}</blockquote>
                        <button
                          className="button ghost small"
                          onClick={() =>
                            update(index, {
                              metrics: record.metrics.filter((_, i) => i !== metricIndex),
                            })
                          }
                        >
                          Remove candidate metric
                        </button>
                      </div>
                    ))}
                  </fieldset>
                  {!!output.records[index].warnings.length && (
                    <ul className="import-warnings">
                      {output.records[index].warnings.map((warning, i) => (
                        <li key={i}>{warning}</li>
                      ))}
                    </ul>
                  )}
                  <strong>Original source excerpt</strong>
                  <blockquote className="import-excerpt">
                    {output.records[index].sourceQuote}
                  </blockquote>
                </details>
              </div>
            );
          })}
          {dirty && (
            <p className="notice subtle">
              Save your current profile edits before adding imported drafts. This keeps your changes
              intact.
            </p>
          )}
          <button
            className="button"
            disabled={busy || dirty || applied || (!count && !includeContact)}
            onClick={() =>
              void run(async () => {
                const response = await api<{ profile: Profile; added: number }>(
                  `profile/imports/${selectedId}/apply`,
                  'POST',
                  {
                    records: edits.flatMap((record, index) =>
                      selected[index] && !duplicates.has(recordIdentity(record))
                        ? [{ index, record }]
                        : [],
                    ),
                    includeContact,
                  },
                );
                onApplied(response.profile);
                setDetail((current) =>
                  current ? { ...current, import_applied_at: new Date().toISOString() } : current,
                );
                setImports(await api<ProfileImportView[]>('profile/imports'));
              }, 'Imported as drafts. Review and approve each record below before tailoring.')
            }
          >
            {applied ? 'Drafts already added' : `Add ${count} records as drafts`}
          </button>
        </>
      )}
      <p className="notice subtle">
        All extracted metrics are unverified candidates. Blank fields mean the source did not supply
        a value; never fill them by guessing.
      </p>
    </div>
  );
}
