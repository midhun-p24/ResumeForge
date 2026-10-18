'use client';

import { useState } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleHelp,
  Code2,
  FileCheck2,
  FileText,
  Fingerprint,
  Layers3,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Plus,
  Settings2,
  ShieldCheck,
  Terminal,
  UserRound,
  Zap,
} from 'lucide-react';
import './preview.css';

const jobs = [
  {
    company: 'Example Systems',
    initials: 'ES',
    role: 'Software Engineer',
    status: 'Ready to apply',
    detail: 'Resume v3 · 1 page',
    time: 'Today',
    className: 'cyan',
  },
  {
    company: 'Sample Research',
    initials: 'SR',
    role: 'Research Engineer',
    status: 'Applied',
    detail: 'Resume v2 · 1 page',
    time: 'Yesterday',
    className: 'violet',
  },
  {
    company: 'Demo Infrastructure',
    initials: 'DI',
    role: 'Systems Engineer',
    status: 'Saved',
    detail: 'Awaiting tailoring',
    time: 'Oct 16',
    className: 'neutral',
  },
];

export default function DesignPreview() {
  const [screen, setScreen] = useState<'dashboard' | 'sign-in'>('dashboard');
  const [notice, setNotice] = useState('');
  return (
    <div className="forge-preview">
      <div className="fp-review">
        <span>
          <span className="fp-review-dot" /> DESIGN REVIEW{' '}
          <span className="fp-review-detail">/ synthetic example data</span>
        </span>
        <div role="tablist" aria-label="Design preview screens">
          <button
            role="tab"
            aria-selected={screen === 'dashboard'}
            onClick={() => {
              setScreen('dashboard');
              setNotice('');
            }}
          >
            Dashboard
          </button>
          <button
            role="tab"
            aria-selected={screen === 'sign-in'}
            onClick={() => {
              setScreen('sign-in');
              setNotice('');
            }}
          >
            Sign in
          </button>
        </div>
      </div>
      {screen === 'dashboard' ? (
        <div className="fp-shell">
          <aside className="fp-sidebar">
            <div className="fp-brand">
              <span className="fp-brand-icon">
                <Layers3 size={23} />
              </span>
              ResumeForge
              <span className="fp-brand-square" />
            </div>
            <div className="fp-nav-label">WORKSPACE</div>
            <nav aria-label="Preview navigation">
              {[
                [LayoutDashboard, 'Overview'],
                [UserRound, 'Master profile'],
                [Plus, 'New job'],
                [FileText, 'Resume workspace'],
                [BriefcaseBusiness, 'Applications'],
              ].map(([Icon, label], index) => {
                const Component = Icon as typeof LayoutDashboard;
                return (
                  <button
                    key={String(label)}
                    className={index === 0 ? 'active' : ''}
                    aria-disabled={index !== 0}
                    onClick={() =>
                      setNotice(
                        'This is a design preview. Workspace navigation will use your real account after launch.',
                      )
                    }
                  >
                    <Component size={18} />
                    {String(label)}
                    {label === 'Applications' && <span className="fp-nav-count">3</span>}
                  </button>
                );
              })}
            </nav>
            <div className="fp-side-bottom">
              <div className="fp-local-card">
                <div>
                  <span className="fp-dot" />
                  <strong>YOUR LOCAL AGENT</strong>
                </div>
                <p>Codex connected</p>
                <small>On your computer · last seen just now</small>
                <button
                  onClick={() =>
                    setNotice(
                      'Each user pairs their own local companion. No shared owner account processes tasks.',
                    )
                  }
                >
                  Manage connection <ArrowRight size={14} />
                </button>
              </div>
              <button
                className="fp-settings"
                onClick={() =>
                  setNotice(
                    'Settings include pairing, device revocation, data export, and account deletion.',
                  )
                }
              >
                <Settings2 size={18} /> Agent & settings
              </button>
              <div className="fp-user">
                <span>AE</span>
                <div>
                  <strong>Alex Example</strong>
                  <small>Private workspace</small>
                </div>
                <button aria-label="Preview signed-out screen" onClick={() => setScreen('sign-in')}>
                  <LogOut size={17} />
                </button>
              </div>
            </div>
          </aside>
          <div className="fp-main">
            <header className="fp-topbar">
              <span>
                Workspace <ChevronRight size={14} />
                <strong>Overview</strong>
              </span>
              <span>
                <ShieldCheck size={14} /> Private account
              </span>
            </header>
            <main className="fp-content">
              <div className="fp-page-heading">
                <div>
                  <div className="fp-eyebrow">YOUR NEXT MOVE</div>
                  <h1>Your workspace.</h1>
                  <p>Keep your evidence ready. Shape the next application.</p>
                </div>
                <button
                  className="fp-button"
                  onClick={() =>
                    setNotice(
                      'Start tailoring opens a new job and uses your approved profile and your own connected agent.',
                    )
                  }
                >
                  <Plus size={17} /> Start tailoring
                </button>
              </div>
              {notice && (
                <div className="fp-notice" role="status">
                  <CircleHelp size={17} />
                  {notice}
                  <button aria-label="Dismiss preview notice" onClick={() => setNotice('')}>
                    ×
                  </button>
                </div>
              )}
              <div className="fp-readiness">
                <section className="fp-card fp-profile">
                  <div className="fp-card-label">
                    <UserRound size={17} />
                    PROFILE READINESS <span className="fp-tag cyan">Ready to tailor</span>
                  </div>
                  <div className="fp-profile-number">
                    17 <span>/ 22 records approved</span>
                  </div>
                  <div className="fp-progress" aria-label="17 of 22 example records approved">
                    <span />
                  </div>
                  <div className="fp-card-footer">
                    <span>5 records need your review</span>
                    <button
                      onClick={() =>
                        setNotice('Profile review keeps unapproved facts out of generation.')
                      }
                    >
                      Review profile <ArrowRight size={15} />
                    </button>
                  </div>
                </section>
                <section className="fp-card fp-agent">
                  <div className="fp-card-label">
                    <Terminal size={17} />
                    AGENT CONNECTION{' '}
                    <span className="fp-tag cyan">
                      <span className="fp-dot" /> Online
                    </span>
                  </div>
                  <div className="fp-agent-name">
                    <span className="fp-agent-icon">
                      <Code2 size={24} />
                    </span>
                    <div>
                      <h2>Codex</h2>
                      <p>Your computer. Your agent access.</p>
                    </div>
                  </div>
                  <div className="fp-card-footer">
                    <span className="fp-mono">0 active tasks</span>
                    <button
                      onClick={() =>
                        setNotice(
                          'Codex requires the ResumeForge companion running locally. Closing it pauses new work.',
                        )
                      }
                    >
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
                  <button
                    className="fp-link"
                    onClick={() =>
                      setNotice(
                        'Applications supports search, stage filters, notes, and the exact resume version used.',
                      )
                    }
                  >
                    All applications <ArrowRight size={15} />
                  </button>
                </div>
                <div className="fp-job-labels">
                  <span>ROLE / COMPANY</span>
                  <span>PROGRESS</span>
                  <span>LAST UPDATED</span>
                  <span />
                </div>
                {jobs.map((job) => (
                  <div className="fp-job" key={job.company}>
                    <div className="fp-job-title">
                      <span className={`fp-company ${job.className}`}>{job.initials}</span>
                      <div>
                        <strong>{job.role}</strong>
                        <p>
                          {job.company} <span>· Remote</span>
                        </p>
                      </div>
                    </div>
                    <div>
                      <span className={`fp-tag ${job.className}`}>
                        {job.status === 'Ready to apply' && <Check size={12} />}
                        {job.status}
                      </span>
                      <small>{job.detail}</small>
                    </div>
                    <span className="fp-job-time fp-mono">{job.time}</span>
                    <button
                      aria-label={`Open ${job.company} example`}
                      onClick={() =>
                        setNotice(
                          'The resume workspace contains evidence, editable bullets, PDF preview, revisions, and version history.',
                        )
                      }
                    >
                      <ArrowRight size={18} />
                    </button>
                  </div>
                ))}
              </section>
              <div className="fp-lower-grid">
                <section className="fp-card">
                  <div className="fp-section-heading">
                    <h2>Application progress</h2>
                    <BriefcaseBusiness size={18} />
                  </div>
                  <div className="fp-stage-counts">
                    <div>
                      <strong>1</strong>
                      <span>Saved</span>
                    </div>
                    <div>
                      <strong className="fp-cyan-text">1</strong>
                      <span>Ready</span>
                    </div>
                    <div>
                      <strong className="fp-violet-text">1</strong>
                      <span>Applied</span>
                    </div>
                    <div>
                      <strong>0</strong>
                      <span>Interviewing</span>
                    </div>
                  </div>
                  <p className="fp-small-note">You submit applications. ResumeForge keeps track.</p>
                </section>
                <section className="fp-card">
                  <div className="fp-section-heading">
                    <h2>Latest resume</h2>
                    <FileCheck2 size={18} />
                  </div>
                  <div className="fp-latest">
                    <span className="fp-document">
                      <FileText size={25} />
                    </span>
                    <div>
                      <strong>Software Engineer</strong>
                      <p>Example Systems · Version 3</p>
                      <span className="fp-mono">1 PAGE · PDF CHECKED</span>
                    </div>
                    <button
                      aria-label="Preview download explanation"
                      onClick={() =>
                        setNotice(
                          'Private PDF, LaTeX, and JSON downloads are available in each resume workspace.',
                        )
                      }
                    >
                      <ArrowDownToLine size={18} />
                    </button>
                  </div>
                  <p className="fp-small-note">
                    Based on approved evidence. Review before applying.
                  </p>
                </section>
              </div>
              <footer className="fp-footer">
                <span>
                  <LockKeyhole size={13} /> Your profile and files belong to your account.
                </span>
                <span className="fp-mono">ResumeForge / Design preview</span>
              </footer>
            </main>
          </div>
        </div>
      ) : (
        <div className="fp-signin">
          <header>
            <div className="fp-brand">
              <span className="fp-brand-icon">
                <Layers3 size={23} />
              </span>
              ResumeForge
              <span className="fp-brand-square" />
            </div>
            <span className="fp-mono">
              <LockKeyhole size={14} /> PRIVATE BY ACCOUNT
            </span>
          </header>
          <main className="fp-signin-grid">
            <section className="fp-intro">
              <div className="fp-eyebrow">
                <Zap size={15} /> BUILT ON YOUR EXPERIENCE
              </div>
              <h1>
                A focused resume.
                <br />
                <span>For your next move.</span>
              </h1>
              <p>
                Turn your verified background into a tailored, one-page resume. Review the evidence,
                refine the wording, and keep every version organized.
              </p>
              <div className="fp-intro-features">
                <div>
                  <ShieldCheck size={19} />
                  <div>
                    <strong>Your own private workspace</strong>
                    <p>Your profile, jobs, files, and devices stay in your account.</p>
                  </div>
                </div>
                <div>
                  <Fingerprint size={19} />
                  <div>
                    <strong>Your agent. Your access.</strong>
                    <p>
                      Each person connects their own Codex sign-in. Your tasks never run through
                      another user’s account.
                    </p>
                  </div>
                </div>
                <div>
                  <FileCheck2 size={19} />
                  <div>
                    <strong>Evidence you can review</strong>
                    <p>Source-linked bullets, explained gaps, and editable versions.</p>
                  </div>
                </div>
              </div>
              <div className="fp-local-requirement">
                <Terminal size={21} />
                <div>
                  <strong>Codex runs through a local companion.</strong>
                  <p>
                    Install ResumeForge’s companion on your computer, sign in to Codex, and pair it
                    with your account. Keep it running while tailoring.
                  </p>
                  <button
                    onClick={() =>
                      setNotice(
                        'The production guide will include a downloadable companion, installation, Codex authentication, pairing, troubleshooting, and disconnect steps.',
                      )
                    }
                  >
                    How connection works <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            </section>
            <section className="fp-signin-card fp-card">
              <span className="fp-form-symbol">
                <UserRound size={24} />
              </span>
              <div className="fp-eyebrow">YOUR WORKSPACE STARTS HERE</div>
              <h2>Sign in or create an account.</h2>
              <p>We’ll email you a secure link. No password to remember.</p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  setNotice('Design preview only. No email was sent and no account was created.');
                }}
              >
                <label htmlFor="fp-email">
                  Email address
                  <input
                    id="fp-email"
                    type="email"
                    required
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </label>
                <button className="fp-button" type="submit">
                  Continue with email <ArrowRight size={17} />
                </button>
              </form>
              <p className="fp-signin-note">
                <LockKeyhole size={14} /> Each account has its own private profile and files.
              </p>
              <div className="fp-availability">
                <span className="fp-dot" />
                <strong>Codex</strong>
                <span>Supported · local companion required</span>
              </div>
              <p className="fp-small-note">Other agents are currently unavailable.</p>
              {notice && (
                <div className="fp-notice" role="status">
                  {notice}
                </div>
              )}
              <div className="fp-preview-disclaimer">DESIGN PREVIEW · FORM DOES NOT SEND EMAIL</div>
            </section>
          </main>
          <footer className="fp-signin-footer">
            <span>ResumeForge</span>
            <span>You find the opportunity. You review and apply.</span>
          </footer>
        </div>
      )}
    </div>
  );
}
