# Personal Asana task-list UI Implementation Plan

> **For Hermes:** Use the subagent-driven-development skill, if available, to implement this plan task-by-task only after implementation is authorized. Otherwise use explicit bounded implementation tasks with separate specification and code-quality review. This document does not authorize execution.

**Goal:** Add a distinct Asana side-menu group to the existing desktop application, providing a complete, usable task-list and detail experience for **HERNANDA MSS only**, primarily grouped by the actual Asana **Status** custom field.

**Architecture:** Keep Asana models, read adapters, state/cache, preferences, IPC and synchronization separate from PES. Reuse the application's visual language and guarded Electron boundary, plus the existing Asana catalog where useful, without importing its write tools or report-derived status semantics. Provide honest cache-only browsing and a separately implemented read-only live refresh path; listing, navigation or refresh must never mutate either remote system.

**Tech Stack:** Existing Electron + React + TypeScript + Vite/Vitest; narrow main-process read services and preload contracts; optional read-only SQLite catalog adapter; a proposed fixed-route TypeScript Asana REST reader for standalone live reads, subject to credential and packaging verification.

**Mode:** PLAN ONLY. The only intended authored artifact in this turn is this Markdown plan. No source implementation, install, remote synchronization, credential changes, Asana updates, PES changes, deployment, scheduling, commit or push is authorized.

**Workspace:** `C:/Workspace/pesautomation`; application root `C:/Workspace/pesautomation/desktop`. Paths below are relative to the application root unless explicitly absolute.

**Date:** October 26, 2026, Asia/Jakarta. Research uses available default-profile Hermes history, including restored OMP records, local source and the existing catalog. It does not establish current live Asana state.

---

## 1. Scope decision and non-negotiable boundaries

### Active feature scope for a later approved implementation

- Separate **Asana → HERNANDA MSS** navigation within the existing app, not a new Hermes sidebar plugin and not a rebranding project.
- Complete owned-task listing, Status groups, search, filters, sorting, pagination, reconciled counts, list/board presentation, detailed read context, source freshness and errors.
- Completed and incomplete records, untitled records, unknown status values and directly owned subtasks are retained.
- Read existing descriptions, comments, attachments and source references with independent availability/loading states.
- Local-only pinning, focus, saved views, column preferences, selection, copying and scoped export.
- Manual Asana refresh, cancellation and provider-specific connection diagnostics; last-good offline data remains usable.

### Deferred — DO NOT IMPLEMENT IN THIS PHASE

- Asana status/progress/date editing, native completion checkbox changes, drag-to-transition, bulk updates, comments, uploads, task creation/deletion, assignment changes or section movement.
- Automated development-to-QA transitions, evidence generation, work-verification agent, PR writeback or cross-system synchronization.
- PES completion, reconciliation of its old discrepancies, agent enrollment, journal fixes, lock cleanup, candidate promotion or installed-release replacement.
- Schedulers, background monitoring, webhook service, multi-user/team dashboards, role/owner switching and cloud persistence.

**Interpretation:** Earlier listing and updating sessions inform the data and safety model. “Full functionality” here means a fully working read/list UI, not silent inclusion of the earlier write workflow. A future update phase requires separate approval and its own plan. No dummy update buttons or dormant write capability are needed.

**PES freeze:** Leave all unfinished PES completion code, evidence, profiles, operations and `.implementation.lock` as found. Later shared-shell changes may touch `main.ts`, `preload.ts` and `App.tsx` only to add isolated Asana composition; they must not enable, refactor or repair PES completion. Do not assume the old assessment-only source approval approves a new combined build.

## 2. What was learned from earlier sessions

### Research coverage and limitations

The full-table default-profile search for user content containing `asana` or `hernanda-tasks` returned **109 messages across 72 sessions** when rechecked during planning. This inventory includes this planning session, incidental mentions and research messages; it is not a claim of 72 distinct Asana workflows. The history researcher also triaged restored-OMP matches across all roles to recover tool-only context. Relevant requirement passages and evidence were read/deduplicated; every byte of every large transcript and external harness archive was not exhaustively read. No other Hermes profile was modified or treated as the active one.

The historical `hernanda-tasks` and `asana-mcp-connector` skills are not currently available through skill lookup. Their recorded behavior was recovered from history. The now-available `asana-personal-workflow` skill was loaded and agrees with the ownership/status/read-only contract below. Historical permissions and old assistant success claims are not fresh authorization or remote verification.

### Workflow evidence that drives this plan

