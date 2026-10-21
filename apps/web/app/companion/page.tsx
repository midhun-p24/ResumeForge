import Link from 'next/link';
import { Layers3, ArrowRight, ArrowDownToLine, ShieldCheck } from 'lucide-react';

export default function CompanionGuide() {
  return (
    <main className="companion-guide">
      <header>
        <Link href="/" className="brand">
          <Layers3 size={25} />
          ResumeForge
        </Link>
        <Link href="/" className="text-button">
          Back to your account <ArrowRight size={16} />
        </Link>
      </header>
      <div className="eyebrow">CODEX CONNECTION GUIDE</div>
      <h1>Your agent runs on your computer.</h1>
      <p className="lead">
        Every person installs their own companion and signs in to their own Codex account.
        ResumeForge does not share the owner’s computer, Codex access, or credentials with other
        users.
      </p>
      <div className="guide-steps">
        <section className="panel">
          <h2>1. Install the prerequisites</h2>
          <p>
            Install{' '}
            <a href="https://nodejs.org/en/download" target="_blank" rel="noreferrer">
              Node.js 22.14 or newer
            </a>{' '}
            and{' '}
            <a
              href="https://tectonic-typesetting.github.io/en-US/install.html"
              target="_blank"
              rel="noreferrer"
            >
              Tectonic 0.17 or newer
            </a>
            . Tectonic turns the resume into a PDF locally. Add its executable to PATH, or set its
            full path in your terminal:
          </p>
          <pre>
            <code>
              {
                "# Windows PowerShell example — use your actual installation path\n$env:RESUMEFORGE_TECTONIC_PATH='C:\\Tools\\Tectonic\\tectonic.exe'\n\n# macOS / Linux example\nexport RESUMEFORGE_TECTONIC_PATH=/absolute/path/to/tectonic"
              }
            </code>
          </pre>
          <p>
            Restart your terminal after installing tools. Windows is verified for this release.
            macOS needs Keychain and Linux needs a running Secret Service/keyring; those platforms
            require an installation check on the user’s machine.
          </p>
        </section>
        <section className="panel">
          <h2>2. Install the ResumeForge companion</h2>
          <p>
            No GitHub account or private repository access is required. The download contains the
            companion runtime and a dependency manifest. npm downloads its required public
            dependencies.
          </p>
          <pre>
            <code>
              npm install --global
              https://resume-forge.midoon.dev/downloads/resumeforge-companion-0.5.10.tgz
            </code>
          </pre>
          <div className="button-row">
            <a
              className="button secondary"
              href="/downloads/resumeforge-companion-0.5.10.tgz"
              download
            >
              <ArrowDownToLine size={16} />
              Download package
            </a>
            <a className="text-button" href="/downloads/resumeforge-companion-0.5.10.tgz.sha256">
              SHA-256 checksum
            </a>
          </div>
          <p>
            PowerShell blocking npm.ps1? Use <code>npm.cmd</code> and <code>resumeforge.cmd</code>.
            Verify a downloaded package on Windows with <code>Get-FileHash -Algorithm SHA256</code>,
            or <code>shasum -a 256</code> on macOS/Linux. Compare against the linked checksum.
          </p>
        </section>
        <section className="panel">
          <h2>3. Choose your writer: Codex or Claude</h2>
          <pre>
            <code>
              {
                '# Option A: your own ChatGPT Codex sign-in\nresumeforge login\n\n# Option B: your own Anthropic API key (Claude Opus 5.5 by default)\nresumeforge login --claude\n\nresumeforge doctor\nresumeforge warmup'
              }
            </code>
          </pre>
          <p>
            <code>resumeforge login --claude</code> stores your Anthropic API key in your OS
            credential vault and selects Claude; the key never leaves your computer except to call
            Anthropic, and usage is billed to your Anthropic account (a tailoring is typically a few
            model calls). Switch any time with <code>resumeforge provider claude</code> or{' '}
            <code>resumeforge provider codex</code>, optionally with <code>--model</code>.
          </p>
          <p>
            The plain login command opens Codex’s supported local sign-in flow with your own ChatGPT
            account. Codex access depends on your plan and workspace policy. See{' '}
            <a href="https://learn.chatgpt.com/docs/auth" target="_blank" rel="noreferrer">
              official OpenAI authentication guidance
            </a>
            .
          </p>
          <p>
            Doctor checks authentication, Tectonic, and the OS credential vault. Warmup downloads
            the fixed template’s required packages once. Normal tasks disable compiler package
            downloads.
          </p>
        </section>
        <section className="panel">
          <h2>4. Pair with your ResumeForge account</h2>
          <pre>
            <code>resumeforge pair</code>
          </pre>
          <ol>
            <li>
              Sign in at <Link href="/">resume-forge.midoon.dev</Link> and open Agent &amp;
              Settings.
            </li>
            <li>Enter the code displayed by the companion you just started.</li>
            <li>Approve the device and leave the terminal open until it says Paired.</li>
          </ol>
          <p>
            Codes expire after 10 minutes and can be consumed once. Approve only a code from your
            own computer. A device can access tasks for the account that approved it; it cannot
            fetch another account’s tasks.
          </p>
        </section>
        <section className="panel">
          <h2>5. Run while tailoring</h2>
          <pre>
            <code>resumeforge run</code>
          </pre>
          <p>
            Keep this terminal running, approve your profile records, paste a posting, and start
            tailoring. The app displays real task stages and the results. Each companion runs one
            task at a time. If it goes offline, new work stays queued. Your computer makes outbound
            HTTPS connections; it does not expose a public port.
          </p>
          <p>
            Local refers to the companion, Codex client, and PDF compiler. Task content is still
            processed by the AI service, and private account data/results are stored in Supabase.
            Codex credentials stay local. Device credentials are stored in the OS vault.
          </p>
        </section>
        <section className="panel">
          <h2>6. Stop or disconnect</h2>
          <p>
            Ctrl+C stops the companion and cancels current local work. To revoke the device and
            remove its local credential:
          </p>
          <pre>
            <code>resumeforge disconnect</code>
          </pre>
          <p>
            You can also Disconnect a device in Agent &amp; Settings immediately. Then run the
            command locally to remove the retained credential. If the server is unavailable, revoke
            from the website when reachable and remove the ResumeForge entry for this origin in your
            OS credential manager. Pairing a new account must never reuse someone else’s OS/Codex
            sign-in; use a separate OS account for shared computers.
          </p>
        </section>
        <section className="panel">
          <h2>Troubleshooting</h2>
          <details>
            <summary>Codex sign-in or usage limits</summary>
            <p>
              Run <code>resumeforge login</code> and <code>resumeforge doctor</code>. AUTH_REQUIRED
              needs local sign-in; USAGE_LIMIT needs time or available account allowance;
              MODEL_ACCESS requires a permitted model/workspace. No paid fallback is used.
            </p>
          </details>
          <details>
            <summary>Tectonic missing or PDF compilation failed</summary>
            <p>
              Check your executable path and restart the terminal. Run doctor, then warmup. Set
              RESUMEFORGE_TECTONIC_PATH to the executable itself, not a directory. The renderer
              keeps readable font/margin limits; shorten unlocked content if a draft still
              overflows.
            </p>
          </details>
          <details>
            <summary>Pairing expired, limit reached, or already paired</summary>
            <p>
              Start a fresh code after an expired attempt. ALREADY_PAIRED means disconnect the
              existing origin first. At most 3 pairings may be pending from one IP and 5 active
              devices may belong to an account. Device and task limits protect the shared service;
              use only devices you control.
            </p>
          </details>
          <details>
            <summary>The app says offline or tasks stay queued</summary>
            <p>
              Keep <code>resumeforge run</code> open, check doctor, and use the same app origin for
              pairing and running. For local development, pass{' '}
              <code>--url http://localhost:3000</code> to both commands. A revoked device needs a
              fresh pairing.
            </p>
          </details>
          <details>
            <summary>OS credential vault unavailable</summary>
            <p>
              Windows requires Credential Manager, macOS requires Keychain access, and Linux
              requires a running Secret Service with an unlocked keyring. The companion has no
              plaintext credential fallback. Run doctor in the same OS account where you paired.
            </p>
          </details>
          <details>
            <summary>Private preview requires Vercel access</summary>
            <p>
              The public production domain does not require a Vercel account. Development previews
              remain protected. Developers testing against a preview may set
              RESUMEFORGE_VERCEL_BYPASS locally with an authorized bypass credential. Never paste it
              into chat, commit it, or send it to Codex.
            </p>
          </details>
        </section>
        <section className="panel">
          <h2>
            <ShieldCheck size={18} /> Supported providers
          </h2>
          <p>
            Codex is supported through this local companion. Other agents are unavailable.
            ResumeForge does not automate applications or guarantee factual accuracy; review
            generated wording and the PDF before applying.
          </p>
        </section>
      </div>
    </main>
  );
}
