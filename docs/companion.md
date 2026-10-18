# Companion pairing and operation

Install Node.js 22.14+, run `npm ci`, install the official Codex CLI, and run `codex login`.
Only ChatGPT sign-in is accepted. API key variables and unrelated credentials are excluded
from children. Codex credential files are never extracted or uploaded. Access and usage
depend on the user's plan, workspace policy, and local model. No paid API fallback occurs.

Install [Tectonic](https://tectonic-typesetting.github.io/) from an official release, add it
to PATH (or set `RESUMEFORGE_TECTONIC_PATH`), then run:

```powershell
npm run companion -- doctor
npm run companion -- warmup
```

Warmup explicitly permits initial downloads of the fixed template's packages/fonts. Normal
compilation uses `--untrusted --only-cached --keep-logs` and `TECTONIC_UNTRUSTED_MODE=1`.
Shell escape and package downloads are unavailable during tasks. If the cache is incomplete,
rerun warmup. The server cannot select packages, binaries, or local paths.

## Pair and run

```powershell
npm run companion -- pair --url https://YOUR_APP.vercel.app
```

Use the app origin only. HTTPS is mandatory except loopback HTTP. URL credentials, paths,
query strings, and redirects are rejected. The companion generates a random token and stores
it in Windows Credential Manager, macOS Keychain, or Linux Secret Service via `@napi-rs/keyring`.
It fails closed without a vault; there is no plaintext fallback. Only the SHA-256 token hash
goes to the server. The independent pairing code has 12 random characters and expires after
10 minutes. Approve it in the authenticated app, only on a computer you control. Approval and
single-use credential consumption are atomic. Keep pairing open until success. If the final
network response is lost, revoke the pending device and pair again.

```powershell
$env:RESUMEFORGE_URL='https://YOUR_APP.vercel.app'
npm run companion -- run
```

Credentials are scoped per origin, so use the same URL for pairing, running, and disconnecting.
All requests are outbound; no inbound listener is exposed. Each task runs in a fresh directory
under `~/.resumeforge/tasks`, removed on success/failure. A crash can leave stale private files;
delete them locally only when no task is active. Codex itself may retain local session files
even with history persistence disabled; protect its local home directory.

Stages reflect real execution transitions, not private model reasoning. The structured response
arrives before selection/writing validation stages are reported. Heartbeats renew every 20
seconds while busy; idle polling is every 5 seconds. The UI marks heartbeats older than 65
seconds offline. Offline tasks remain queued. Ctrl+C cancels locally; browser Cancel is observed
on the next heartbeat. Connection loss aborts local work and lease checks reject stale completion.

## Disconnect and failures

Disconnect in the web app revokes authorization immediately. To revoke and remove the OS-vault
credential, run `npm run companion -- disconnect`. If already revoked remotely, that command
cannot authenticate; remove the ResumeForge entry for the origin in your OS credential manager
or pair again to replace it. A retained local token remains unusable after revocation.

| Code             | Action                                                      |
| ---------------- | ----------------------------------------------------------- |
| AUTH_REQUIRED    | Run `codex login`; check `doctor`.                          |
| USAGE_LIMIT      | Wait for account limits; no paid fallback is used.          |
| MODEL_ACCESS     | Check local model availability and workspace policy.        |
| INVALID_OUTPUT   | One repair failed; inspect any retained schema-valid draft. |
| COMPILER_MISSING | Install Tectonic or set its local executable path.          |
| COMPILE_FAILED   | Run warmup and check fixed-template dependencies.           |
| TIMEOUT          | Reduce content and retry.                                   |
| LEASE_EXHAUSTED  | Three leases expired; reconnect and start a new task.       |

Malformed raw model text is not uploaded as approved output. A schema-valid result failing
evidence checks may be retained privately on the failed task for review.