| Source session / message | Recovered requirement or lesson |
|---|---|
| `20260529_132430_7f4b67`, user `1861` | HERNANDA MSS is the **IT PIC**, not necessarily the integration account's native assignee |
| `20260602_134049_47a04aa2`, users `3557`, `3563` | Personal `/hernanda-tasks` listing from MSS Sprint Planning; not ordinary shared-account My Tasks |
| `20260603_165142_705f9bef`, users `6424`, `6448` | Task Progress, Status and complete/incomplete listing are separate concerns |
| `20260603_170528_4ee48f0d`, user `6456` | User explicitly worried about unrelated developers being updated; ownership must be enforced in the data boundary |
| `20260610_084040_04348e2a`, messages `17751`–`17782` | Earlier wrong-account/incomplete listings were corrected; first-page/search output cannot establish completeness |
| `20260604_215826_e5d7eed8`, users `7734`, `7748`; `20260611_101915_0485ea8e`, user `20647` | Parent descriptions, media and role siblings provide useful read context |
| `20260612_104618_4f3894e1`, users `24894`, `24913`, `24944`, `24954` | Notion/source references may occur in related descriptions or activity rather than one dedicated field |
| `20260612_163043_d6a04b84`, user `27153` | Later updates require verification, comments and proof attachments, not status-only claims |
| `20260612_143755_85a1ec62`, user `26285` | If office connectivity is unavailable, skip office-only evidence steps; no VPN workaround churn. Message date, not session-title date, governs chronology |
| `restored-omp-c4eec7650fa45781a63e263a12c98852`, tools `374249`, `374253`, `374255` | October 21 refresh/listing included BE and FE tasks plus untitled owned records |
| `restored-omp-cbc38a9431865da0ae4723c4db69f227`, assistants `373810`, `373889` | Ready to QA has historically coexisted with either In Progress or Done progress. Neither is a universal transition rule |
| `restored-omp-44d6b88997e7522d8d7a59abf2bf2dcc`, user `381782`, confirmation `381898`, tools `381908`, `381910` | Preview/confirmation before an update; task-specific evidence; exact readback; one-comment/attachment request must be respected |

**Design consequence:** Learn from historical operations without reproducing their assumptions. A UI must expose workflow differences, not “repair” them automatically. Parent/QA/SA association is context, never ownership or permission to mutate.

## 3. Current inspected application and data

### Application baseline

- `src/renderer/App.tsx:8` has only `tasks`, `activity`, `settings` pages. The sidebar and header currently assume PES, and Ctrl+R/Ctrl+K route to PES task behavior.
- `src/shared/types.ts` defines a PES-specific `Task`/`Snapshot`; Asana must not be coerced into `TaskNo`, `Lampiran`, or PES `history`.
- `src/main/preload.ts` exposes `window.pes` with explicit methods. No generic invoke channel should be added.
- `src/main/main.ts:37–41` validates sender/main frame; reuse that guard pattern for separate `asana:*` operations.
- Existing `store.ts` reconstructs/validates PES state. Prefer a separate Asana store instead of assuming additional optional properties persist automatically.
- Preserve `%APPDATA%/PES Focus`, existing dedicated portal partition, user task work notes, PES preferences, snapshots and all completion boundaries.

### Existing Asana infrastructure

- Operational/docs/catalog workspace: `C:/Workspace/asana-pes-sync`.
- Read-only ingestion implementation: `C:/Users/it26/source/repos/taskbridge/src/taskbridge/connectors/asana.py`.
- Store implementation: `C:/Users/it26/source/repos/taskbridge/src/taskbridge/store.py`.
- Catalog: `C:/Workspace/asana-pes-sync/data/taskbridge.db`, inspected using SQLite `mode=ro`, schema version 2.
- Read/write historical MCP scripts: `C:/Workspace/asana-pes-sync/mcp/asana_mcp.py` and `asana_ops.py`.

Do **not** instantiate the Python Store to browse: its constructor opens writable storage and runs setup/migration. Do **not** invoke `asana_ops.py plan`, `apply`, or `selftest`: even plan authors files, and other paths update/create/complete/delete tasks. Its default start-date/end-date behavior is irrelevant to a read UI. The historical Python MCP wrapper can call arbitrary tools and launch `npx -y`; it is not a standalone packaged read-only boundary.

### Rechecked cached facts — not live Asana

Exact raw IT PIC field/option matching returned:

| Metric | Cached value |
|---|---:|
| Owned records | 180 |
| Native completed / incomplete | 168 / 12 |
| Parent references | 172 |
| Multiple memberships | 3 |
| Untitled/name-equals-GID placeholders | 3 |

Cached combinations:

| Status | Task Progress | Native completed | Count |
|---|---|---|---:|
| In-Progress | In Progress | false | 9 |
| Ready to QA | `Done ` (trailing space retained) | true | 157 |
| User/PO Testing | `Done ` | true | 11 |
| Unset | Unset | false | 3 |

