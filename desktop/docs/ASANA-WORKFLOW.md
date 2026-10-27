# Asana personal tasks — milestone 1

## Scope and status

**LOCAL_VERIFIED — independent catalog-only review passed.** All 90 pinned source files and the packaged bundle hash were independently checked/read back. Final suite: **406 passed, 0 failed, 1 optional probe skipped across 24 files**; typecheck/build and packaged Asana/PES/completion-observer harnesses passed. This is not live access, deployment or promotion approval. This milestone adds a read-only local-catalog Asana workspace to the existing PES app. It is not live Asana synchronization and does not implement the full later-phase plan.

Owner is fixed to **IT PIC = HERNANDA MSS**, field `1208878911420813`, enum option `1214725811552235`, project `1208922858503175`. A shared account's native assignee or BE title prefix does not grant inclusion. FE and BE owned tasks are retained. Status, Task Progress, native completed and memberships/sections remain separate.

## Launch and use

Candidate executable: `C:/Workspace/pesautomation/desktop/release/asana-milestone1/PES-win32-x64/PES.exe`. Keep its entire folder together. The installed release, its shortcuts and the parked PES assessment candidate are unchanged. Candidate is not promoted by these instructions.

1. Open the separate candidate and choose **ASANA · HERNANDA MSS → All tasks**.
2. Click **Reload local catalog**. On this workstation it reads `C:/Workspace/asana-pes-sync/data/taskbridge.db` using SQLite read-only/query-only mode. It does not run taskbridge, modify that catalog or query the remote API.
3. Filter by Status, completion, progress, role, due category or section; search by task text/GID and sort. The grouped table and non-draggable board use the same query and pagination.
4. Open a task to see cached description/goal/dates/custom fields/memberships, parent stub and source last-seen time. Comments and attachments are explicitly unavailable in this milestone—not reported as zero.
5. Pin/focus locally, save a view, copy context, open a fixed task link in Asana, or export matching owned tasks as CSV/JSON. These actions do not change Asana or PES task status.

Ctrl+K searches the active Asana view. Ctrl+R reloads only the Asana catalog when that page is active. The original PES task behavior is retained on its own page. No credentials are required for cache browsing; no credential config is read.

## Freshness and counts

The actual packaged Electron runtime read the existing catalog successfully on October 26, 2026: **180 owned records, 168 completed, 12 incomplete, 3 untitled placeholders**. Its latest successful source run was `2026-10-21T06:09:22.073Z`. These are cached facts, not current live Asana counts. Per-task lastSeenAt can be older than that run.

Sidebar counts cover the whole loaded catalog, explicitly labeled. Page matching counts apply all active filters. Showing is the visible current page excluding collapsed groups. This milestone does not yet implement search-conditioned sidebar facet counts from the full plan. Local saved views persist search/status/completion/progress/role/sort, not due/section/layout settings. Compact presentation is session-local. Completed historical records are not counted as current overdue work.

## State and security

Asana state/preferences are isolated in `asana-state.json` under the existing userData directory. PES workspace.json and task work folders remain separate. All renderer IPC is finite and sender/main-frame guarded. Open/copy/export validate an owned cached identity. Link opening constructs a fixed Asana URL rather than trusting arbitrary cached URLs. JSON exports preserve raw source values; CSV neutralizes formula-shaped cells.

The SQLite reader uses fixed parameterized queries, a consistent read transaction and strict raw field/option IDs. It refuses unsupported schema, malformed JSON and duplicate/ambiguous owned identities. Path/size/schema validators and atomic temp/fsync/rename protect local persistence within the documented single-process boundary; hostile same-user path swapping and Windows power-loss directory durability are not guaranteed.

Reload is single-flight. Cancellation discards pending publication; the bounded synchronous SQLite query itself is not interruptible mid-query. Failed reads/persistence retain last-good in-memory data. There is no network task refresh, automatic watch, remote edit, complete checkbox, upload, comment or bulk mutation API.

## Verification evidence

- `verification/asana-m1-baseline-tests.json`: pre-change baseline.
- `verification/asana-m1-final-tests.json`: latest full suite; inspect actual counters rather than assuming a fixed total.
- `verification/asana-m1-desktop-e2e.json`: actual packaged UI against an artificial catalog, 125 owned/one excluded foreign fixture record, zero network; filters, pagination, board/detail, saved view, clipboard, export, Ctrl shortcuts, narrow/light layout and restart persistence.
- `verification/asana-m1-real-cache.json`: actual packaged Node24.22 SQLite runtime reads real local catalog; before/after SHA256 unchanged; not a live portal test.
- `verification/asana-m1-package.json`: bundle inspection, version `0.2.0-asana-m1.1`, no test/profile/catalog secrets bundled; required compiled files match build.
- Existing packaged PES desktop and completion-observer harnesses passed on this new candidate. Parked completion source files are unchanged.
- `verification/asana-m1-source-manifest.json`: source identity for independent review; no Git repository is assumed.
- `verification/asana-m1-core-review.json`: passed core/catalog-only review. Initial final review `verification/asana-m1-final-review.json` found two UI semantics defects and remains preserved as failed evidence. `verification/asana-m1-fixes-final-review.json` passed the independent re-review of the corrected source: all 90 source files unchanged before/after, 14 focused tests, both typechecks and 42 independent boundary assertions passed.
- `verification/asana-m1-reviewed-fixes-source-manifest.json`: latest frozen source, superseding the original and Cancel-fix snapshots. Actual source-set SHA256 is `f74011c8912b15d3db989a72fdb4c15e2c56f3b75f3cc1b3db2755158747ea9f` (90 files), not the raw manifest file hash.

## Lessons and corrected blockers

The interrupted UI lacked asana.css; TypeScript alone did not catch the missing production CSS import. Production build is an independent gate. Core preference validation initially rejected the completed/modified values emitted by the UI; a failing regression preceded the correction and actual saved-view desktop interaction now passes.

The opt-in real-cache test previously deep-compared 82 MB buffers, leaving slow orphaned test processes after terminal timeouts. It now compares SHA256 before/after. Only the identified owned catalog-test processes were terminated, not unrelated user apps. Actual packaged cache read completed and confirmed unchanged bytes.

The Playwright Electron-main evaluation context does not expose a bare require in this harness; synthetic SQLite fixture creation was moved to the Node test runner. Fixture setup failure was not treated as product success.

Cancel reload originally reused the busy-guarded helper used by Reload; a held-reload actual Electron regression proved Cancel was suppressed. Cancel now bypasses that guard and catches its own errors. The regression passes in the packaged app.

Independent review found that timestamp deadlines were reduced to civil days for Overdue, hiding elapsed same-day timestamps. The predicate now compares valid dueAt instants with the captured current time, while dueOn-only dates remain civil until the next day and completed tasks remain excluded. Fake-clock regressions exercise UTC, Jakarta and Los Angeles; the prior date test now controls time rather than depending on the workstation clock. Another review finding exposed whitespace-only raw titles as blank opening buttons; display-only fallback uses Untitled task without mutating the raw name. Both fixes reproduced RED and passed GREEN before rebuilding.

## Deferred milestone

Still required for the full plan: approved secure live connection; fixed GET-only API reader with complete pagination/subtask coverage; current field metadata; comments/attachments/activity/reference loading; richer related context policy; provider-specific activity; additional advanced facets/layout persistence; live read-only acceptance and new review. Remote Asana update/evidence workflow remains outside this listing project unless separately requested.

PES completion remains unfinished and parked. Its source modules/journal/release candidate/lock were not resumed, repaired, promoted or enabled by this milestone.
