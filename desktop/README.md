# Aurelia — A Personal Agentic Task Management

A task-first Windows workspace for personal agentic workflows and task management. This application preserves the workspace's source snapshots and personal catalogs.

## Product

- **Tasks:** searchable active tasks, deadline views, exact source details, pinning and local focus selection.
- **Aktivitas:** persistent, searchable activity history and actual sync stages.
- **Pengaturan:** theme, timezone, compactness and secure PES connection.
- Dark and light themes, Heroicons SVG, keyboard controls, resizable layout.
- Cached data remains available when PES is unreachable or login has expired.

The initial data is the real October 26, 2026 export and is explicitly labeled imported/stored. Importing it does not claim a successful live sync.

## Launch

Use the **PES** Desktop/Start menu shortcut, or `C:\Workspace\pesautomation\Open PES.cmd`. The Windows portable build is under `release/PES-win32-x64/`; keep its entire folder together and launch `PES.exe`. No administrator installation is required. For persistent task files and agent workflows, read [Agent workspace](docs/AGENT-WORKSPACE.md).

## Sign in and synchronize

Choose **Masuk ke PES** in Settings, or Sync if no session is available. Sign in directly in the separate HTTPS PES window. The app does not read the Hermes Vault, type a password, or ask you to paste one into chat. The dedicated Chromium session is stored in the app's per-user profile; do not share that profile.

After sign-in the portal window hides and connection state updates. Click **Sinkronkan** to fetch current tasks. No recurring synchronization is enabled. Portal automation is read-only and uses only List, filter, Preview, Info and Close controls.

## Agent-only completion implementation

The new completion components and read-only agent MCP adapter are implemented for local verification. The desktop shows an observer only; **live completion remains disabled** because trusted agent enrollment has not been demonstrated. No completion button or mutating renderer API is provided, and Sync remains read-only. See [Agent completion](docs/AGENT-COMPLETION.md) and [completion verification](docs/COMPLETION-VERIFICATION.md) for exact supported surfaces, test evidence and remaining live-enablement gates.

The current Desktop/Start-menu release is not silently replaced by a candidate build. A separately tested assessment candidate, when produced, is listed in the completion handoff.

## Asana personal tasks — milestone 1

A separate catalog-only Asana workspace for **IT PIC = HERNANDA MSS** is implemented in the source and separately packaged under `release/asana-milestone1/PES-win32-x64/`. It has Status-grouped lists/read-only boards, independent Progress/completion fields, search/filter/sort/pagination, cached details, local saved views/pin/focus, scoped exports and provider-specific shortcuts. It does **not** connect to live Asana or add remote updates. Existing release/shortcuts and parked PES completion are unchanged. Read [Asana workflow and limitations](docs/ASANA-WORKFLOW.md) for current verification/review status and deferred milestones.

## Development commands

From this directory:

```bash
npm ci
npm test
npm run typecheck
npm run build
npm start
npm run test:e2e
npm run package
```

Use the installed Node toolchain and a normal per-user environment. The default profile is `%APPDATA%\PES Focus`; `PES_FOCUS_DATA_DIR` is an explicit alternative directory used by the test harness to avoid touching the user's profile.

## Source map

| Path | Responsibility |
|---|---|
| `src/renderer/` | React interface; no Node or credential access |
| `src/shared/types.ts` | Narrow typed desktop API and data contract |
| `src/shared/domain.ts` | Calendar, due-date semantics, validation and snapshot comparison |
| `src/main/store.ts` | Atomic local state persistence |
| `src/main/agent-workspace.ts` | Persistent per-task context, immutable source generations, protected agent work folders |
| `src/main/portal-data.ts` | Strict grid schema/history/URL/CSV boundary |
| `src/main/portal.ts` | Independent sandboxed PES BrowserWindow and read-only automation |
| `src/main/sync.ts` | Single-flight sync, cancellation and publication boundary |
| `src/main/main.ts` | Composition root, guarded IPC, exports and desktop lifecycle |
| `src/main/preload.ts` | Explicit API bridge only |
| `tests/` | Unit and actual Electron integration tests |
| `assets/seed.json` | Unmodified historical source report |
| `verification/` | Test/build/screenshots and final execution evidence |

See [Architecture](docs/ARCHITECTURE.md) and [Verification and limitations](docs/VERIFICATION.md). Build/test/live-sync status is recorded there rather than inferred from the source existing.