Latest recorded Asana incremental run: started `2026-10-21T06:09:08.448Z`, finished `2026-10-21T06:09:22.073Z`, status `ok`. Completed rows and incomplete rows have different last-seen times; the latest run timestamp is **not** every task's observation timestamp. These counts are planning fixtures only, never seeded as current facts.

The cache has no attachment table or attachment data in these owned raw task payloads; no comments were available for the scoped records. Its local changes are ingestion observations, not a complete upstream activity history. No comments available does not mean Asana has zero comments. All referenced parents resolve in the wider cache but are outside the personal ownership set.

## 4. Personal-scope contract

Historical identifiers, to validate against current metadata before live use:

| Concept | Exact GID |
|---|---|
| Workspace | `1206737432461724` |
| Project of record — MSS Sprint Planning | `1208922858503175` |
| IT PIC custom field | `1208878911420813` |
| HERNANDA MSS enum option | `1214725811552235` |
| Status custom field | `1208415672865789` |
| Task Progress custom field | `1208878509891762` |
| IT Start Date | `1208878900985995` |
| IT End Date | `1208878923161869` |
| Goal Task | `1210770007256855` |

Store GIDs as strings. The owning predicate requires exact IT PIC field/option IDs plus membership in the declared project scope. Do not use native assignee, account identity, title prefix, role, fuzzy name, parent owner or substring matching. Both FE and BE owned records qualify. An unknown role qualifies if ownership is established.

For this catalog, raw_json retains field/option identifiers and memberships; normalized name→display-value custom_fields_json is insufficient as the durable authority. A legacy name-only import can be shown in a separate unresolved-import diagnostic, never quietly included as verified personal work. Current metadata mismatch blocks live publication until resolved; a missing owner field is not mine.

Enforce the same rule for list, counts, detail, comments, attachments, copy/export and local workspace context. The renderer cannot request another owner, arbitrary workspace, SQL, file path or API URL. Re-check identity on live detail loading; a known reassignment removes the task from the next published personal set and invalidates its personal detail cache without deleting user notes.

### Related context without expanding “my work”

Default: show parent link/title stub and role relationship, with `Related context—not assigned to you` labeling when verified. Never count parent or siblings as owned tasks. An outside-owner full description/comments/attachments is **not** returned automatically. Offer a deliberate `Load related read-only context` action, restricted to relationships verified from an owned task and clearly labeled; if strict personal-only content is preferred, retain links/stubs only. This policy must be explicit before implementing contextual reads, not inferred from a task GID the renderer supplies.

## 5. Navigation and UI specification

Retain current branding/profile. Add provider-aware shell navigation rather than app-wide renaming:

```text
PES
  Tasks                        existing behavior preserved

ASANA · HERNANDA MSS
  Semua tasks                  default: completed + incomplete; no date cutoff
  Not Started
  Ready to Prioritized
  Ready to Dev
  In-Progress
  Ready to QA
  User/PO Testing
  Rework
  Closed
  On-Hold
  Tanpa Status
  Status lainnya               disabled/unknown options remain discoverable

RUANG KERJA
  Aktivitas                    provider filter
  Pengaturan                   separate PES / Asana connection sections
```

The example Status labels are historical metadata, not a hardcoded exhaustive status schema. Load options by field/option GID, preserve raw names and metadata order, retain empty known groups collapsed, and append unknown options deterministically. `Semua tasks` and `Tanpa Status` are UI views, not source enum values. Distinguish unset/null from unknown option identifiers.

### Task-list page

Header: **Asana Tasks**; pinned owner label **HERNANDA MSS**; project scope; connection/cache mode; last successful list capture; last attempt and error; Refresh Asana / Cancel.

Primary view: grouped table/list by **Status**. Secondary non-draggable board view uses the same query and counts. View switch is local presentation only. Status cards are not editable drop targets.

Columns/default row fields:
- Full readable task title with ellipsis only where needed and accessible complete text; unnamed placeholder `Tanpa judul · <GID>`.
- GID/copy link, role BE/FE/etc., project-of-record section.
- **Status**, **Task Progress**, **Asana completion** as separate badges.
- Due date, IT Start Date, IT End Date; modified time when available.
- Parent association, tags/product/priority/category/severity when present.
- Local pin/focus indicator; detail-open action and safe Open in Asana.

Filters: text/GID search; native completion All/Incomplete/Complete; Status multi-select; Task Progress multi-select; due range/overdue/today/upcoming/no date; project membership; section; role; product; sprint tag if supplied or explicitly labeled inferred from title; priority/severity; local pinned/focus; anomaly-only. Do not invent absent sprint/priority fields.

