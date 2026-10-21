'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Session } from '@supabase/supabase-js';
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Flame,
  LayoutDashboard,
  Link2,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  Unplug,
  WifiOff,
  X,
} from 'lucide-react';
import {
  COMPANION_VERSION,
  emptyProfile,
  fitScore,
  stages,
  profileSchema,
} from '@resumeforge/contracts';
import type {
  AgentOutput,
  ApplicationView,
  Job,
  Profile,
  SourceRecord,
  VersionView,
  WorkspaceData,
} from '@resumeforge/contracts';
import { renderLatex, safeFilename } from '@resumeforge/resume';
import { api, download, supabase } from '../lib/client';
import { Dashboard } from './dashboard';
import { PublicHome } from './public-home';
import { ProfileImporter } from './profile-import';

type Area =
  | 'Dashboard'
  | 'Master Profile'
  | 'New Job'
  | 'Resume Workspace'
  | 'Applications'
  | 'Agent & Settings';
type Run = (action: () => Promise<void>, success?: string) => Promise<void>;
const navigation: { name: Area; icon: typeof FileText }[] = [
  { name: 'Dashboard', icon: LayoutDashboard },
  { name: 'Master Profile', icon: BookOpen },
  { name: 'New Job', icon: Plus },
  { name: 'Resume Workspace', icon: FileText },
  { name: 'Applications', icon: BriefcaseBusiness },
];
const emptyData: WorkspaceData = {
  profile: emptyProfile,
  jobs: [],
  tasks: [],
  versions: [],
  applications: [],
  devices: [],
  artifacts: [],
};
const online = (d: WorkspaceData['devices'][number]) =>
  !d.revoked_at && !!d.last_seen && Date.now() - Date.parse(d.last_seen) < 65000;
const date = (s: string) =>
  new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const failureHelp: Record<string, string> = {
  AUTH_REQUIRED: 'Run codex login on your computer, then retry.',
  USAGE_LIMIT: 'Codex usage is currently limited. Wait for access to reset, then retry.',
  MODEL_ACCESS: 'Your local Codex model is unavailable. Check your Codex configuration.',
  COMPILER_MISSING: 'Install Tectonic locally and run the companion doctor command.',
  COMPILE_FAILED: 'PDF compilation failed. Check Tectonic dependencies with the doctor command.',
  INVALID_OUTPUT: 'The result failed schema or evidence checks after one repair attempt.',
  LEASE_EXHAUSTED: 'The companion lost its lease three times. Reconnect and start a new task.',
  TIMEOUT: 'Task exceeded its time limit. Request a shorter revision.',
  AGENT_FAILED: 'Codex failed. Run the companion doctor command to check access.',
  SCHEMA_REJECTED: 'Codex rejected the companion output schema. Update your companion, then retry.',
};

