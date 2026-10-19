'use client';
import {
  ArrowRight,
  BriefcaseBusiness,
  FileCheck2,
  FileText,
  Plus,
  Terminal,
  UserRound,
} from 'lucide-react';
import type { WorkspaceData } from '@resumeforge/contracts';
import '../app/design-preview/preview.css';

export function Dashboard({
  data,
  approved,
  connected,
  go,
  openJob,
}: {
  data: WorkspaceData;
  approved: number;
  connected: boolean;
  go: (area: 'New Job' | 'Master Profile' | 'Agent & Settings' | 'Applications') => void;
  openJob: (id: string) => void;
}) {
  const latest = data.versions[0];
  const latestJob = latest && data.jobs.find((job) => job.id === latest.job_id);
  const ready = !!data.profile.contact.name && approved > 0;
  const active = data.tasks.filter((task) => ['queued', 'running'].includes(task.state)).length;
  return (
    <section className="forge-preview live-overview">
      <div className="fp-page-heading">
        <div>
          <div className="fp-eyebrow">YOUR NEXT MOVE</div>
          <h1>Your workspace.</h1>
          <p>Keep your evidence ready. Shape the next application.</p>
        </div>
        <button className="fp-button" onClick={() => go('New Job')}>
          <Plus size={17} />
          Start tailoring
        </button>
      </div>
      <div className="fp-readiness">
        <section className="fp-card">
          <div className="fp-card-label">
            <UserRound size={17} />
            PROFILE READINESS
            <span className={`fp-tag ${ready ? 'cyan' : 'neutral'}`}>
              {ready ? 'Ready to tailor' : 'Needs attention'}
            </span>
          </div>
          <div className="fp-profile-number">
            {approved} <span>/ {data.profile.records.length} records approved</span>
          </div>
          <progress
            className="live-readiness"
            aria-label="Approved profile records"
            value={approved}
            max={data.profile.records.length || 1}
          />
          <div className="fp-card-footer">
            <span>{data.profile.records.length - approved} records need your review</span>
            <button onClick={() => go('Master Profile')}>
              Review profile <ArrowRight size={15} />
            </button>
          </div>
        </section>
        <section className="fp-card">
          <div className="fp-card-label">
            <Terminal size={17} />
            AGENT CONNECTION
            <span className={`fp-tag ${connected ? 'cyan' : 'neutral'}`}>
              {connected ? 'Online' : 'Not ready'}
            </span>
          </div>
          <div className="fp-agent-name">
            <span className="fp-agent-icon">
              <Terminal size={23} />
            </span>
            <div>
              <h2>Codex</h2>
              <p>
                {connected
                  ? 'Your computer. Your agent access.'
                  : 'Start your local companion and sign in to Codex.'}
              </p>
            </div>
          </div>
          <div className="fp-card-footer">
            <span className="fp-mono">{active} active tasks</span>
            <button onClick={() => go('Agent & Settings')}>
              Connection details <ArrowRight size={15} />
            </button>
          </div>
        </section>
      </div>
      <section className="fp-card fp-jobs">
        <div className="fp-section-heading">
          <div>
            <h2>Recent opportunities</h2>
            <p>Pick up where you left off.</p>
          </div>
          <button className="fp-link" onClick={() => go('Applications')}>
            All applications <ArrowRight size={15} />
          </button>
        </div>
        {data.jobs.length ? (
          <>
            <div className="fp-job-labels">
              <span>ROLE / COMPANY</span>
              <span>PROGRESS</span>
              <span>SAVED</span>
              <span />
            </div>
            {data.jobs.slice(0, 5).map((job) => {
              const application = data.applications.find((a) => a.job_id === job.id);
              const version = data.versions.find((v) => v.job_id === job.id);
              return (
                <div className="fp-job" key={job.id}>
                  <div className="fp-job-title">
                    <span className="fp-company cyan">
                      {job.data.company.slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <strong>{job.data.title}</strong>
                      <p>
                        {job.data.company}
                        <span> · {job.data.location || 'Location unspecified'}</span>
                      </p>
                    </div>
                  </div>
                  <div>
                    <span
                      className={`fp-tag ${application?.stage === 'Ready to apply' ? 'cyan' : application?.stage === 'Applied' ? 'violet' : 'neutral'}`}
                    >
                      {application?.stage || 'Saved'}
                    </span>
                    <small>
                      {version
                        ? `${version.render.pageCount || '—'} page · ${version.label}`
                        : 'Awaiting tailoring'}
                    </small>
                  </div>
                  <span className="fp-job-time fp-mono">
                    {new Date(job.created_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                  <button
                    aria-label={`Open ${job.data.company} workspace`}
                    onClick={() => openJob(job.id)}
                  >
                    <ArrowRight size={18} />
                  </button>
                </div>
              );
            })}
          </>
        ) : (
          <div className="empty-state">
            <BriefcaseBusiness size={28} />
            <h3>Start with a job posting</h3>
            <p>Paste the full description to create your first opportunity.</p>
            <button className="fp-link" onClick={() => go('New Job')}>
              Add your first opportunity <Plus size={15} />
            </button>
          </div>
        )}
      </section>
      <div className="fp-lower-grid">
        <section className="fp-card">
          <div className="fp-section-heading">
            <h2>Application progress</h2>
            <BriefcaseBusiness size={18} />
          </div>
          <div className="fp-stage-counts">
            {[
              ['Saved', 'Saved'],
              ['Ready to apply', 'Ready'],
              ['Applied', 'Applied'],
              ['Interviewing', 'Interviewing'],
            ].map(([stage, label]) => (
              <div key={stage}>
                <strong>{data.applications.filter((a) => a.stage === stage).length}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <p className="fp-small-note">You submit applications. ResumeForge keeps track.</p>
        </section>
        <section className="fp-card">
          <div className="fp-section-heading">
            <h2>Latest resume</h2>
            <FileCheck2 size={18} />
          </div>
          {latest && latestJob ? (
            <div className="fp-latest">
              <span className="fp-document">
                <FileText size={25} />
              </span>
              <div>
                <strong>{latestJob.data.title}</strong>
                <p>
                  {latestJob.data.company} · {latest.label}
                </p>
                <span className="fp-mono">
                  {latest.render.status === 'ready'
                    ? `${latest.render.pageCount} PAGE · PDF CHECKED`
                    : 'RENDER NEEDED'}
                </span>
              </div>
              <button aria-label="Open latest resume" onClick={() => openJob(latest.job_id)}>
                <ArrowRight size={18} />
              </button>
            </div>
          ) : (
            <div className="live-no-resume">
              <p>No resume versions yet.</p>
              <button className="fp-link" onClick={() => go(ready ? 'New Job' : 'Master Profile')}>
                {ready ? 'Start tailoring' : 'Build your approved profile'} <ArrowRight size={15} />
              </button>
            </div>
          )}
          <p className="fp-small-note">Based on approved evidence. Review before applying.</p>
        </section>
      </div>
    </section>
  );
}