Search applies to owned titles, GIDs, descriptions if indexed, source reference text and available custom-field display values. Clearly state whether comments are searched: default list search does not claim to search unfetched comments. Use stable GID tiebreakers in sorting. Sort by due date, updated time, title, priority or IT dates; nulls last; metadata defines priority order rather than lexicographic guesswork.

Features: collapsible groups; column show/hide and density; persisted local saved views; reset filters; list keyboard navigation; clear selection; copy selected context; CSV/JSON export of current filtered owned set or one owned task. No source mutation controls. Do not add task creation for an empty result.

### Count contract

- `Owned total`: distinct GIDs in the committed scope, with declared coverage.
- `Matching`: distinct GIDs after current filters.
- `Showing`: current rendered/loaded subset, never mislabeled as matching total.
- Sidebar facets apply search and non-Status filters but exclude the active Status selection, so other buckets remain navigable. Each owned task belongs to exactly one primary Status bucket; summed primary facets reconcile to that facet base.
- Completion/progress/section facets overlap; their counts are not added together.
- Parent/sibling context is excluded from every personal task count and default export.

### Date and anomaly contract

Keep civil dates (`due_on`, custom date values) distinct from timestamps (`due_at`, completed_at, modified_at). Do not shift date-only values through UTC Date parsing. Display business dates in Asia/Jakarta unless the existing timezone preference is changed. For date-time deadlines use exact timestamp comparison; date-only deadlines use a disclosed end-of-local-day convention, not an assumed Asana server policy.

Overdue attention counts apply to native incomplete records with valid due values. A completed record keeps its historical deadline but is not indefinitely shown as current overdue work. Native-completed with in-progress fields, Closed with incomplete flag, unknown enum and untitled records receive non-destructive information/warning labels; none triggers repair.

## 6. Detail UI and reading behavior

Desktop: resizable right detail pane; narrow window: accessible drawer with focus return and Escape close. Selection is keyed by provider+GID, not visible row index.

Sections/tabs:
1. **Overview:** full title, copy GID/link, ownership proof, role, raw Status/Progress/completed, project memberships/sections, all relevant dates, Goal Task, description, custom fields.
2. **Context:** verified parent references, owned subtasks, explicitly allowed related read-only context; no inherited ownership.
3. **Comments & activity:** separate comment stories from system activity. Show author/time/raw source availability, pagination and per-resource last refresh. Distinguish upstream story history from local catalog observations.
4. **Attachments:** filename, type/size where available, host/provenance, created time if available, safe Open in Asana or approved HTTPS link; images only when safely obtained. No automatic download/upload or execution of attachments.
5. **References:** Notion/PR/source links found in approved source fields/descriptions/comments, with origin of each link and safe navigation. Do not claim repository state or verification merely because a link exists.
6. **Source diagnostics:** cached/live origin, list/detail/comments/attachments captured times, coverage and unknown fields, ownership IDs, anomalies.

Each subresource has independent `not_loaded / loading / ready / partial / unavailable / failed` state. Cached zero comments without a successful fetch is shown as unavailable, not empty. A denied comment/attachment request must not crash the task list. Selecting another task cancels or discards old detail responses by request/GID/version; late responses cannot populate a different task's pane.

Use plain text or strictly sanitized rich text, no unsanitized innerHTML. Reject javascript/data/file navigation, arbitrary filesystem reads and credential forwarding to attachment hosts. Do not preload every attachment or every task's complete story history.

## 7. Data-source and connection architecture

### Recommended repository contract

Create one `AsanaRepository` read interface with separate implementations and explicit modes:

- **Catalog reader:** optional read-only adapter for the known taskbridge database; token-free browsing, imported cache provenance. Fixed schema-aware parameterized queries; no migrations, copy, checkpoint or writable Store initialization. Read a consistent transaction and derive typed DTOs from raw_json, preserving all membership objects and raw field IDs/labels.
- **Live reader:** proposed main-process TypeScript client using fixed Asana GET routes and bounded opt_fields. No Python or runtime `npx` dependency for the standalone app. Reuse pagination/retry ideas from taskbridge, not its secret handling or broad catalog publication. This is new work, not already delivered functionality.

The SQLite runtime must be verified in the actual packaged Electron environment: first probe the runtime's supported SQLite capability. If a built-in read-only-capable API is unavailable, select and bundle a pinned Electron-compatible reader and exercise it in the packaged app. Do not assume developer Python, uv, PATH tools, MCP server or source-repository paths exist on another machine. Catalog support should not prevent live-only operation.

### Live API reading plan

Official documentation pages were located and fetched successfully (HTTP 200) during planning:

