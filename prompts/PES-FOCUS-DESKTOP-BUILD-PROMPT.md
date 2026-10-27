# Build Prompt — PES Focus Desktop

You are my senior product designer, desktop application architect, and implementation engineer. Build **PES Focus**: a modern personal desktop workspace for my actual PES tasks.

Do not treat this as a basic CRUD screen with attractive colors. Design a cohesive product that makes my workload understandable, brings the right task into focus, and makes synchronization trustworthy. I want the restraint and polish of a contemporary desktop workspace, not a legacy Windows administration tool.

**Product promise: “Know what matters. See what is due. Trust what is synced.”**

## 1. Understand the user and the existing project

My name is Hernanda. I work with technical tasks in PES and want a clear view of what needs attention without repeatedly navigating the original portal.

Project workspace:

`C:\Workspace\pesautomation`

Before proposing architecture or writing application code, read:

- `README.md`
- `docs/01-SESSION-RECORD.md`
- `docs/02-REQUIREMENTS.md`
- `docs/03-ARCHITECTURE-E2E.md`
- `docs/04-OPERATIONS.md`
- `docs/05-DATA-AND-RESULTS.md`
- `docs/LESSONS_LEARNED.md`
- `docs/07-SECURITY.md`
- `docs/08-VERIFICATION-AND-LIMITATIONS.md`
- `pes_automation.py`, `test_pes_automation.py`, and the existing fixtures and reports.

Preserve `source/`, original evidence, and historical reports. Develop the new application in a separate, clearly named subdirectory. Do not overwrite the working automation to scaffold the app.

Important distinction: the existing Python extractor is a tested Hermes-browser-helper script, **not a standalone desktop backend**. Its live behavior depends on injected helpers and an externally authenticated browser. Reuse its proven extraction knowledge and fixtures, but do not assume those helpers or Hermes Vault are available inside an independent executable. Resolve that boundary explicitly.

Historical results from October 26, 2026 were 32 scanned tasks, eight Approval tasks, zero Open tasks, and eight matching detail histories. These are fixtures, not current task counts or hardcoded application data.

## 2. Product direction: calm focus, not another dashboard

Use Hermes Desktop as inspiration for visual restraint, clear surfaces, navigation, and typography—not as a demand to copy its source code, branding, or exact layout. If the live reference or screenshots are unavailable, state that rather than claiming pixel fidelity.

The application should feel:

- elegant, quiet, deliberate, and contemporary;
- information-rich without looking crowded;
- responsive and desktop-native in behavior;
- trustworthy about freshness, failures, and deadlines;
- personal and focused rather than enterprise-heavy.

Avoid giant KPI tiles, decorative charts, rainbow status pills, excessive gradients, unnecessary glass effects, oversized empty space, default-looking data grids, and controls that do nothing.

Choose a coherent token-based design system: warm near-black or restrained charcoal surfaces, subtle elevation, fine borders, disciplined spacing, readable typography, and one tasteful accent. Provide dark and light themes with equal attention. Use Heroicons consistently, never emoji as interface icons. Use short Indonesian interface copy by default; preserve original PES statuses and task text exactly.

Motion should communicate change, not advertise itself. Respect reduced-motion settings. A beautiful screenshot is not enough: hover, focus, loading, keyboard, empty, error, offline, and narrow-window states must all feel designed.

## 3. Application structure

Use three primary navigation destinations:

1. **Tugas** — the main workspace.
2. **Aktivitas** — persistent activity and sync history.
3. **Pengaturan** — connection, date scope, appearance, and optional notifications.

Keep a visible **Sinkronkan** action, connection state, and last successful sync time accessible from the main workspace. Distinguish last successful sync from last attempted sync.

### Main task workspace

Use a compact navigation area, a task-focused center, and a contextual detail pane. Keep the main task list dominant. On smaller windows, the detail pane may become a drawer or full-width detail view without horizontal overflow.

The first screen should answer:

- What is overdue?
- What is due today or soon?
- What should I focus on next?
- Is this data current?

Use a quiet summary strip for active, overdue, and upcoming counts—not a wall of analytics cards. Derive counts from the same filtered snapshot used by the list and explain the scope.

Offer clear views such as **Semua Aktif**, **Terlambat**, **Hari Ini**, **Mendatang**, and **Fokus Saya**. Explain whether each count follows the current search/filter. Handle tasks without valid deadlines separately rather than quietly hiding them.

Each task row should expose the title, a compact task identifier, exact status, due date, readable time remaining, and optionally a small project or FE/BE tag. Secondary metadata should not compete with the task name. Allow titles to wrap when useful; never make a tooltip the only way to read an important description.

Default ordering should prioritize overdue tasks, then today, then the nearest upcoming deadline. Offer explicit sort controls and stable ordering. Task numbers are identities, not display titles.