export default function Workspace() {
  const account = useRef<string | null>(null);
  const [session, setSession] = useState<Session | null>(null),
    [authReady, setAuthReady] = useState(false),
    [area, setArea] = useState<Area>('Dashboard'),
    [data, setData] = useState<WorkspaceData>(emptyData),
    [selectedJob, setSelectedJob] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [menu, setMenu] = useState(false),
    [showLogin, setShowLogin] = useState(false);
  const refresh = useCallback(async () => {
    const expected = account.current;
    const next = await api<WorkspaceData>('workspace');
    // A late response from a signed-out/switched account must never reappear.
    if (expected && account.current === expected) setData(next);
  }, []);
  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }
    let events = 0,
      alive = true;
    const apply = (s: Session | null) => {
      const id = s?.user.id ?? null;
      if (account.current !== id) {
        setData(emptyData);
        setSelectedJob('');
        setError('');
        setMessage('');
      }
      account.current = id;
      setSession(s);
      setAuthReady(true);
    };
    void supabase.auth.getSession().then(({ data }) => {
      if (alive && events === 0) apply(data.session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => {
      events++;
      apply(s);
      if (s) setShowLogin(false);
      if (!s) setData(emptyData);
    });
    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!session) return;
    let active = true;
    const load = () =>
      refresh().catch((e) => {
        if (active) setError(e.message);
      });
    void load();
    const timer = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [session, refresh]);
  const run: Run = async (fn, success) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
      if (session) await refresh();
      if (success) setMessage(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operation failed');
    } finally {
      setBusy(false);
    }
  };
  const go = (a: Area) => {
    setArea(a);
    setMenu(false);
    setError('');
    setMessage('');
  };
  const openJob = (id: string) => {
    setSelectedJob(id);
    go('Resume Workspace');
  };
  const connected = data.devices.some((d) => online(d) && d.agent_status === 'authenticated');
  const approved = data.profile.records.filter((r) => r.verification === 'approved').length;
  if (authReady && supabase && !session)
    return (
      <PublicHome>
        <Login
          inline
          ready={authReady}
          close={() => setShowLogin(false)}
          onSuccess={() => setShowLogin(false)}
        />
      </PublicHome>
    );
  return (
    <div className="app-shell" data-ready={authReady} inert={!authReady}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className={`sidebar ${menu ? 'is-open' : ''}`}>
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Flame size={23} />
          </span>
          ResumeForge<span className="brand-dot">.</span>
        </Link>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navigation.map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={`nav-item ${area === name ? 'active' : ''}`}
              onClick={() => go(name)}
              aria-current={area === name ? 'page' : undefined}
            >
              <Icon size={19} />
              {name}
              {name === 'Applications' && data.applications.length > 0 && (
                <span className="nav-count">{data.applications.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="agent-card">
            <span className={`status-dot ${connected ? 'online' : ''}`} />
            <strong>{connected ? 'Companion connected' : 'Your agent, your computer'}</strong>
            <p>
              {connected
                ? 'Codex is ready for your next role.'
                : 'Connect local Codex to start tailoring.'}
            </p>
            <button onClick={() => go('Agent & Settings')}>
              {connected ? 'Manage connection' : 'Connect your agent'}
              <ArrowRight size={15} />
            </button>
          </div>
          <button
            className={`nav-item ${area === 'Agent & Settings' ? 'active' : ''}`}
            onClick={() => go('Agent & Settings')}
          >
            <Settings2 size={18} />
            Agent & Settings
          </button>
          <div className="account">
            <span className="avatar">{session?.user.email?.slice(0, 1).toUpperCase() ?? 'R'}</span>
            <div>
              <strong>{session?.user.email?.split('@')[0] ?? 'Personal workspace'}</strong>
              <small>{session ? 'Private account' : 'Not signed in'}</small>
            </div>
            {session && (
              <button
                className="icon-button"
                aria-label="Sign out"
                onClick={() =>
                  void run(async () => {
                    await supabase!.auth.signOut();
                    setData(emptyData);
                    setSession(null);
                  })
                }
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </aside>
      {menu && (
        <button
          className="mobile-shade"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMenu(!menu)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{area}</strong>
          </div>
          <div className="top-actions">
            <span className="private-pill">
              <ShieldCheck size={14} />
              Private by design
            </span>
            {session ? (
              <button
                className="icon-button"
                aria-label="Refresh workspace"
                onClick={() => void run(refresh)}
              >
                <RefreshCw size={17} />
              </button>
            ) : (
              <button className="button small" onClick={() => setShowLogin(true)}>
                Sign in <ArrowRight size={14} />
              </button>
            )}
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          {error && (
            <div className="notice error" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError('')}>
                <X size={16} />
              </button>
            </div>
          )}
          {message && (
            <div className="notice success" role="status">
              <CheckCircle2 size={17} />
              {message}
              <button aria-label="Dismiss notification" onClick={() => setMessage('')}>
                <X size={16} />
              </button>
            </div>
          )}
          {!session && (
            <div className="setup-banner">
              <LockKeyhole size={17} />
              <span>
                {supabase
                  ? 'Sign in to save your profile, jobs, and resumes to your private account.'
                  : 'Setup needed: connect Supabase to enable sign-in and private persistence.'}
              </span>
              <button onClick={() => setShowLogin(true)}>
                {supabase ? 'Sign in' : 'View setup'}
                <ArrowRight size={14} />
              </button>
            </div>
          )}
          {area === 'Dashboard' && (
            <Dashboard
              data={data}
              approved={approved}
              connected={connected}
              go={go}
              openJob={openJob}
            />
          )}
          {area === 'Master Profile' && (
            <ProfileEditor
              key={session?.user.id ?? 'guest'}
              saved={data.profile}
              canSave={!!session}
              run={run}
              busy={busy}
              importConnected={data.devices.some(
                (device) =>
                  online(device) &&
                  device.agent_status === 'authenticated' &&
                  device.capabilities?.includes('profile_import_v1') &&
                  device.companion_version !== '0.3.0',
              )}
            />
          )}
          {area === 'New Job' && (
            <JobEditor canSave={!!session} busy={busy} run={run} onSaved={openJob} />
          )}
          {area === 'Resume Workspace' && (
            <ResumeWorkspace
              data={data}
              selectedJob={selectedJob}
              setSelectedJob={setSelectedJob}
              run={run}
              busy={busy}
              connected={connected}
              onNew={() => go('New Job')}
            />
          )}
          {area === 'Applications' && <Applications data={data} run={run} openJob={openJob} />}
          {area === 'Agent & Settings' && (
            <Settings data={data} signedIn={!!session} run={run} busy={busy} />
          )}
          <footer>
            <span>ResumeForge</span>
            <span>Built on your experience. Powered by your agent.</span>
            <span>Private account · ResumeForge</span>
          </footer>
        </main>
      </div>
      {busy && (
        <div className="working-indicator" role="status">
          <LoaderCircle className="spin" size={16} />
          Saving changes…
        </div>
      )}
      {showLogin && (
        <Login
          ready={authReady}
          close={() => setShowLogin(false)}
          onSuccess={() => setShowLogin(false)}
        />
      )}
    </div>
  );
}

function Login({
  inline = false,
  close,
  onSuccess,
  ready,
}: {
  inline?: boolean;
  close: () => void;
  onSuccess: () => void;
  ready: boolean;
}) {
  const dialog = useRef<HTMLElement>(null);
  const [email, setEmail] = useState(''),
    [code, setCode] = useState(''),
    [sent, setSent] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [registration, setRegistration] = useState<boolean | null>(null);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    fetch('/api/public/config', { cache: 'no-store' })
      .then((r) => r.json())
      .then((config) => {
        if (active) setRegistration(config.registrationOpen === true);
      })
      .catch(() => {
        if (active) setRegistration(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (inline) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLElement>('button, input')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), a[href], [tabindex="0"]',
        ) ?? [],
      );
      const first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      previous?.focus();
    };
  }, [close, inline]);
  useEffect(() => {
    if (sent) dialog.current?.querySelector<HTMLElement>('input:not(:disabled)')?.focus();
  }, [sent]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (!sent) {
        await api('auth/email', 'POST', { email });
        setSent(true);
      } else {
        const { error } = await supabase!.auth.verifyOtp({ email, token: code, type: 'email' });
        if (error) throw error;
        onSuccess();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={inline ? 'auth-inline' : 'modal-backdrop'}>
      <section
        ref={dialog}
        className={inline ? 'public-auth' : 'modal'}
        role={inline ? undefined : 'dialog'}
        aria-modal={inline ? undefined : true}
        aria-labelledby="login-title"
      >
        {!inline && (
          <button className="modal-close icon-button" aria-label="Close sign in" onClick={close}>
            <X size={20} />
          </button>
        )}
        <span className="brand-mark">
          <Flame size={24} />
        </span>
        <h2 id="login-title">
          {inline ? 'Sign in or create an account.' : 'Your private ResumeForge'}
        </h2>
        {!supabase ? (
          <>
            <p>Configure Supabase before signing in.</p>
            <ol className="setup-list">
              <li>Check migration deployment in your existing Supabase GitHub integration.</li>
              <li>
                Copy <code>.env.example</code> to <code>apps/web/.env.local</code> and set your
                Supabase URL, publishable key, and server service key.
              </li>
              <li>
                Review email sign-in settings in <code>docs/deployment.md</code>, then restart.
              </li>
            </ol>
            <p className="muted">Personal data is saved only after authenticated setup.</p>
          </>
        ) : (
          <form onSubmit={submit}>
            {registration === false && (
              <p className="notice subtle" role="status">
                Public registration is being prepared. Email sign-in will open after release checks
                pass.
              </p>
            )}
            <p>
              {sent
                ? 'Check your email and follow the secure sign-in link. If your email includes a verification code, you can enter it below.'
                : 'Sign in or create an account with a secure link sent to your email.'}
            </p>
            <Field label="Email address">
              <input
                required
                type="email"
                autoComplete="email"
                value={email}
                disabled={sent}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            {sent && (
              <Field label="Verification code (if included in your email)">
                <input
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  maxLength={12}
                />
              </Field>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button
              disabled={
                !ready || busy || (!sent && registration !== true) || (sent && !code.trim())
              }
              className="button full"
            >
              {busy ? <LoaderCircle size={16} className="spin" /> : null}
              {sent ? 'Verify code and sign in' : 'Send sign-in email'}
              <ArrowRight size={16} />
            </button>
            {sent && (
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setSent(false);
                  setCode('');
                }}
              >
                Use another email / resend
              </button>
            )}
          </form>
        )}
      </section>
    </div>
  );
}
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Heading({
  eyebrow,
  title,
  copy,
  children,
}: {
  eyebrow: string;
  title: string;
  copy: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>
          {title}
          <span>.</span>
        </h1>
        <p>{copy}</p>
      </div>
      {children}
    </div>
  );
}

function ProfileEditor({
  saved,
  canSave,
  run,
  busy,
  importConnected,
}: {
  saved: Profile;
  canSave: boolean;
  run: Run;
  busy: boolean;
  importConnected: boolean;
}) {
  const [p, setP] = useState<Profile>(saved),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!loaded && saved !== emptyProfile) {
      setP(saved);
      setLoaded(true);
    }
  }, [saved, loaded]);
  const update = (id: string, change: Partial<SourceRecord>) =>
    setP({
      ...p,
      records: p.records.map((r) => (r.id === id ? { ...r, ...change, verification: 'draft' } : r)),
    });
  const add = () =>
    setP({
      ...p,
      records: [
        ...p.records,
        {
          id: crypto.randomUUID(),
          kind: 'experience',
          title: '',
          organization: '',
          startDate: '',
          endDate: '',
          url: '',
          contributions: '',
          technologies: [],
          accomplishments: '',
          metrics: [],
          sourceNotes: '',
          verification: 'draft',
          publicationStatus: 'not_applicable',
          gpa: '',
        },
      ],
    });
  return (
    <>
      <Heading
        eyebrow="THE SOURCE OF YOUR STORY"
        title="Your master profile"
        copy="Keep a comprehensive record. Approve only what you can stand behind."
      >
        <button
          className="button"
          disabled={!canSave || busy}
          onClick={() =>
            void run(async () => {
              await api('profile', 'PUT', p);
            }, 'Master profile saved.')
          }
        >
          <Check size={16} />
          Save profile
        </button>
      </Heading>
      <div className="profile-layout">
        <div>
          <section className="panel form-panel">
            <h2>Contact & professional links</h2>
            <div className="form-grid">
              {(['name', 'email', 'phone', 'location'] as const).map((k) => (
                <Field key={k} label={k === 'name' ? 'Full name' : k[0].toUpperCase() + k.slice(1)}>
                  <input
                    type={k === 'email' ? 'email' : 'text'}
                    value={p.contact[k]}
                    onChange={(e) => setP({ ...p, contact: { ...p.contact, [k]: e.target.value } })}
                  />
                </Field>
              ))}
            </div>
            <Field label="Professional links" hint="One full https:// URL per line.">
              <textarea
                rows={2}
                value={p.contact.links.join('\n')}
                onChange={(e) =>
                  setP({ ...p, contact: { ...p.contact, links: e.target.value.split('\n') } })
                }
              />
            </Field>
          </section>
          <section className="panel form-panel">
            <h2>Pasted master resume</h2>
            <p className="muted">
              A private reference. Pasted text is unverified until you add and approve structured
              records below.
            </p>
            <Field label="Master resume text">
              <textarea
                rows={7}
                value={p.masterText}
                onChange={(e) => setP({ ...p, masterText: e.target.value })}
                placeholder="Paste your complete background here…"
              />
            </Field>
            <p className="muted">
              Paste plain text to extract draft records with your own Codex companion. PDF and DOCX
              file uploads are not available.
            </p>
            <ProfileImporter
              rawText={p.masterText}
              records={p.records}
              canSave={canSave}
              dirty={
                JSON.stringify(profileSchema.safeParse(p).data ?? p) !==
                JSON.stringify(profileSchema.safeParse(saved).data ?? saved)
              }
              connected={importConnected}
              busy={busy}
              run={run}
              onApplied={(profile) => {
                setP(profile);
                setLoaded(true);
              }}
            />
          </section>
          <div className="section-heading">
            <div>
              <h2>Experience & evidence</h2>
              <p>
                Education, work, research, projects, publications, awards, skills, and coursework.
              </p>
            </div>
            <button className="button secondary small" onClick={add}>
              <Plus size={16} />
              Add record
            </button>
          </div>
          {!p.records.length && (
            <div className="panel empty-state">
              <BookOpen size={28} />
              <h3>Start with one experience</h3>
              <p>Your agent uses approved records only. No background is assumed.</p>
              <button className="button secondary" onClick={add}>
                <Plus size={16} />
                Add your first record
              </button>
            </div>
          )}
          {p.records.map((r, i) => (
            <section className="panel form-panel record-panel" key={r.id}>
              <div className="section-heading">
                <h3>
                  Record {String(i + 1).padStart(2, '0')}{' '}
                  <span className={`badge ${r.verification === 'approved' ? 'green' : ''}`}>
                    {r.verification}
                  </span>
                </h3>
                <button
                  className="icon-button danger-text"
                  aria-label={`Remove record ${i + 1}`}
                  onClick={() => setP({ ...p, records: p.records.filter((x) => x.id !== r.id) })}
                >
                  <Trash2 size={17} />
                </button>
              </div>
              <div className="form-grid">
                <Field label="Record type">
                  <select
                    value={r.kind}
                    onChange={(e) => update(r.id, { kind: e.target.value as SourceRecord['kind'] })}
                  >
                    {[
                      'experience',
                      'research',
                      'project',
                      'education',
                      'publication',
                      'presentation',
                      'award',
                      'skill',
                      'coursework',
                    ].map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Title / degree / skill">
                  <input
                    value={r.title}
                    onChange={(e) => update(r.id, { title: e.target.value })}
                  />
                </Field>
                <Field label="Organization">
                  <input
                    value={r.organization}
                    onChange={(e) => update(r.id, { organization: e.target.value })}
                  />
                </Field>
                <Field label="Source URL">
                  <input value={r.url} onChange={(e) => update(r.id, { url: e.target.value })} />
                </Field>
                <Field label="Start date">
                  <input
                    placeholder="e.g. Sep 2024"
                    value={r.startDate}
                    onChange={(e) => update(r.id, { startDate: e.target.value })}
                  />
                </Field>
                <Field label="End / graduation date">
                  <input
                    placeholder="e.g. Present or May 2027"
                    value={r.endDate}
                    onChange={(e) => update(r.id, { endDate: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="Responsibilities & your personal contributions">
                <textarea
                  rows={3}
                  value={r.contributions}
                  onChange={(e) => update(r.id, { contributions: e.target.value })}
                />
              </Field>
              <Field label="Technologies actually used" hint="Separate with commas.">
                <input
                  value={r.technologies.join(', ')}
                  onChange={(e) =>
                    update(r.id, { technologies: e.target.value.split(',').map((s) => s.trim()) })
                  }
                />
              </Field>
              <Field label="Accomplishments">
                <textarea
                  rows={2}
                  value={r.accomplishments}
                  onChange={(e) => update(r.id, { accomplishments: e.target.value })}
                />
              </Field>
              <Field label="Source notes / verification context">
                <textarea
                  rows={2}
                  value={r.sourceNotes}
                  onChange={(e) => update(r.id, { sourceNotes: e.target.value })}
                />
              </Field>
              {r.kind === 'publication' && (
                <Field label="Publication status">
                  <select
                    value={r.publicationStatus}
                    onChange={(e) =>
                      update(r.id, {
                        publicationStatus: e.target.value as SourceRecord['publicationStatus'],
                      })
                    }
                  >
                    {['published', 'accepted', 'submitted', 'in_progress'].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
              )}
              {r.kind === 'education' && (
                <Field label="GPA (optional)">
                  <input value={r.gpa} onChange={(e) => update(r.id, { gpa: e.target.value })} />
                </Field>
              )}
              <div className="metrics">
                <strong>Verified metrics</strong>
                <p className="muted">
                  Numeric bullet claims must cite a metric with its measurement context.
                </p>
                {r.metrics.map((m, n) => (
                  <div className="metric-row" key={m.id}>
                    <Field label={`Metric ${n + 1} value`}>
                      <input
                        value={m.value}
                        placeholder="e.g. 25%"
                        onChange={(e) =>
                          update(r.id, {
                            metrics: r.metrics.map((x) =>
                              x.id === m.id ? { ...x, value: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    </Field>
                    <Field label="Context / measurement">
                      <input
                        value={m.context}
                        onChange={(e) =>
                          update(r.id, {
                            metrics: r.metrics.map((x) =>
                              x.id === m.id ? { ...x, context: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    </Field>
                    <button
                      className="icon-button"
                      aria-label="Remove metric"
                      onClick={() =>
                        update(r.id, { metrics: r.metrics.filter((x) => x.id !== m.id) })
                      }
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
                <button
                  className="text-button"
                  onClick={() =>
                    update(r.id, {
                      metrics: [...r.metrics, { id: crypto.randomUUID(), value: '', context: '' }],
                    })
                  }
                >
                  <Plus size={15} />
                  Add verified metric
                </button>
              </div>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={r.verification === 'approved'}
                  onChange={(e) =>
                    setP({
                      ...p,
                      records: p.records.map((x) =>
                        x.id === r.id
                          ? { ...x, verification: e.target.checked ? 'approved' : 'draft' }
                          : x,
                      ),
                    })
                  }
                />
                I reviewed this record and approve these facts for use in resumes.
              </label>
              <small className="source-id">Source ID: {r.id}</small>
            </section>
          ))}
          <button
            className="button"
            disabled={!canSave || busy}
            onClick={() =>
              void run(async () => {
                await api('profile', 'PUT', p);
              }, 'Master profile saved.')
            }
          >
            Save master profile
            <Check size={16} />
          </button>
        </div>
        <aside className="profile-aside">
          <section className="panel form-panel">
            <span className="empty-icon">
              <ShieldCheck size={23} />
            </span>
            <h2>Evidence comes first</h2>
            <p>
              Editing an approved record returns it to draft. Review and approve it again before
              tailoring.
            </p>
            <div className="divider" />
            <strong>
              {p.records.filter((r) => r.verification === 'approved').length} approved records
            </strong>
            <p className="muted">Saved resumes retain their original profile snapshot.</p>
          </section>
          <section className="panel form-panel">
            <h2>Resume preferences</h2>
            <Field label="Preferred roles" hint="One per line.">
              <textarea
                rows={5}
                value={p.preferences.roles.join('\n')}
                onChange={(e) =>
                  setP({
                    ...p,
                    preferences: { ...p.preferences, roles: e.target.value.split('\n') },
                  })
                }
              />
            </Field>
            <label className="check-label">
              <input
                type="checkbox"
                checked={p.preferences.includeGpa}
                onChange={(e) =>
                  setP({ ...p, preferences: { ...p.preferences, includeGpa: e.target.checked } })
                }
              />
              Include GPA when available
            </label>
            <Field label="Tailoring instructions">
              <textarea
                rows={6}
                value={p.preferences.instructions}
                onChange={(e) =>
                  setP({ ...p, preferences: { ...p.preferences, instructions: e.target.value } })
                }
                placeholder="Tone, emphasis, and content preferences…"
              />
            </Field>
            <p className="muted">One page, 11 pt font, and readable margins by default.</p>
          </section>
        </aside>
      </div>
    </>
  );
}

function JobEditor({
  canSave,
  busy,
  run,
  onSaved,
}: {
  canSave: boolean;
  busy: boolean;
  run: Run;
  onSaved: (id: string) => void;
}) {
  const [job, setJob] = useState<Job>({
    company: '',
    title: '',
    description: '',
    url: '',
    location: '',
    notes: '',
  });
  return (
    <>
      <Heading
        eyebrow="THE NEXT OPPORTUNITY"
        title="Start with the role"
        copy="Paste the original posting. Your agent will connect the requirements to your evidence."
      />
      <form
        className="job-form-layout"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const result = await api<{ id: string }>('jobs', 'POST', job);
            onSaved(result.id);
          }, 'Opportunity saved.');
        }}
      >
        <section className="panel form-panel">
          <div className="form-grid">
            <Field label="Company">
              <input
                required
                value={job.company}
                onChange={(e) => setJob({ ...job, company: e.target.value })}
              />
            </Field>
            <Field label="Job title">
              <input
                required
                value={job.title}
                onChange={(e) => setJob({ ...job, title: e.target.value })}
              />
            </Field>
            <Field label="Location">
              <input
                value={job.location}
                onChange={(e) => setJob({ ...job, location: e.target.value })}
              />
            </Field>
            <Field
              label="Posting URL (optional)"
              hint="Saved as a reference; the posting is not imported from this URL."
            >
              <input
                type="url"
                value={job.url}
                onChange={(e) => setJob({ ...job, url: e.target.value })}
              />
            </Field>
          </div>
          <Field
            label="Full job description"
            hint="Include requirements, responsibilities, and any eligibility restrictions."
          >
            <textarea
              required
              minLength={40}
              rows={16}
              value={job.description}
              placeholder="Paste the full job description here…"
              onChange={(e) => setJob({ ...job, description: e.target.value })}
            />
          </Field>
          <Field label="Private notes">
            <textarea
              rows={3}
              value={job.notes}
              onChange={(e) => setJob({ ...job, notes: e.target.value })}
            />
          </Field>
          <button className="button" disabled={!canSave || busy}>
            Save opportunity
            <ArrowRight size={16} />
          </button>
        </section>
        <aside className="panel form-panel job-tips">
          <span className="empty-icon">
            <Search size={25} />
          </span>
          <h2>Fit you can understand</h2>
          <p>
            Your agent reviews required skills, relevant responsibilities, domain experience, and
            preferred qualifications.
          </p>
          <div className="divider" />
          <h3>Grounded in your background</h3>
          <p>
            Supported matches point back to your approved source records. Gaps and unknowns stay
            visible.
          </p>
          <div className="divider" />
          <h3>Eligibility is a separate check</h3>
          <p>
            Location, authorization, and education restrictions are highlighted for your review.
            Technical fit does not establish eligibility.
          </p>
        </aside>
      </form>
    </>
  );
}

function ResumeWorkspace({
  data,
  selectedJob,
  setSelectedJob,
  run,
  busy,
  connected,
  onNew,
}: {
  data: WorkspaceData;
  selectedJob: string;
  setSelectedJob: (id: string) => void;
  run: Run;
  busy: boolean;
  connected: boolean;
  onNew: () => void;
}) {
  const job = data.jobs.find((j) => j.id === selectedJob) ?? data.jobs[0];
  const versions = data.versions.filter((v) => v.job_id === job?.id);
  const [versionId, setVersionId] = useState(''),
    [revision, setRevision] = useState(''),
    [locks, setLocks] = useState<string[]>([]),
    [sections, setSections] = useState<string[]>([]),
    [excluded, setExcluded] = useState<string[]>([]),
    [draft, setDraft] = useState<AgentOutput | null>(null),
    [pdf, setPdf] = useState(''),
    [compare, setCompare] = useState(''),
    [tab, setTab] = useState<'Resume' | 'Cover letter' | 'Fit & evidence' | 'Versions'>('Resume');
  const version = versions.find((v) => v.id === versionId) ?? versions[0];
  const task = data.tasks.find((t) => t.job_id === job?.id);
  const outputKey = JSON.stringify(version?.output);
  useEffect(() => {
    setDraft(outputKey ? JSON.parse(outputKey) : null);
    setLocks([]);
    setSections([]);
    setExcluded([]);
    setPdf('');
  }, [version?.id, outputKey]);
  const queue = (operation: 'tailor' | 'revise' | 'render') =>
    void run(
      async () => {
        await api('tasks', 'POST', {
          jobId: job!.id,
          operation,
          versionId: operation === 'tailor' ? null : (version?.id ?? null),
          revisionRequest: revision,
          lockedBulletIds: operation === 'tailor' ? [] : locks,
          lockedSectionIds: operation === 'tailor' ? [] : sections,
          excludedSourceIds: excluded,
        });
      },
      connected
        ? 'Task queued. Your companion will pick it up.'
        : 'Task queued. Start your companion to process it.',
    );
  if (!job)
    return (
      <>
        <Heading
          eyebrow="A FOCUSED SPACE FOR EVERY ROLE"
          title="Resume workspace"
          copy="Review the fit, refine your story, and keep every version."
        />
        <section className="panel empty-state roomy">
          <FileText size={34} />
          <h3>Your first resume starts with a job</h3>
          <p>Add a job description and approve your profile before starting.</p>
          <button className="button" onClick={onNew}>
            <Plus size={16} />
            Add an opportunity
          </button>
        </section>
      </>
    );
  const currentProfile = version?.profile ?? data.profile;
  const artifact = data.artifacts.find((a) => a.version_id === version?.id && a.kind === 'pdf');
  const unchanged = JSON.stringify(draft) === JSON.stringify(version?.output);
  const toggle = (id: string, items: string[], set: (s: string[]) => void) =>
    set(items.includes(id) ? items.filter((x) => x !== id) : [...items, id]);
  return (
    <>
      <Heading
        eyebrow={job.data.company.toUpperCase()}
        title={job.data.title}
        copy={`${job.data.location || 'Location unspecified'} · Saved ${date(job.created_at)}`}
      >
        <select
          className="job-picker"
          aria-label="Choose opportunity"
          value={job.id}
          onChange={(e) => {
            setSelectedJob(e.target.value);
            setVersionId('');
          }}
        >
          {data.jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.data.company} · {j.data.title}
            </option>
          ))}
        </select>
      </Heading>
      <div className="workspace-toolbar">
        <div className="tab-list" role="tablist" aria-label="Resume workspace">
          {(['Resume', 'Cover letter', 'Fit & evidence', 'Versions'] as const).map((t) => (
            <button
              role="tab"
              aria-selected={tab === t}
              className={tab === t ? 'selected' : ''}
              key={t}
              onClick={() => setTab(t)}
            >
              {t}
              {t === 'Versions' && <span>{versions.length}</span>}
            </button>
          ))}
        </div>
        <button
          className="button small"
          disabled={busy || ['queued', 'running'].includes(task?.state ?? '')}
          onClick={() => queue('tailor')}
        >
          <Sparkles size={15} />
          {versions.length ? 'Tailor a fresh version' : 'Start tailoring'}
        </button>
      </div>
      {task && (
        <section
          className={`task-status ${task.state === 'failed' ? 'failed' : ''}`}
          aria-live="polite"
        >
          <div>
            {['running', 'queued'].includes(task.state) ? (
              <LoaderCircle size={18} className={task.state === 'running' ? 'spin' : ''} />
            ) : task.state === 'completed' ? (
              <CheckCircle2 size={18} />
            ) : (
              <Clock3 size={18} />
            )}
            <div>
              <strong>{task.stage}</strong>
              <p>
                {task.state === 'queued' && !connected
                  ? 'Companion offline. Run npm run companion -- run to pick up this task.'
                  : task.error_code
                    ? (failureHelp[task.error_code] ?? task.error_code)
                    : task.state === 'completed'
                      ? 'Review the evidence and layout before using this resume.'
                      : 'Progress is reported by your local companion.'}
              </p>
            </div>
          </div>
          {['queued', 'running'].includes(task.state) && (
            <button
              className="text-button"
              onClick={() =>
                void run(async () => {
                  await api(`tasks/${task.id}`, 'DELETE');
                }, 'Task cancelled.')
              }
            >
              Cancel task
            </button>
          )}
          {task.draft && (
            <button
              className="text-button"
              onClick={() =>
                download(
                  JSON.stringify(task.draft, null, 2),
                  'ResumeForge_private_failed_draft.json',
                )
              }
            >
              Download retained draft
            </button>
          )}
        </section>
      )}
      {tab === 'Fit & evidence' && (
        <div className="analysis-layout">
          <section className="panel form-panel">
            <h2>Original job posting</h2>
            <details>
              <summary>View the saved posting</summary>
              <p className="pre-wrap">{job.data.description}</p>
              {job.data.url && (
                <a href={job.data.url} rel="noreferrer" target="_blank">
                  Open original posting
                  <Link2 size={14} />
                </a>
              )}
            </details>
            {version ? (
              <>
                <div className="score-row">
                  <span className="score">
                    {fitScore(version.output.analysis) ?? '—'}
                    <small>/100</small>
                  </span>
                  <div>
                    <h3>Evidence fit</h3>
                    <p>
                      A heuristic of supported requirements, not an ATS score or hiring probability.
                    </p>
                  </div>
                </div>
                <p>{version.output.analysis.summary}</p>
                <p className="muted">
                  Rubric: required skills 45%, responsibilities 30%, domain relevance 15%, preferred
                  qualifications 10%. Missing categories are reweighted.
                </p>
                {version.output.analysis.requirements.map((r) => (
                  <article className="requirement" key={r.id}>
                    <div>
                      <strong>{r.text}</strong>
                      <span className={`badge ${r.evidence === 'strong' ? 'green' : ''}`}>
                        {r.evidence}
                      </span>
                    </div>
                    <small>{r.category}</small>
                    <p>{r.explanation}</p>
                    <div className="source-chips">
                      {r.sourceIds.map((id) => (
                        <span key={id} title={id}>
                          {currentProfile.records.find((s) => s.id === id)?.title ?? id}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </>
            ) : (
              <div className="empty-state">
                <Search size={25} />
                <h3>Analysis begins with your agent</h3>
                <p>Start tailoring to receive evidence matches and an explained fit assessment.</p>
              </div>
            )}
          </section>
          {version && (
            <aside>
              {[
                { title: 'Gaps & weak qualifications', items: version.output.analysis.gaps },
                { title: 'Unknowns', items: version.output.analysis.unknowns },
                {
                  title: 'Eligibility · review separately',
                  items: version.output.analysis.eligibility,
                },
                { title: 'Tailoring plan', items: version.output.analysis.tailoringPlan },
                { title: 'Review warnings', items: version.output.warnings },
              ].map((s) => (
                <section className="panel form-panel" key={s.title}>
                  <h2>{s.title}</h2>
                  {s.items.length ? (
                    <ul className="plain-list">
                      {s.items.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">None reported. Review the original posting yourself.</p>
                  )}
                </section>
              ))}
              <section className="panel form-panel">
                <h2>Education & experience</h2>
                <p>{version.output.analysis.education}</p>
                <p>{version.output.analysis.experience}</p>
              </section>
            </aside>
          )}
        </div>
      )}
      {tab === 'Cover letter' && (
        <div className="panel form-panel">
          <div className="section-heading">
            <div>
              <h2>Cover letter</h2>
              <p>
                Written with the resume from the same approved facts. Edit it here; saving creates a
                new version.
              </p>
            </div>
          </div>
          {draft && version && draft.coverLetter !== undefined ? (
            <>
              <textarea
                aria-label="Cover letter"
                className="cover-letter"
                rows={18}
                maxLength={4000}
                value={draft.coverLetter}
                onChange={(e) => setDraft({ ...draft, coverLetter: e.target.value })}
              />
              <div className="downloads">
                <button
                  className="text-button"
                  onClick={() =>
                    void run(async () => {
                      await navigator.clipboard.writeText(draft.coverLetter ?? '');
                    }, 'Cover letter copied.')
                  }
                >
                  <Check size={15} />
                  Copy
                </button>
                <button
                  className="text-button"
                  onClick={() =>
                    download(
                      draft.coverLetter ?? '',
                      `${safeFilename(version.profile.contact.name, job.data.company, job.data.title)}_Cover_Letter.txt`,
                      'text/plain',
                    )
                  }
                >
                  <ArrowDownToLine size={15} />
                  Text
                </button>
                <button
                  className="button secondary"
                  disabled={unchanged || busy}
                  onClick={() =>
                    void run(async () => {
                      await api('versions', 'POST', {
                        parentId: version.id,
                        output: draft,
                        label: 'Cover letter edit',
                      });
                    }, 'New version saved with your cover letter edits.')
                  }
                >
                  Save as new version
                  <Check size={15} />
                </button>
              </div>
            </>
          ) : (
            <div className="empty-state roomy">
              <FileText size={30} />
              <h3>No cover letter for this version yet</h3>
              <p>
                Tailor a fresh version with companion {COMPANION_VERSION} or later to get a cover
                letter alongside the resume.
              </p>
            </div>
          )}
        </div>
      )}
      {tab === 'Versions' && (
        <div className="panel form-panel">
          <div className="section-heading">
            <div>
              <h2>Every version is a checkpoint</h2>
              <p>Restoring creates a new version. Saved versions are never overwritten.</p>
            </div>
          </div>
          {versions.length ? (
            versions.map((v, i) => (
              <div className="version-row" key={v.id}>
                <span className="version-number">
                  {String(versions.length - i).padStart(2, '0')}
                </span>
                <div>
                  <strong>{v.label}</strong>
                  <small>
                    {new Date(v.created_at).toLocaleString()} · {v.render.status}
                  </small>
                </div>
                <button
                  className="text-button"
                  onClick={() => {
                    setVersionId(v.id);
                    setTab('Resume');
                  }}
                >
                  Open
                </button>
                <button className="text-button" onClick={() => setCompare(v.id)}>
                  Compare
                </button>
                <button
                  className="text-button"
                  onClick={() =>
                    void run(async () => {
                      await api('versions', 'POST', {
                        parentId: v.id,
                        output: v.output,
                        label: 'Restored earlier version',
                      });
                    }, 'Earlier content restored as a new version.')
                  }
                >
                  Restore
                </button>
              </div>
            ))
          ) : (
            <p className="muted">No resume versions yet.</p>
          )}
          {compare && version && (
            <div className="comparison">
              <div>
                <h3>Selected / latest version</h3>
                <ResumeText version={version} />
              </div>
              <div>
                <h3>Compared version</h3>
                <ResumeText version={versions.find((v) => v.id === compare)!} />
              </div>
            </div>
          )}
        </div>
      )}
      {tab === 'Resume' && (
        <div className="resume-layout">
          <section>
            <div className="panel form-panel">
              <div className="section-heading">
                <div>
                  <h2>Resume content</h2>
                  <p>
                    {version
                      ? `${version.label} · ${date(version.created_at)}`
                      : 'Your evidence, shaped for this role.'}
                  </p>
                </div>
                {version && (
                  <select
                    aria-label="Resume version"
                    value={version.id}
                    onChange={(e) => setVersionId(e.target.value)}
                  >
                    {versions.map((v, i) => (
                      <option key={v.id} value={v.id}>
                        Version {versions.length - i} · {v.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {draft && version ? (
                <>
                  <div className="notice subtle">
                    <ShieldCheck size={17} />
                    Sources support review; they do not guarantee factual accuracy.
                  </div>
                  {draft.resume.sections.map((s) => (
                    <div className="resume-section" key={s.id}>
                      <div className="section-heading">
                        <h3>{s.title}</h3>
                        <label className="lock-toggle">
                          <input
                            type="checkbox"
                            checked={sections.includes(s.id)}
                            onChange={() => toggle(s.id, sections, setSections)}
                          />
                          <LockKeyhole size={13} />
                          Lock section
                        </label>
                      </div>
                      {s.entries.map((entry) => (
                        <div className="resume-entry" key={entry.sourceId}>
                          <strong>
                            {currentProfile.records.find((r) => r.id === entry.sourceId)?.title}
                          </strong>
                          {entry.bullets.map((b) => (
                            <div className="bullet-editor" key={b.id}>
                              <textarea
                                aria-label="Resume bullet"
                                rows={3}
                                value={b.text}
                                maxLength={300}
                                onChange={(e) =>
                                  setDraft({
                                    ...draft,
                                    resume: {
                                      sections: draft.resume.sections.map((x) => ({
                                        ...x,
                                        entries: x.entries.map((en) => ({
                                          ...en,
                                          bullets: en.bullets.map((y) =>
                                            y.id === b.id ? { ...y, text: e.target.value } : y,
                                          ),
                                        })),
                                      })),
                                    },
                                  })
                                }
                              />
                              <label className="lock-toggle">
                                <input
                                  type="checkbox"
                                  checked={locks.includes(b.id)}
                                  onChange={() => toggle(b.id, locks, setLocks)}
                                />
                                <LockKeyhole size={12} />
                                Lock
                              </label>
                              <small className="source-id">
                                Sources:{' '}
                                {b.sourceIds
                                  .map(
                                    (id) =>
                                      currentProfile.records.find((r) => r.id === id)?.title ?? id,
                                  )
                                  .join(', ')}
                                {b.metricIds.length
                                  ? ` · ${b.metricIds.length} verified metrics`
                                  : ''}
                              </small>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ))}
                  <button
                    className="button secondary"
                    disabled={unchanged || busy}
                    onClick={() =>
                      void run(async () => {
                        await api('versions', 'POST', {
                          parentId: version.id,
                          output: draft,
                          label: 'Manual edit',
                        });
                      }, 'New version saved. Render it with the companion for an updated PDF.')
                    }
                  >
                    Save as new version
                    <Check size={15} />
                  </button>
                  {!unchanged && (
                    <p className="muted">
                      Save edits before requesting a revision or rendering. The existing PDF belongs
                      to the saved version.
                    </p>
                  )}
                </>
              ) : (
                <div className="empty-state roomy">
                  <FileText size={30} />
                  <h3>Your resume will take shape here</h3>
                  <p>Start tailoring to generate a draft from approved profile facts.</p>
                </div>
              )}
            </div>
            <section className="panel form-panel">
              <h2>{version ? 'Refine this version' : 'Select your evidence'}</h2>
              <p className="muted">
                Include or exclude approved records. Locked content must stay unchanged during
                revision.
              </p>
              <div className="evidence-options">
                {currentProfile.records
                  .filter((r) => r.verification === 'approved')
                  .map((r) => (
                    <label className="check-label" key={r.id}>
                      <input
                        type="checkbox"
                        checked={!excluded.includes(r.id)}
                        onChange={() => toggle(r.id, excluded, setExcluded)}
                      />
                      <span>
                        {r.title}
                        <small>
                          {r.kind} · {r.organization}
                        </small>
                      </span>
                    </label>
                  ))}
              </div>
              {version && (
                <>
                  <Field
                    label="Revision request"
                    hint="To regenerate selected content, name the section or bullet. Lock everything you want to retain."
                  >
                    <textarea
                      rows={4}
                      value={revision}
                      onChange={(e) => setRevision(e.target.value)}
                      placeholder="Emphasize my systems work and shorten the project section…"
                    />
                  </Field>
                  <div className="button-row">
                    <button
                      className="button"
                      disabled={
                        busy ||
                        !revision.trim() ||
                        !unchanged ||
                        ['running', 'queued'].includes(task?.state ?? '')
                      }
                      onClick={() => queue('revise')}
                    >
                      <Sparkles size={15} />
                      Request revision
                    </button>
                    <button
                      className="button secondary"
                      disabled={
                        busy || !unchanged || ['running', 'queued'].includes(task?.state ?? '')
                      }
                      onClick={() => queue('render')}
                    >
                      Render saved version
                    </button>
                  </div>
                </>
              )}
              {!connected && (
                <p className="offline-note">
                  <WifiOff size={14} />
                  Companion offline. Tasks will wait safely in your queue.
                </p>
              )}
            </section>
          </section>
          <aside className="preview-column">
            <section className="panel form-panel">
              <div className="section-heading">
                <h2>PDF preview</h2>
                <span className={`badge ${version?.render.status === 'ready' ? 'green' : ''}`}>
                  {version?.render.status ?? 'Not rendered'}
                </span>
              </div>
              {version && (
                <p className="muted">
                  {version.render.pageCount || '—'} page{version.render.pageCount === 1 ? '' : 's'}{' '}
                  ·{' '}
                  {version.render.textVerified
                    ? 'Text extraction checked'
                    : 'Text extraction not verified'}
                </p>
              )}
              {version?.render.warnings.map((w, i) => (
                <p className="form-error" key={i}>
                  {w}
                </p>
              ))}
              {pdf ? (
                <>
                  <iframe title="Private resume PDF preview" src={pdf} className="pdf-frame" />
                  <p className="muted">Preview links expire after 60 seconds. Reopen if needed.</p>
                </>
              ) : (
                <div className="pdf-placeholder">
                  <FileText size={38} />
                  <strong>
                    {artifact ? 'Your PDF is ready to review' : 'A clear, single-column resume'}
                  </strong>
                  <p>
                    {artifact
                      ? 'Open a short-lived private preview.'
                      : 'The companion renders a one-page PDF using the supplied Jake’s Resume LaTeX template.'}
                  </p>
                </div>
              )}
              {artifact && (
                <button
                  className="button secondary full"
                  onClick={() =>
                    void run(async () => {
                      const a = await api<{ url: string }>(`artifacts/${artifact.id}`);
                      setPdf(a.url);
                    })
                  }
                >
                  Open / refresh PDF preview
                </button>
              )}
              {version && (
                <div className="downloads">
                  <button
                    className="text-button"
                    disabled={!artifact}
                    onClick={() =>
                      void run(async () => {
                        const a = await api<{ url: string; filename: string }>(
                          `artifacts/${artifact!.id}`,
                        );
                        const res = await fetch(a.url);
                        if (!res.ok) throw new Error('Download expired. Try again.');
                        const url = URL.createObjectURL(await res.blob());
                        const el = document.createElement('a');
                        el.href = url;
                        el.download = a.filename;
                        el.click();
                        setTimeout(() => URL.revokeObjectURL(url), 1000);
                      })
                    }
                  >
                    <ArrowDownToLine size={15} />
                    PDF
                  </button>
                  <button
                    className="text-button"
                    onClick={() =>
                      download(
                        renderLatex(version.profile, version.output),
                        `${safeFilename(version.profile.contact.name, job.data.company, job.data.title)}.tex`,
                        'application/x-tex',
                      )
                    }
                  >
                    <ArrowDownToLine size={15} />
                    LaTeX
                  </button>
                  <button
                    className="text-button"
                    onClick={() =>
                      download(
                        JSON.stringify(version.output, null, 2),
                        `${safeFilename(version.profile.contact.name, job.data.company, job.data.title)}.json`,
                      )
                    }
                  >
                    <ArrowDownToLine size={15} />
                    JSON
                  </button>
                </div>
              )}
            </section>
            <div className="quiet-note">
              <ShieldCheck size={18} />
              <span>
                Review wording, dates, and layout before applying. Generation never submits an
                application.
              </span>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
function ResumeText({ version }: { version: VersionView }) {
  return (
    <div className="pre-wrap compare-text">
      {version.output.resume.sections.map((s) => (
        <section key={s.id}>
          <h3>{s.title}</h3>
          {s.entries.map((e) => (
            <div key={e.sourceId}>
              <strong>{version.profile.records.find((r) => r.id === e.sourceId)?.title}</strong>
              <ul>
                {e.bullets.map((b) => (
                  <li key={b.id}>{b.text}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function Applications({
  data,
  run,
  openJob,
}: {
  data: WorkspaceData;
  run: Run;
  openJob: (id: string) => void;
}) {
  const [search, setSearch] = useState(''),
    [filter, setFilter] = useState('All stages');
  const apps = data.applications.filter((a) => {
    const j = data.jobs.find((j) => j.id === a.job_id);
    return (
      j &&
      `${j.data.company} ${j.data.title}`.toLowerCase().includes(search.toLowerCase()) &&
      (filter === 'All stages' || a.stage === filter)
    );
  });
  return (
    <>
      <Heading
        eyebrow="KEEP THE BIG PICTURE"
        title="Your applications"
        copy="Track the next step, and remember exactly which resume you sent."
      />
      <div className="filter-bar">
        <label className="search-box">
          <Search size={17} />
          <input
            aria-label="Search company or title"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company or job title…"
          />
        </label>
        <select
          aria-label="Filter application stage"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option>All stages</option>
          {stages.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <span className="muted">{apps.length} opportunities</span>
      </div>
      <div className="application-list">
        {apps.map((a) => (
          <ApplicationCard
            key={a.id + JSON.stringify(a)}
            application={a}
            data={data}
            run={run}
            openJob={openJob}
          />
        ))}
        {!apps.length && (
          <div className="panel empty-state roomy">
            <BriefcaseBusiness size={30} />
            <h3>
              {data.applications.length
                ? 'No matching opportunities'
                : 'A new chapter, one step at a time'}
            </h3>
            <p>
              {data.applications.length
                ? 'Try another search or stage filter.'
                : 'Save a job description to begin tracking an opportunity.'}
            </p>
          </div>
        )}
      </div>
    </>
  );
}
function ApplicationCard({
  application: a,
  data,
  run,
  openJob,
}: {
  application: ApplicationView;
  data: WorkspaceData;
  run: Run;
  openJob: (id: string) => void;
}) {
  const [stage, setStage] = useState(a.stage),
    [notes, setNotes] = useState(a.notes),
    [appliedAt, setAppliedAt] = useState(a.applied_at ?? ''),
    [resume, setResume] = useState(a.resume_version_id ?? '');
  const job = data.jobs.find((j) => j.id === a.job_id)!;
  return (
    <section className="panel form-panel application-card">
      <div className="section-heading">
        <div className="application-title">
          <span className="company-tile">{job.data.company.slice(0, 2).toUpperCase()}</span>
          <div>
            <h2>{job.data.title}</h2>
            <p>
              {job.data.company} · {job.data.location || 'Location unspecified'}
            </p>
          </div>
        </div>
        <button className="text-button" onClick={() => openJob(job.id)}>
          Open workspace
          <ArrowRight size={15} />
        </button>
      </div>
      <div className="form-grid three">
        <Field label="Application stage">
          <select value={stage} onChange={(e) => setStage(e.target.value as typeof stage)}>
            {stages.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Date applied">
          <input type="date" value={appliedAt} onChange={(e) => setAppliedAt(e.target.value)} />
        </Field>
        <Field label="Exact resume used">
          <select value={resume} onChange={(e) => setResume(e.target.value)}>
            <option value="">Not selected</option>
            {data.versions
              .filter((v) => v.job_id === job.id)
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {date(v.created_at)} · {v.label} · {v.id.slice(0, 8)}
                </option>
              ))}
          </select>
        </Field>
      </div>
      <Field label="Notes">
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="button-row">
        <button
          className="button secondary small"
          onClick={() =>
            void run(async () => {
              await api(`applications/${a.id}`, 'PATCH', {
                stage,
                notes,
                appliedAt,
                resumeVersionId: resume || null,
              });
            }, 'Application updated.')
          }
        >
          Save application
        </button>
        {job.data.url && (
          <a className="text-button" href={job.data.url} target="_blank" rel="noreferrer">
            Original posting
            <Link2 size={14} />
          </a>
        )}
      </div>
    </section>
  );
}

function Settings({
  data,
  signedIn,
  run,
  busy,
}: {
  data: WorkspaceData;
  signedIn: boolean;
  run: Run;
  busy: boolean;
}) {
  const [code, setCode] = useState(''),
    [confirmation, setConfirmation] = useState('');
  return (
    <>
      <Heading
        eyebrow="BRING YOUR OWN AGENT"
        title="Connected on your terms"
        copy="Your local Codex does the work. ResumeForge keeps your workspace organized."
      />
      <div className="settings-layout">
        <div>
          <section className="panel form-panel">
            <div className="provider-header">
              <span className="provider-icon">
                <Terminal size={26} />
              </span>
              <div>
                <h2>Codex</h2>
                <p>Local authentication · outbound-only companion</p>
              </div>
              <span className="badge green">Supported</span>
            </div>
            <ol className="setup-list">
              <li>
                On your computer, run <code>codex login</code> if needed.
              </li>
              <li>
                <Link href="/companion" className="text-button">
                  Install the companion
                </Link>
                , then run <code>resumeforge pair</code> on your own computer.
              </li>
              <li>Enter the companion’s expiring code below and approve this device.</li>
              <li>
                Run <code>resumeforge run</code> and keep it open.
              </li>
            </ol>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await api('pairing/approve', 'POST', { code });
                  setCode('');
                }, 'Device approved. Keep the companion open to finish pairing.');
              }}
            >
              <div className="pair-form">
                <Field label="Pairing code">
                  <input
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="ABCD-EFGH-JKLM"
                    autoComplete="off"
                    maxLength={20}
                  />
                </Field>
                <button className="button" disabled={!signedIn || busy}>
                  Approve device
                  <Check size={15} />
                </button>
              </div>
            </form>
            <p className="muted">
              Approve only a code shown by a companion you started. Codes expire in 10 minutes and
              can be used once.
            </p>
            <p className="muted">
              Each user connects their own Codex access. Other agents are currently unavailable.{' '}
              <Link href="/companion">
                Installation, pairing, troubleshooting, and disconnect guide
              </Link>
              .
            </p>
          </section>
          <section className="panel form-panel">
            <h2>Your devices</h2>
            {data.devices.filter((d) => !d.revoked_at).length ? (
              data.devices
                .filter((d) => !d.revoked_at)
                .map((d) => (
                  <div className="device-row" key={d.id}>
                    <span className={`status-dot ${online(d) ? 'online' : ''}`} />
                    <div>
                      <strong>{d.name}</strong>
                      <small>
                        {online(d) ? 'Online' : 'Offline'} · Codex:{' '}
                        {d.agent_status.replaceAll('_', ' ')}
                        {d.last_seen
                          ? ` · Last seen ${new Date(d.last_seen).toLocaleString()}`
                          : ''}
                      </small>
                    </div>
                    <button
                      className="text-button danger-text"
                      onClick={() =>
                        void run(async () => {
                          await api(`devices/${d.id}`, 'DELETE');
                        }, 'Device disconnected. It can no longer claim or complete tasks.')
                      }
                    >
                      <Unplug size={14} />
                      Disconnect
                    </button>
                  </div>
                ))
            ) : (
              <div className="empty-state">
                <Terminal size={27} />
                <h3>No companion paired yet</h3>
                <p>Pair your computer to run your first tailoring task.</p>
              </div>
            )}
          </section>
        </div>
        <aside>
          <section className="panel form-panel">
            <h2>Your data belongs to you</h2>
            <p>Profiles, postings, tasks, and generated resumes are private to your account.</p>
            <button
              className="button secondary full"
              disabled={!signedIn}
              onClick={() =>
                void run(async () => {
                  const result = await api<unknown>('export');
                  download(JSON.stringify(result, null, 2), 'ResumeForge_private_data_export.json');
                })
              }
            >
              <ArrowDownToLine size={15} />
              Export account data
            </button>
            <p className="muted">
              Includes profile and resume JSON, snapshots, and artifact metadata. Download PDF files
              in each resume workspace.
            </p>
          </section>
          <section className="panel form-panel">
            <h2>Local diagnostics</h2>
            <p>Check Codex sign-in, your OS credential store, and the Tectonic compiler:</p>
            <code className="code-block">npm run companion -- doctor</code>
            <p className="muted">
              Codex account and workspace limits apply. ResumeForge never switches to a billed API
              model.
            </p>
          </section>
          <section className="panel form-panel danger-zone">
            <h2>Delete your account</h2>
            <p>
              This permanently deletes your profile, jobs, versions, devices, and stored artifacts.
            </p>
            <Field label="Type DELETE MY RESUMEFORGE ACCOUNT to confirm">
              <input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
            </Field>
            <button
              className="button danger full"
              disabled={!signedIn || busy || confirmation !== 'DELETE MY RESUMEFORGE ACCOUNT'}
              onClick={() =>
                void run(async () => {
                  await api('account', 'DELETE', { confirmation });
                  await supabase!.auth.signOut();
                }, 'Account deleted.')
              }
            >
              Delete all account data
            </button>
          </section>
        </aside>
      </div>
    </>
  );
}