```text
https://developers.asana.com/reference/gettasksforproject
https://developers.asana.com/reference/getsubtasksfortask
https://developers.asana.com/reference/getstoriesfortask
https://developers.asana.com/reference/getattachmentsforobject
```

The high-level extractor failed because its configured backend is search-only; a direct read-only official-page fetch succeeded. No configuration was changed. These references establish planning endpoints, not working app connectivity. Recheck the endpoint/field schema during implementation.

Proposed exact read surface:
- Project metadata/custom-field settings and enum metadata for declared project/owner IDs.
- `GET /projects/{project_gid}/tasks` with explicit opt_fields and paginated offset handling; retrieve completed and incomplete according to documented completed_since behavior, with a defined full-history scope rather than silently accepting endpoint defaults.
- `GET /tasks/{task_gid}` for authorized owned detail and explicitly permitted relational context.
- `GET /tasks/{task_gid}/subtasks` for paginated hierarchy traversal needed for completeness.
- `GET /tasks/{task_gid}/stories` for comments/system activity on demand.
- `GET /attachments?parent={task_gid}` for task-associated attachments; resolve attachment detail through its fixed documented route only as required.

Do not depend on Premium task search or text-search zero hits. Enumerate the intended project completely, deduplicate GIDs, and audit subtask visibility. Traverse required child pages with a visited set, cycle/depth/resource guards, bounded concurrency and explicit partial-coverage errors. Include owned children even when parent is outside the personal scope; don't require BE prefix. Do not claim exhaustive nested-subtask coverage until tested against the live API model and locally intercepted multi-level fixtures. A traversal safety cap stops complete publication and reports partial state rather than truncating silently.

Keep existing seven linked boards as membership/context facts, not an automatic seven-board expansion. A task qualifies by the declared MSS project or an explicitly documented descendant-in-scope relation. Additional board-wide scope must be separately enabled and disclosed; first-membership order is never the project-of-record selector.

### Credential boundary

Cache browsing needs no credential. For live reads, select an approved connection mechanism during implementation: main-owned OAuth/read scopes where available, or an explicitly supplied existing credential through a secure masked connection surface with OS-protected storage and encryption availability checks. Do not harvest PATs from Hermes/OMP transcripts or silently read operational secret TOML. Never expose a token through window.asana, React, command lines, exported snapshots, logs or task notes.

The existing account may have broad permissions; enforce GET-only fixed endpoints in the adapter independently of token privileges. If a vetted read-only MCP connector is later chosen instead, pin/bundle its server, allowlist exact read methods, verify rejection of writes, and re-evaluate runtime packaging. Do not instantiate the historical unrestricted wrapper as a shortcut.

Connection states: not configured, checking, connected, expired/unauthorized, forbidden, offline, throttled, unavailable. Asana availability is distinct from office VPN/PES availability. Office-only references may show `Office connection required` and be skipped; never connect/install VPN workarounds or invent internal screenshots.

## 8. Refresh, persistence and provider isolation

- Startup loads the last valid scoped Asana snapshot without network side effects.
- Manual Refresh Asana performs read requests only. Optional catalog reload is explicitly `Reload local catalog`, not a fake live sync.
- One Asana list refresh at a time; repeat requests join; cancellation checked before publication. A failed/partial/invalid run preserves last-good list state and records its own attempt/error.
- Stage a new immutable snapshot with schema version, provider, scope IDs, query/traversal coverage, row count, capture interval and row-specific observation metadata; publish atomically only after identity/pagination/count validation. Do not imply API-wide transactional consistency: a task can change during a multi-page read.
- Detail caches have separate timestamps and ownership bindings. Raw upstream fields are not overwritten by display normalization.
- Keep `asana-state.json`/preferences under the existing userData directory but separate from PES workspace.json. Local preferences use `asana:<gid>` keys. Unknown schema/corrupt data fails safely without deleting PES state.
- Do not persist the whole team board in the personal app merely to filter React later. Filter before renderer/cache/export publication; transient API scan and optional taskbridge catalog reads are main-process-only.
- Namespaced activity (`provider=asana`) cannot clear or rewrite existing PES historical messages. No shared PES completion events or projection writes from Asana actions.
- Ctrl+R refreshes the active provider only; on Settings, require a clear provider context instead of implicit PES. Ctrl+K searches current provider. No `Sync all` action in this phase.

## 9. Proposed contracts and files

**Proposed, not existing API:** separate `window.asana` with `getState`, `listTasks(query)`, `getTask(gid)`, `getCounts(query)`, `refresh`, `cancelRefresh`, `loadComments(gid,cursor)`, `loadAttachments(gid,cursor)`, `getOwnedSubtasks`, `openTask(gid)`, `copyTaskContext(gid)`, scoped export and local preference methods. No token return, generic invoke/tool, raw SQL/path/URL, update, upload or complete method.