Include search across task number, description, goal, and relevant metadata. Provide status, deadline, and optional local tag filters with an obvious reset action.

### Detail pane

Show the complete original task name and goal, exact task number, list status, input date, due date, approval date, target, weight, department, PIC, completion date, attachment labels when present, and full target history.

Present history as a readable timeline or structured section. Keep list status **Approval** and history status **Verifikasi** distinct. Do not imply weight equals hours, or that a populated goal means the task is finished.

Provide useful real actions: copy task number, copy details, export selected data, and open the supported PES task page in the normal browser. Do not invent a task-specific deep link if none is verified.

## 4. A small personal focus layer

Add local-only task starring/pinning and a “focus next” selection. A restrained single-task focus view should show the selected task, goal, deadline, and useful context without dashboard clutter.

Store these preferences separately from source PES data. Label them as personal organization; they must not change the remote status. Persist them across successful syncs using stable task identities.

Do not mark a task solved in PES, fabricate completion percentages, or invent AI-generated priority scores. The product can offer a sensible ordering without pretending to know my actual work progress.

If the selected task leaves the active snapshot, retain the local preference record and explain that the task is no longer present in the current scope rather than silently selecting an unrelated task.

## 5. Deadlines and countdowns that are accurate and humane

The list should use understandable labels such as **Jatuh tempo hari ini**, **2 hari lagi**, and **Terlambat 3 hari**. The selected task can show a more precise hours/minutes countdown when justified.

Critical constraint: PES currently provides **date-only deadlines**. Do not invent a server-defined deadline time.

Represent the source deadline as a date. For countdown calculations, use an explicit, configurable local convention: the task is due through the end of that date in the configured timezone; the next local midnight is the exclusive boundary. Default to Asia/Jakarta as a disclosed application preference, not a proven PES server policy.

Label that convention in the detail view and settings. If a precise hours/minutes display uses this assumption, make it clear. Do not present seconds-level precision as a fact supplied by PES. A task due today is not overdue until the configured next-day boundary.

Recalculate after app resume, midnight, clock/timezone changes, and deadline changes. Use the current clock, not a counter that drifts when the device sleeps. Update only as frequently as the visible precision requires.

Missing or malformed dates should show **Tanggal belum tersedia** or a meaningful warning—not a fake countdown. Urgency must use text and shape as well as color. Avoid constant red flashes, aggressive ticking, and anxiety-inducing decoration.

## 6. Real synchronization with PES

The default workflow is manual sync. Never silently install background polling or a scheduled job. Optional startup/periodic sync must be explicitly enabled, show its cadence, and avoid overlapping runs.

Existing source workflow:

- Login: `https://pes.grcboard.com/Default.aspx`
- Task page: `https://pes.grcboard.com/Modul/ISO/FormInputTask.aspx`
- Account identifier: `muhammad hernanda`
- List: `MainContent_btnList1`
- Department: `MainContent_ddlDept1`, value `32`, IT Mitra Seribu Saudara
- PIC: `MainContent_ddlPic1`, value `3220`, MUHAMMAD HERNANDA
- Start: `MainContent_txtFrom`, first day of previous month
- End: `MainContent_txtTo`, last day of next month
- Clear origin/status filters, then Preview: `MainContent_btnPreview`
- Capture every task row; select exact list statuses Approval and Open
- Read each selected task's Info panel and verify its task identity.

Calculate the date range from the current date each run. Show the active range in the app. Preserve original source strings and identifiers. Do not add a client-side creation-date filter: the site's returned scope can contain tasks entered earlier.

The site uses asynchronous ASP.NET postbacks. Department selection must finish before PIC selection. Ordinary document-load events are insufficient. The grid must use each row's own cells, not all descendant table cells. Task Info uses `MainContent_PanelModalTarget`, not necessarily a generic `.modal`.

Design the sync experience as an honest state machine: idle, connecting/authenticating, applying filters, reading the grid, fetching details, validating, saving, success, cancelled, and failed. Show actual counts or stages instead of a made-up percentage. Disable duplicate sync or coalesce repeated clicks into the current run.

Use a staging snapshot, verify completeness, and atomically publish only a successful result. Keep the last good snapshot visible on failure, cancellation, offline startup, or session expiry. Explain staleness without blocking access to cached tasks.

Compare successful snapshots by task identity. Show real added/changed/no-longer-in-scope counts, including meaningful field changes. Disappearance from the active list does **not** prove a task is solved or deleted. Scope changes must not create misleading removal notifications.

Handle valid empty results separately from login failures, parser failures, unfinished postbacks, and incomplete pagination. Implement verified all-page extraction or fail explicitly; never treat the existing pagination limitation as production-ready coverage. Cancel cooperatively and never terminate an unrelated user browser.

