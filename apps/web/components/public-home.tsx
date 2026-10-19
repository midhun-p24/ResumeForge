'use client';
import Link from 'next/link';
import {
  ArrowRight,
  FileCheck2,
  Fingerprint,
  Layers3,
  LockKeyhole,
  ShieldCheck,
  Terminal,
  Zap,
} from 'lucide-react';
import '../app/design-preview/preview.css';

export function PublicHome({ children }: { children: React.ReactNode }) {
  return (
    <div className="forge-preview live-public">
      <div className="fp-signin">
        <header>
          <Link href="/" className="fp-brand">
            <span className="fp-brand-icon">
              <Layers3 size={23} />
            </span>
            ResumeForge
            <span className="fp-brand-square" />
          </Link>
          <Link href="/companion" className="fp-link">
            Companion guide <ArrowRight size={15} />
          </Link>
        </header>
        <main className="fp-signin-grid">
          <section className="fp-intro">
            <div className="fp-eyebrow">
              <Zap size={15} />
              BUILT ON YOUR EXPERIENCE
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
                    Connect your own Codex sign-in. Your tasks never run through another user’s
                    account or computer.
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
                <strong>Codex requires a local companion.</strong>
                <p>
                  Install the companion on your computer, sign in to Codex, and pair it with your
                  ResumeForge account. Keep it running while tailoring. Account access and usage
                  limits apply.
                </p>
                <Link href="/companion" className="fp-link">
                  Install and connect <ArrowRight size={15} />
                </Link>
              </div>
            </div>
          </section>
          <section className="fp-signin-card fp-card">
            {children}
            <p className="fp-signin-note">
              <LockKeyhole size={14} />
              Each account has its own private profile and files.
            </p>
            <div className="fp-availability">
              <span className="fp-dot" />
              <strong>Codex</strong>
              <span>Supported · local companion required</span>
            </div>
            <p className="fp-small-note">Other agents are currently unavailable.</p>
          </section>
        </main>
        <footer className="fp-signin-footer">
          <span>ResumeForge</span>
          <span>You find the opportunity. You review and apply.</span>
        </footer>
      </div>
    </div>
  );
}