DTOs must retain string GID; scope/ownership proof; raw + display status/progress; native completion; all memberships; parent; dates with civil/timestamp distinction; source/freshness/coverage; lazy-resource states. Snapshot ID travels with list cursors/counts to prevent page/version mismatch.

| Path | Planned change |
|---|---|
| `src/shared/asana-types.ts` | New provider-specific DTOs, queries, coverage, safe API contracts |
| `src/shared/asana-domain.ts` | Pure ownership, group/filter/sort/count/date/diagnostic functions |
| `src/shared/types.ts` | Declare/re-export Asana API only; preserve PES types |
| `src/main/asana-repository.ts` | Read-only interface and scope validator |
| `src/main/asana-catalog.ts` | Optional read-only raw-ID catalog adapter |
| `src/main/asana-client.ts` | Fixed-route GET-only live reader, pagination and retry |
| `src/main/asana-connection.ts` | Main-owned connection/credential boundary; no renderer secret access |
| `src/main/asana-sync.ts` | Independent cancellation, validation and publication coordinator |
| `src/main/asana-store.ts` | Versioned isolated state/preferences/detail cache persistence |
| `src/main/asana-ipc.ts` | Guarded sender + argument + owned-task validation |
| `src/main/main.ts` | Compose Asana lifecycle only; preserve all PES completion behavior |
| `src/main/preload.ts` | Narrow separate window.asana bridge |
| `src/renderer/App.tsx` | Provider-aware sidebar/header/keyboard routing |
| `src/renderer/asana/AsanaTasksPage.tsx` | Working scoped list and shared query state |
| `src/renderer/asana/AsanaTaskList.tsx` | Grouped table, paging and selection |
| `src/renderer/asana/AsanaTaskBoard.tsx` | Read-only board view, no transition drag |
| `src/renderer/asana/AsanaTaskDetail.tsx` | Details, related context, comments, attachments, references |
| `src/renderer/asana/AsanaFilters.tsx` | Facets/search/sort/reset/saved views |
| `src/renderer/asana/AsanaConnection.tsx` | Honest per-provider connection/freshness UI |
| `src/renderer/styles.css` | Reuse tokens/themes/responsive layout; scoped Asana classes |
| `tests/asana-*.test.ts`, `tests/fixtures/asana/` | Sanitized API/catalog fixtures and pure/service/security tests |
| `tests/asana.desktop.e2e.cjs` | New isolated actual Electron/provider-navigation tests |
| `tests/asana.protocol.e2e.cjs` | Intercepted actual read transport if useful |
| `package.json`, lockfile, `scripts/package.cjs`, `scripts/inspect-package.cjs` | Only necessary pinned/runtime/package changes after adapter decision |
| `docs/ASANA-WORKFLOW.md`, `docs/ASANA-VERIFICATION.md`, `README.md` | Actual implementation/operations/evidence later; not authored in plan-only turn |

Do not modify `src/main/completion*.ts`, `portal-completion.ts`, completion fixtures/journal/evidence, original taskbridge config/database, preserved source reports, or existing installed release as part of this feature.

## 10. Ordered implementation tasks — for later approval

Every code step follows **RED → GREEN → focused regression → relevant broader suite**. Add small failing assertions incrementally, not one giant horizontal test pile. Do not commit/push unless a repository exists and that scope is authorized; the desktop currently has no Git repository.

### Task 1 — Protect baseline and freeze boundaries
- Read current docs/source again; record source/build/profile boundaries with secret-free evidence.
- Add regression assertions that PES completion remains unregistered, PES Sync stays read-only and Asana actions cannot reach completion modules.
- Baseline tests run before changes; preserve original WIP and data. Do not remove the existing mission lock as incidental cleanup.

### Task 2 — Contracts and exact ownership
- Files: asana-types/domain; tests/asana-ownership.test.ts.
- RED: wrong PIC, shared assignee, BE owned by someone else, owned FE, missing field, duplicate field ambiguity, name-only legacy and numeric-GID coercion.
- GREEN: exact identifier predicate and validation; sanitized raw-ID fixtures. Expected: no foreign task reaches personal results.

### Task 3 — Preserve independent status/date axes
- Files: asana-domain; tests/asana-domain.test.ts.
- RED: Ready to QA + Done + either completion flag; In Progress + completed; unset/unknown/disabled options; trailing-space raw names; no-date/civil-date boundaries.
- GREEN: immutable source values, stable group keys, dates and non-destructive diagnostics. No mutation mappings.