## 7. Activity tab: transparency without a wall of debug text

Persist a structured event history grouped by sync run. Make it readable to a person and useful for troubleshooting.

Events should include a local timestamp, severity, category, run ID where applicable, duration when meaningful, stage, and concise message. Examples are illustrative—not preloaded fake history:

- synchronization requested;
- connection established or login required;
- date scope applied;
- grid rows read;
- task-detail progress;
- validation completed;
- snapshot saved and real changes summarized;
- export completed;
- local focus preference changed;
- warning, retry, cancellation, or failure.

Offer search, severity/category filters, expandable technical detail, and sanitized log export. Keep current progress visible even when the activity tab is not open, and let me jump to the current run.

Never log passwords, cookies, tokens, authentication form bodies, or raw secret-bearing browser state. Do not dump all task descriptions into routine logs. Bound retention and file size. Mark imported historical artifacts as imported; do not fabricate old activity events from fixtures. Clearing activity history must not delete my tasks or preferences.

## 8. Offline operation, authentication, and packaging

Persist task snapshots, sync metadata, activity events, and personal preferences locally using a suitable transactional storage design. Separate source records from UI preferences. Cached data must remain usable without a connection, with clear last-synced and offline labels.

Design a real secure authentication strategy for an independent desktop app. Never hardcode the password, read it from chat history, or silently access Hermes's private credential store. If using an existing Hermes integration, prove that the supported interface exists; otherwise provide an explicitly authorized secure sign-in/OS-backed credential flow. Keep browser session material out of ordinary app logs and exports.

Target Windows first and the user's nonadministrator environment. Inspect available tooling before choosing a framework. Choose and justify a modern desktop stack based on packaging, secure automation integration, maintainability, responsiveness, and per-user installation—not fashion. Keep browser work off the UI thread.

A browser-opened web page alone is not the requested finished desktop application. Provide a launchable desktop build and honest installation/runtime prerequisites. Disclose bundled-browser size or first-run downloads if required. Prefer a self-contained or clearly managed per-user setup; do not require administrator rights by surprise.

Use safe internal IPC, validate data crossing boundaries, escape source content, and avoid executing arbitrary portal content. No telemetry or external AI service is needed for the core product.

## 9. Quality bar and delivery process

Work autonomously on ordinary design decisions. Ask only when credentials, authorization, destructive actions, or a genuine architecture constraint requires my decision. Do not make me specify every color or interaction.

Start with a concise product concept, screen map, design tokens, key interaction states, and architecture rationale grounded in the existing project. Then implement a coherent vertical slice: launch → secure connection → real sync → stored snapshot → task list/details/countdown → activity log. Follow with the remaining polish and hardening.

Fixture-based development is welcome, but it must be visibly marked **Data contoh** or **Data tersimpan**, with its provenance. Never claim a live integration works because sample cards render.

Test at least:

- calendar ranges, leap years, date-only deadlines, timezone boundaries, and app resume;
- valid empty responses versus failures, schema drift, duplicate rows, pagination, partial detail reads, and wrong task identities;
- sync cancellation, overlapping requests, atomic publication, cache retention, and scope-aware diffs;
- persistence across restart and separation of local preferences from PES status;
- log redaction, filtering, retention, and export;
- loading, empty, offline, expired-login, and failed-sync UI states;
- keyboard navigation, visible focus, contrast, reduced motion, display scaling, and resized windows;
- a real end-to-end PES sync when secure credentials are available;
- the actual packaged application launching in the intended Windows environment.

Use practical desktop shortcuts such as Ctrl+K for search/commands and Ctrl+R for sync where appropriate; Escape should dismiss transient UI predictably. Do not let a webview's default browser-refresh shortcut bypass the app's sync flow.

No dead buttons, fake progress, fabricated data, hidden integration blockers, or completion claims based solely on screenshots. If live authentication is blocked, deliver the verified local functionality, identify the exact blocker, and label the live-sync acceptance criterion incomplete.

Document architecture, setup, authentication, storage, synchronization, deadline semantics, troubleshooting, testing evidence, and remaining limitations in this workspace. Preserve original snapshots. Do not initialize a remote, publish internal task data, deploy, or upload artifacts without explicit scope.

## 10. Definition of done

I can launch a genuine desktop application, immediately understand my workload, inspect full task details, choose a focus task, read honest deadline information, and synchronize actual PES tasks through a real secure connection. I can inspect what happened in the activity tab, restart without losing useful data, and continue using the last good snapshot if synchronization fails.

The application looks intentional in both themes and across its major states. Its essential interactions work, its data provenance is clear, its sensitive information is protected, and its test/build/run claims are backed by actual execution.

The feeling I want is:

**“This is not another system I need to manage. This is where I go to see clearly and start working.”**