### Task 4 — Read-only catalog capability probe
- Verify packaged Electron SQLite access without migrations/writable opens; choose/pin compatible reader if needed.
- RED: unsupported schema, locked/missing DB, malformed raw_json, duplicate names, multiple memberships and first-membership mismatch.
- GREEN: fixed parameterized read-only catalog queries/consistent transaction; explicit cache origin and row freshness. Prove DB bytes/metadata are not intentionally changed by app reads.

### Task 5 — GET-only live transport and metadata
- Files: asana-client/connection; tests/asana-client.test.ts.
- RED: reject POST/PUT/PATCH/DELETE, arbitrary hosts/routes, unauthorized task IDs, secret reflection and unapproved connection state.
- GREEN: fixed route builders, metadata validation, cancellation/timeouts, Retry-After handling and bounded retries; secrets main-only. No real task writes for tests.

### Task 6 — Complete task discovery
- Add fixtures with >100 records, duplicates, owned/unowned children, missing-parent references, multiple memberships, multi-level hierarchy, repeated offset/cycles, truncated page failure and disabled fields.
- Follow all page offsets, dedupe by GID, preserve completed history scope and only publish a complete validated owned result. A safety limit yields explicit partial coverage and retains prior snapshot.

### Task 7 — Isolated persistence and refresh
- Files: asana-store/sync; tests/asana-store.test.ts and asana-sync.test.ts.
- RED: initial synchronous failure, cancellation before publish, storage error, repeated refresh, expired credential, partial page and stale-detail races.
- GREEN: independent single-flight state and atomic last-good publication; separate attempt/error/freshness. No PES data migration or sync dispatch.

### Task 8 — Guarded preload and IPC
- Files: asana-ipc/main/preload/types; tests/asana-ipc.test.ts.
- RED: wrong window/frame, unknown keys, arbitrary query/path/GID, foreign detail/comments/attachment/export and mutation-name calls.
- GREEN: allowlisted typed methods, strict validation, owned scope on every route, bounded response size and safe link opening.

### Task 9 — Provider-aware shell and sidebar
- RED actual renderer navigation: open Asana, click Status, return PES, Ctrl+K/Ctrl+R provider routing, connection labels/counts and responsive menu behavior.
- GREEN: separate Asana group with fixed owner; keep existing PES navigation and settings functionality. No accidental global PES sync from Asana.

### Task 10 — Working list and deterministic facets
- RED: >100 personal records, stable paging, empty/untitled tasks, full title access, search/filter intersection, sort ties, empty known groups and facet count reconciliation.
- GREEN: grouped table, query state, pagination/selection and loading/empty/error states. Start all tasks/no date cutoff; persist intentional local view changes only.

### Task 11 — Read-only board and local organization
- RED: table/board query parity; no drag/write request; per-provider pins/focus/saved views; restart persistence.
- GREEN: read-only cards, group collapse/columns/density and local-only preferences; no source status checkbox/action.

### Task 12 — Details and context loading
- RED: parent unowned, owned child, relationship forgery, cycle, 403/404, switch selection during request and offline partial cache.
- GREEN: detail pane/drawer, overview and explicit context policy; no implicit inclusion/counting of parent/siblings.

### Task 13 — Comments, attachments and references
- RED: multi-page stories/files, comments unavailable vs true empty, local change feed vs upstream history, script-rich descriptions, expired attachment link and unsafe URL scheme.
- GREEN: lazy per-resource state, safe render/navigation and accurate evidence labels. No upload/comment mutation operations or automatic office-service fetch.

### Task 14 — Copy/export and accessibility
- RED: one-task export leakage, filtered export scope, foreign context, CSV formula payload, clipboard async failure, large selection and keyboard/focus return.
- GREEN: owned-only export, raw JSON identifiers retained, safe CSV cells, explicit selection/count metadata, verified clipboard; keyboard/screen-reader status text and both themes.

### Task 15 — Package and actual desktop E2E
- Run actual Electron with isolated app/cache paths and intercepted Asana endpoints; prove read-only HTTP/tool surface, user note survival and provider isolation.
- Build/inspect separate feature candidate only after approval to produce it. Launch without developer Python/npx/PATH assumptions. Existing release/shortcuts stay unchanged until separate promotion authorization.

### Task 16 — Live read-only acceptance and documentation
- Only with approved connection: perform fresh read-only scoped listing, verify current ownership metadata, compare deduplicated list/facets/detail to source and record request/coverage/freshness without secrets.
- A live read test is not authorization for writes. Update docs and limitations from actual outputs, independently review exact source, and report local/live/installed states separately.

### Verification commands for later implementation

Existing commands:

```bash
npm test -- --maxWorkers=1 --testTimeout=20000
npm run typecheck
npm run build
node tests/agent-stdio.e2e.cjs
node node_modules/electron/cli.js tests/portal-completion.dom.e2e.cjs
node tests/desktop.e2e.cjs
```

New **planned** harness, executable only after created:

```bash
node tests/asana.desktop.e2e.cjs
```

Existing completion tests are regression gates only, not authorization to extend completion. Exact pass totals depend on the future tree; do not promise a new numeric total in advance. A missing integration harness, runtime or credential is a reported blocker, not permission to fabricate a pass.

## 11. Acceptance checklist

1. PES completion remains unfinished/disabled and its source/records are untouched except necessary shared-shell composition outside completion modules.
2. Distinct Asana sidebar shows HERNANDA MSS, not a shared-account My Tasks view or owner dropdown.
3. Every personal row/count/detail/export meets exact current IT PIC scope.
4. Owned FE, BE and unknown-role tasks all work; prefixes never grant ownership.
5. Primary grouping is actual Status; Progress, native completed and section remain independent and visible.
6. Unknown/unset statuses and all three historical untitled fixture records remain accessible.
7. Completed and incomplete tasks are available with no undisclosed history/date truncation.
8. >100 items, multi-project duplicates and required subtask traversal do not lose or double-count records.
9. Owned total, matching total, shown count and mutually exclusive Status facets reconcile programmatically.
10. Search/filter/sort/group/table/board/reset/paging work on the declared snapshot and scope.
11. Rich detail subresources state exactly what is loaded, missing, stale, denied or unavailable.
12. Outside-owner context is opt-in/relationship-bound, separately labeled and excluded from personal counts/exports.
13. Date-only/timestamp semantics and overdue handling are correct across local midnight/timezones.
14. Native-completion/status discrepancies are displayed without source changes.
15. Refresh/cancel/error/offline states preserve the last valid scoped snapshot and never imply all rows share a run timestamp.
16. Ctrl+R/Ctrl+K and connection UI are provider-specific; Asana actions never trigger PES workflows.
17. Local pin/focus/saved views survive restart without changing source records or existing PES preferences.
18. No remote-write route/tool/IPC, editable completion checkbox or transition drag exists.
19. Tokens, raw SQL, arbitrary paths/API URLs and other owners' task data never reach personal renderer/export boundaries.
20. Attachment navigation and rich text are safe; absence of cached files/comments is not reported as zero upstream resources.
21. Scoped exports and async clipboard are exercised; CSV formula content is made safe without corrupting canonical JSON.
22. Packaged runtime works without unbundled developer runtimes; no installed release/profile replacement occurs implicitly.
23. Existing PES tests and actual desktop regressions remain green; new Asana unit/security/intercepted-E2E evidence is real.
24. Final reporting distinguishes catalog browsing, live-read capability, actual live read verification and installed deployment; remote updates remain deferred.

## 12. Decisions, tradeoffs and remaining questions

### Recommended defaults — no question needed to draft the plan

- Target the existing desktop app; preserve branding/profile and PES work.
- Owner is fixed HERNANDA MSS; default board MSS Sprint Planning.
- All native-completion states available; primary Status grouping with independent Progress/completion facets.
- Token-free stale catalog browsing remains useful, but **cache-only is not the entire full-functionality deliverable**. Live freshness/details need the new verified read adapter; missing connection is disclosed.
- Main-process TypeScript GET-only reader avoids importing write-capable Python MCP scripts or runtime downloads. Optional SQLite catalog is an adapter, not a credential source.
- Reuse themes and layout; no unrelated UI redesign or app-wide refactor.

### Gates before implementation can claim completion

1. Approve the actual live connection method and secure credential handling; no current connector availability was established here.
2. Confirm outside-owner context policy: recommended links/stubs by default, deliberate read-only relational context only if wanted. The personal work set never expands.
3. Verify SQLite runtime/package compatibility and documented API completed-history/subtask coverage rather than relying on a successful developer-cache query.
4. Re-resolve current board/field/option metadata before live use; historical IDs are leads, not current permission proof.
5. Any later request for updates requires a separate preview/confirmation/evidence/readback design. Historical due-minus-one/start-date defaults must not be reused.

## 13. Plan handoff

**This turn's deliverable is this plan only.** No application source, taskbridge data/config, Asana/PES record, connection, schedule, release, shortcut or completion lock is to be changed as part of preparing it. Earlier researched behavior is captured here for future implementation; unrelated raw history and credentials are intentionally excluded.

After approval, implement one bounded task at a time with real RED/GREEN evidence, preserve WIP, review the specification and code independently, and produce a separately verified feature candidate. Do not resume PES completion while implementing Asana listing.
