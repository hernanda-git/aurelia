# Agent-Only PES Task Completion Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. Resolve that skill through discovery if unavailable; do not invent its commands. Require separate specification and code-quality reviews before enabling live writes.

**Goal:** Let an authorized agent autonomously complete PES tasks whose work is demonstrably done, attach genuine task-specific evidence, reconcile saved results, refresh the desktop cache, and notify Hernanda—without a human completion trigger.

**Architecture:** Extend the existing Electron main process with a narrow agent command gateway, deterministic completion policy, durable operation journal, and exclusive portal coordinator. The agent supplies grounded completion findings; main-process code—not an LLM or renderer—controls eligibility, attachment staging, one-shot mutations, reconciliation, and publication. Keep the desktop UI an observer for completion, with existing read-only sync and secure login preserved.

**Tech Stack:** Existing Electron/TypeScript/React/Vitest application; local authenticated agent transport; dedicated append-only completion journal; fixed ASP.NET DOM automation; main-process-scoped CDP for attachment input. No new cloud service, administrator install, public HTTP endpoint, or dependency on private Hermes browser/Vault internals.

**Plan status:** Design only. No feature implementation, scheduler, credential change, or portal mutation is authorized by this document.

---

## 1. Scope and non-negotiable behavior

### In scope
- Agent discovers candidates, confirms completed work, acquires evidence, prepares a completion proposal, and submits it through an authenticated agent capability.
- Host validates every proposal and independently rechecks live PES identity/state immediately before writing.
- One task at a time: status `Selesai`, explicit date policy, evidence upload, independent saved-state verification.
- Crash recovery, duplicate suppression, read-only discrepancy reconciliation, audit, desktop cache refresh, and outcome notification.
- Existing overdue work and future tasks whose completion is genuinely established; overdue status is a prioritization signal, not completion evidence.

### Out of scope
- No Complete/Approve/Submit-completion button, keyboard shortcut, renderer mutation IPC, completion deep link, imported-file trigger, or public mutation endpoint.
- No task creation/deletion, target-date changes, PIC changes, approval impersonation, evidence replacement, or automatic correction of locked records.
- No automatic writes merely because an Asana task is called Done, a PR is merged, a deadline passed, or a task disappeared from an active filter.
- No unattended credential entry or browser-session copying. Human login may unblock an enrolled agent run but does not create a completion request.
- Do not fix the current FIFO anomaly by resubmitting it during implementation or testing.

### Agent-only means a real application boundary
This is not satisfied by `actor: "agent"`, a hidden button, an environment variable, or a file in an inbox. The mutation authority must arrive through an enrolled agent runtime with a short-lived, task-scoped capability. The desktop renderer must have neither the transport nor the capability.

A human can configure/revoke policy, sign in, or ask an agent to inspect tasks; only an enrolled agent can produce a validated completion proposal and execute it. A GUI Sync click must never transitively authorize or trigger completion. Recovery may reconcile an existing journaled attempt read-only; starting another mutation requires an authenticated agent invocation.

**Threat-model limit:** A person or malicious program controlling the same Windows account can potentially inspect processes or change application files. This design prevents ordinary human/UI triggers and unauthorized client calls; it does not claim to cryptographically distinguish human intent from software under a fully compromised account. Stronger isolation requires an independently protected agent supervisor/service and is outside v1.

## 2. Inspected baseline and known facts

Workspace: `C:/Workspace/pesautomation`; desktop: `C:/Workspace/pesautomation/desktop`.

Inspected source:
- `desktop/src/main/main.ts`: sender-validated renderer IPC, single-instance app, cache/projection publication, existing sync actions; no agent mutation gateway.
- `desktop/src/main/portal.ts`: private official PES window using `persist:pes-focus-portal`, fixed DOM read workflow, ASP.NET transition checks, selected Approval/Open histories, all-status source rows.
- `desktop/src/main/sync.ts`: existing single-flight read-sync coordinator. Its lock is not yet a shared read/write portal lock.
- `desktop/src/shared/types.ts`: source tasks, snapshots, activity and renderer API; no completion model.
- `desktop/docs/ARCHITECTURE.md` and `desktop/docs/AGENT-WORKSPACE.md`: profile, trust boundaries, immutable projections and protected task work directories.

Preserve `%APPDATA%/PES Focus`, browser partition, local pins/focus/settings, source histories, and task `work/` content. The agent projection is not an authoritative command queue. No Git repository was found at the inspected desktop path; do not initialize one or promise commits unless separately requested.

### Mandatory regression cases from the October 26 audit
Source: `reports/completion-20261026/summary.json`, saved detail readbacks, and final-recheck raw rows.

| Record | Persisted detail | Other saved views | Required handling |
|---|---|---|---|
| `M03989/Task. IT/1026` Store | Selesai, FinishDate `23-Okt-2026` | List Solved, list TglSelesai `26-Okt-2026` | Preserve both dates; unresolved field semantics, no rewrite |
| `M03990/Task. IT/1026` FIFO | Selesai, FinishDate `23-Okt-2026`, detail table Solved | List/Info Update Task, list finish blank | Quarantine for read-only reconciliation; never retry completion |

List identifiers contain `Task. IT`; detail identifiers contain `Task.IT`. Preserve each exact observed identifier. Map identities through explicit verified associations, task-specific origin links, PIC and available internal row identity—not silent whitespace normalization or row position.

These observations prove the current readback problem; they do not establish PES backend semantics, approval policy, or reliable eventual consistency.

## 3. End-to-end pipeline

```text
Authenticated agent run
  → live all-status discovery + read-only reconciliation of old attempts
  → map PES identity to exact source task / delivery artifact
  → acquire authoritative completion facts and actual evidence
  → deterministic policy assessment
  → prepare immutable evidence bundle + immutable proposal
  → acquire portal ownership + recheck live state + capability
  → durable submit intent → click Update Task once
  → verify evidence dialog → durable upload intent → upload once
  → reopen saved detail + target table + Info + fresh list
  → classify verified / discrepancy / unknown
  → publish fresh cache and agent projection when valid
  → durable agent result + deduplicated notification
```

No batch writes after a task diverges: stop remaining batch mutations, release safely, and report the discrepancy. Discovery and read-only diagnosis can continue. Default live canary scope is one newly eligible task, not existing locked audit records.

### Trigger contract
- Accept a proposal from the enrolled agent after its own source verification or a separately authorized agent monitor run.
- Do not install a timer or scheduled task as part of this plan. Future recurring execution needs separate authorization and a proven runtime/session lifecycle.
- Do not connect `pes:sync`, Ctrl+R, opening the app, clipboard export, opening a workspace, or reading a file to automatic completion dispatch.
- If PES needs login, record `AUTH_REQUIRED`; after direct secure login, the same authenticated agent may resume only after fresh eligibility checks. Login itself cannot commit a pending proposal.

## 4. Completion policy: deterministic gates before an irreversible click

Every gate must pass. Return structured reasons instead of an LLM confidence score.

| Gate | Required condition | Failure outcome |
|---|---|---|
| Authority | Enrolled runtime; unexpired, scoped capability; approved policy revision | Reject |
| Identity | Exact list/detail identifiers, PIC `3220`, department `32`, verified origin mapping | Block identity |
| Freshness | Live capture and source facts within policy TTL; immediate under-lock preflight | Refresh/reassess |
| Eligibility | Known writable live task state; enabled Update control; no prior uncertain/finished attempt | No-op or quarantine |
| Work done | Goal-specific acceptance facts from authoritative source, with provenance | Block evidence |
| Evidence | Task-specific attachment, readable actual bytes, safe type/size, checksum, no secrets | Block evidence |
| Date | Explicit policy, valid civil date, no future finished date, target still matches preflight | Block policy |
| Consistency | No unresolved status/history/identity mismatch affecting completion | Quarantine |
| Durability | Journal and staged evidence safely committed before submission | Block storage |

### What counts as confirmed done
Require an exact source task match plus acceptance-scope proof. Prefer two corroborating sources when available: authoritative task progress and merged delivery/test evidence. A source marked Ready for QA can establish **BE development done** only when that is the PES goal; it does not establish QA or deployment complete.

Historical user confirmation is admissible supporting provenance, not an unrestricted future authorization. Old assistant statements or rendered summaries alone are not primary proof. If only those are available, block until source facts or original execution evidence can be inspected. Where one authoritative source is sufficient, document that explicit task-type rule in the versioned policy rather than silently relaxing the gate.

### Date policy
User-requested compatibility policy: `finishDatePolicy = target_date`. It must be enabled by a standing, versioned authorization; never inferred by the agent. Keep `observedCompletedAt`, `proposedPesFinishDate`, and provenance separate. The target date is a user-requested PES reporting date, not proof that work finished then.

Refuse a future finish date. Future-target tasks cannot use target-date completion today; leave blocked or use a separately authorized actual-confirmed-date policy. Never move a target date to make a proposal eligible. Store date-only values as ISO civil dates plus raw PES display strings; use the existing configured timezone, not UTC conversion of midnight.

## 5. Agent gateway and trust boundaries

### Recommended v1 boundary
Use a local Windows named-pipe broker owned by the application main process, with current-user access restrictions and an explicit handshake. Attach a stdio tool adapter to an enrolled agent runtime. The adapter exposes typed tools; it does not expose arbitrary browser JavaScript, filesystem access, or debugger commands.

Before coding, prove how the chosen agent supervisor enrolls/authenticates its child adapter. Do not invent a Hermes API or accept self-declared session identifiers. If no trustworthy enrollment flow is available, ship read-only assessment only and keep live mutation disabled. A pipe ACL by itself authenticates the user account, not an agent.

Capability requirements:
- Issued through the trusted enrollment channel, held in process memory, never in chat, task context, logs, or renderer state.
- Bound to agent principal/run, exact task, proposal digest, evidence digest, operation type, expiry, nonce, and policy revision.
- Consumed durably before the first mutating click. Replay returns the existing operation; it never creates a new submission.
- Short TTL, revocable enrollment, no wildcard task completion permissions by default.
- No unauthenticated localhost HTTP fallback and no mutating `pes.exe --complete ...` escape hatch.

### Proposed agent tool contract
These names are proposed, not existing runtime commands:
- `pes_list_candidates`: live scope, exact identities, raw statuses, snapshot reference, unresolved attempts.
- `pes_assess_completion`: accepts source facts/provenance; returns eligibility, blockers and evidence requirements; never writes PES.
- `pes_prepare_completion`: stages validated attachment bytes, returns immutable proposal ID/digest and planned diff; never writes PES.
- `pes_commit_completion`: capability-bound commit of one proposal; no arbitrary status/date/file-path overrides.
- `pes_get_completion`: query authoritative journal/outcome by operation ID.
- `pes_reconcile_completion`: read-only saved-state check; never a hidden retry.

Requests include `schemaVersion`, `requestId`, authenticated `agentRunId`, `proposalId` where relevant. Return explicit `outcome`, `reasonCodes`, `remoteViews`, evidence references, `cacheState`, and `notificationState`. Do not return bearer capabilities in renderer-visible results.

## 6. Data, staging, and durable state machine

Create `completion/` under the existing user-data directory, isolated under `PES_FOCUS_DATA_DIR` in tests:

```text
completion/
  policy.json
  proposals/<proposalId>/proposal.json
  proposals/<proposalId>/evidence/<hash>.png
  operations/<operationId>/events/<sequence>.json
  operations/<operationId>/before.json
  operations/<operationId>/after.json
  operations/<operationId>/verification.json
  reconciliation/<operationId>.json
```

Main process owns this tree; task `work/` stays user/agent-owned and untouched. Write immutable staged bytes from an approved intake boundary, not a raw arbitrary path supplied at commit. Validate file identity, magic bytes, type, size, checksum and source/task relationship. Reject links/junctions, traversal, device/UNC paths, hard-link hazards and unsafe roots. Copy and validate the final staged artifact before sealing a proposal; recheck it before upload. Never read credentials or browser profile files as evidence.

Operation identity includes exact account/task association, target revision, proposal digest, evidence digest and policy revision. An existing operation for the same task/target in any submitted or uncertain state blocks another one even when the new evidence differs.

```text
DISCOVERED → ASSESSED → EVIDENCE_READY → PREPARED
  → PRECHECKED → SUBMIT_INTENT → SUBMITTED
  → UPLOAD_INTENT → UPLOADED → VERIFYING
  → VERIFIED | SAVED_WITH_DISCREPANCY | OUTCOME_UNKNOWN
```

Side states: `BLOCKED`, `AUTH_REQUIRED`, `NOOP_ALREADY_COMPLETE`, `CANCELLED_BEFORE_SUBMIT`.

Separate remote outcome from cache/projection/notification outcomes. A cache failure after a verified remote write is `REMOTE_VERIFIED_CACHE_STALE`, not permission to repeat PES completion.

Journal rules:
- Append durable immutable transition events with monotonic sequence, previous-event digest, and validated reducer transitions. Flush before irreversible actions; prevent overwriting an existing event.
- A hash chain detects accidental changes, not tampering by a fully compromised same-user account. State that limit.
- If a process crashes after writing submit/upload intent, assume the external action may have happened. Resume only through read-only reconciliation; no automatic re-click.
- Exactly-once remote delivery cannot be guaranteed without a PES idempotency key. Provide at-most-one automatic attempt plus durable deduplication and explicit unknown outcomes.
- Bounded retries are allowed for safe reads and pre-submit transient failures. No generic retry wrapper may enclose Update or Upload.
- Cancellation is honored before submit. After submit it stops new tasks but continues bounded reconciliation if possible; never claim rollback.

## 7. Portal executor and reconciliation

### Shared ownership
Introduce one `PortalCoordinator` shared by read sync, agent completion, connection navigation, screenshots and reconciliation. Queue or reject competing operations; do not allow sync to navigate away from an evidence dialog. Preserve the existing single-flight guard fix. Ensure only one app instance owns its completion journal and broker; competing processes must fail closed.

### Fixed executor steps
1. Navigate through the tested List/department/PIC/date/Preview pipeline and supported pagination.
2. Resolve exact task across all statuses and watched operation IDs; reopen Kelola from its current row. Do not reuse `_kelola_0` across changes.
3. Validate form identity, target, source link, goal, PIC, writable state and no unresolved prior operation. Reassess if anything changed.
4. Set `MainContent_ddlStatus = Selesai`, wait for ASP.NET completion, fill `MainContent_txtTglSelesai`, and read every planned field back. Use scoped JS/IIFEs to prevent persistent `const e` collisions.
5. Persist submit intent, then click `MainContent_lbUpdateTask` once.
6. Wait for the specific visible attachment modal. Resolve `MainContent_fuFileName`; do not accidentally choose hidden `fuFileName1`.
7. Set file input from the sealed staged artifact via main-process-scoped CDP. Verify selected file name/type/size and artifact digest; persist upload intent and click `MainContent_btnAddFile` once.
8. Reopen the saved task independently and capture detail status/FinishDate/TargetDate, detail target row, Info history, list status/date, attachment metadata and screenshot.
9. Capture all relevant raw views; classify results before refreshing the cache. Never decide success because the form cleared or Update became disabled.

Use existing dedicated PES browser partition and origin checks. Keep sandbox/context isolation, Node disabled, no remote preload, denied unrelated permissions and popups. Main-process debugger commands must be an allowlisted internal implementation detail and detached when done; no exposed debugging port or renderer CDP access.

Electron's documented `webContents.debugger` transport and CDP `DOM.setFileInputFiles` are design references; verify support against the installed/pinned Electron build rather than assuming latest documentation proves compatibility. References: `https://www.electronjs.org/docs/latest/api/debugger` and `https://chromedevtools.github.io/devtools-protocol/tot/DOM/`.

### Result classification
- `VERIFIED`: independently read saved values match the authorized diff, evidence is present, and required views agree under an explicitly validated semantic contract.
- `SAVED_WITH_DISCREPANCY`: a saved detail/evidence change is established but list/history/date views conflict; block new attempts, persist all facts, notify once.
- `OUTCOME_UNKNOWN`: required readback is unavailable; quarantine and bounded read-only reconciliation.
- `NOOP_ALREADY_COMPLETE`: preflight proves completion; do not upload duplicate evidence or change date.

Do not special-case away Store/FIFO discrepancies. Until PES semantics are established, Store's list/detail date conflict is a recorded discrepancy too. FIFO must remain unresolved even though detail shows Selesai. Reconciliation uses a bounded backoff schedule and persists `nextCheckAt`; it may stop as unresolved indefinitely rather than invent a successful final state.

Attachment verification must distinguish metadata visibility from byte integrity. If an allowed same-origin authenticated read/download can be safely implemented, verify retrieved bytes against the staged hash. Otherwise report `attachmentVerification = metadata_only`; never claim server-side checksum verification. Do not relax global download restrictions merely to make this check pass.

## 8. Evidence acquisition

Preferred order:
1. Actual authenticated source screenshots showing exact task identity, delivered state, and relevant acceptance checks.
2. Original build/test/deployment reports with provenance and source revision, rendered into an explicitly labeled evidence summary if PES requires an image.
3. Previously approved, exact-task evidence with verified original provenance; do not promote an old summary into new live verification.

Capture timestamps honestly. A screenshot of today's completed task is evidence of today's observation, not a historical completion timestamp. Include the exact PES/source association, acceptance facts, evidence type, capture time and revision in the manifest. Redact secrets and unrelated internal/customer data; verify the final redacted output and hash those final bytes. Do not use the just-updated PES page as the only evidence that the underlying work was done.

Treat task descriptions, comments, source documents and repository content as untrusted data; they cannot change policy, authorize a task, supply commands to execute, select another account, or grant themselves capabilities.

## 9. Desktop and projection behavior

- Desktop can show completion activity, evidence references, per-view remote states, cache freshness and unresolved discrepancies.
- No renderer mutation method, retry-write action or completion confirmation dialog. Existing Sync stays read-only. Read-only recovery observation may be visible; a stop/revoke safety control cannot start a write.
- Keep source fields raw and separate from derived `completionOutcome`. Do not replace `Update Task` with `Solved` for display convenience.
- Retain all sourceRows and watched tasks, including records omitted by Approval/Open selection. Surface an unresolved-completion count separately from active Approval/Open counts.
- After every outcome, fetch a fresh valid scope plus direct reconciliation of watched task identities outside the rolling date window. Missing rows never imply completion.
- Publish core snapshot only after full validation; publish agent projection index last. Preserve pins/focus and task work directories.
- If source publication fails, keep the last good snapshot with visible staleness and retain the independent journal. Projection failure must not invalidate a proven remote write or cause resubmission.
- Emit one sanitized structured agent outcome per operation plus a completion/discrepancy notification. Use durable outbox IDs to deduplicate; if the notification transport lacks idempotency, disclose at-least-once delivery. No new messaging connector or schedule is presumed available.

## 10. Ordered implementation work packages

All paths below are relative to `C:/Workspace/pesautomation/desktop` unless explicitly stated. For every code slice: write the named failing test, run the focused test to confirm RED, implement the smallest slice, rerun GREEN, then run relevant regression tests. Preserve actual test output; expected results below are acceptance goals, not claimed execution results.

### Task 1 — Freeze fixtures and specify outcome semantics
**Objective:** Encode observed real portal discrepancies before adding mutation logic.
- Create sanitized fixtures in `tests/fixtures/completion/` derived from the October 26 audit; keep originals unchanged.
- Create `tests/completion-verification.test.ts`.
- Tests: Store date conflict yields discrepancy; FIFO status conflict yields discrepancy; disappeared active task is not solved; exact identities retained.
- Run: `npm test -- tests/completion-verification.test.ts`.
- Gate: do not define VERIFIED to make known contradictory fixtures pass as successful.

### Task 2 — Add completion contracts and pure policy
- Create `src/shared/completion-types.ts`, `src/main/completion-policy.ts`, `tests/completion-policy.test.ts`.
- Define proposal, source facts, manifests, policy revision, outcomes and reason-code unions; use runtime validators at transport boundaries.
- RED cases: expired evidence, missing origin mapping, overdue-only proof, future target-date finish, Ready-for-QA for a deployment goal, unknown live status, unsupported policy revision.
- GREEN cases: exact identity, valid goal-specific authoritative facts, valid attachment, approved civil-date policy.
- Run: `npm test -- tests/completion-policy.test.ts`.

### Task 3 — Build durable journal and crash reducer
- Create `src/main/completion-journal.ts`, `tests/completion-journal.test.ts`.
- First test duplicate request and replay after SUBMIT_INTENT; add storage failure, partial write, corrupted event, restart, expired capability, concurrent owner and invalid transition tests.
- Refuse mutation when journal durability fails. Test crash boundaries before and after both clicks.
- Run: `npm test -- tests/completion-journal.test.ts`.

### Task 4 — Seal evidence bundles
- Create `src/main/completion-evidence.ts`, `tests/completion-evidence.test.ts`.
- RED cases: arbitrary profile-file intake, extension/MIME mismatch, changed bytes, links, traversal, oversized file, unrelated task, missing provenance.
- Stage immutable verified bytes before PREPARED; verify the same artifact is used at upload.
- Run: `npm test -- tests/completion-evidence.test.ts`.

### Task 5 — Establish the agent-only authority prototype
- Create `src/main/agent-gateway.ts`, `src/main/agent-capability.ts`, `src/agent/stdio.ts`, `tests/agent-gateway.test.ts`.
- First produce a read-only enrollment/handshake proof for the actual selected agent supervisor. Record its verified lifecycle and limitations; do not modify Hermes configuration as an incidental step.
- RED cases: ordinary renderer, shell client with actor=agent, copied task file, wrong task/run/proposal, expired capability, nonce replay, connection from unauthorized principal.
- GREEN: enrolled adapter can prepare/query; only a valid task-scoped capability can enter commit validation.
- Run: `npm test -- tests/agent-gateway.test.ts`.
- Hard gate: if enrollment authenticity is unresolved, do not expose commit and do not proceed to live writes.

### Task 6 — Serialize all portal access
- Create `src/main/portal-coordinator.ts`, `tests/portal-coordinator.test.ts`.
- Modify `src/main/main.ts`, `src/main/sync.ts`, `src/main/portal.ts` to share ownership without exposing arbitrary portal execution.
- Test sync vs mutation, connection vs evidence dialog, app shutdown, cancellation, single-flight early-write failure and lock cleanup.
- Run: `npm test -- tests/portal-coordinator.test.ts tests/sync.test.ts`.

### Task 7 — Implement narrow fixed portal mutations against fixtures
- Create `src/main/portal-completion.ts`, `tests/portal-completion.test.ts`, `tests/portal-completion.dom.e2e.cjs`.
- Extend `src/main/portal.ts` with narrowly scoped internal operations for exact-task readback and controlled completion; keep the generic executor private.
- Test correct live-row resolution, differing exact identifiers, full/async postbacks, status/date readback, visible modal, correct file input, single Update/Upload click and unrelated-field preservation.
- Test navigation failure after an uncertain click never retries it. Prevent stale DOM node IDs after navigation.
- Run: `npm test -- tests/portal-completion.test.ts`; then `node node_modules/electron/cli.js tests/portal-completion.dom.e2e.cjs` using an isolated local fixture portal, never the live account.

### Task 8 — Implement coordinator, reconciliation and outcome rules
- Create `src/main/completion.ts`, `src/main/completion-verification.ts`, `tests/completion.test.ts`, `tests/completion-recovery.test.ts`.
- Connect policy → journal → exclusive preflight → one-shot executor → independent verification.
- Test every transition, timeout class, duplicate commit, auth loss, cancellation, discrepancy circuit breaker, bounded read-only recheck and watched task outside date scope.
- Run: `npm test -- tests/completion.test.ts tests/completion-recovery.test.ts tests/completion-verification.test.ts`.

### Task 9 — Refresh cache/projection and add observer-only UI
- Modify `src/shared/types.ts`, `src/main/store.ts`, `src/main/agent-workspace.ts`, `src/main/main.ts`, `src/renderer/App.tsx`, `src/shared/ui-copy.ts` and styles only as needed.
- Modify `src/main/preload.ts` solely for read-only completion observations if existing state broadcast is insufficient; add no commit method.
- Extend `tests/store.test.ts`, `tests/agent-workspace.test.ts`, `tests/ui-copy.test.ts`, `tests/desktop.e2e.cjs`.
- Test raw status preservation, no human trigger reachable through UI/IPC/shortcuts, all-status counts, preserved work, stale cache after remote success and missing task not declared solved.
- Run focused tests and actual desktop E2E with isolated profile.

### Task 10 — Durable notifications and agent integration
- Create `src/main/completion-notifications.ts`, `tests/completion-notifications.test.ts`, `docs/AGENT-COMPLETION.md`.
- Connect outcome events to the enrolled adapter; optionally use an already authorized notification transport after discovery, not assumed connector names.
- Test notification failure/restart/replay does not repeat remote mutation or falsely report delivery.
- Document exact tool schemas, reason codes, capability lifecycle, login recovery, evidence format and read-only discrepancy recovery.

### Task 11 — Packaging, security review and shadow mode
- Extend `scripts/inspect-package.cjs`; add `tests/completion.packaged.e2e.cjs` and `scripts/verify-completion-readiness.cjs`.
- Audit bundle exclusions: no real task evidence, capability, credential/session data or completion journals newly bundled by this feature.
- Run shadow mode on actual task data: discover/assess/prepare hypothetical diff only; never click Update/Upload. Verify baseline locked Store/FIFO records are no-op/quarantined.
- Independently review agent authority, path handling, portal-origin checks, crash behavior and absence of renderer mutation paths.

### Task 12 — Controlled live canary and handoff
- Only after explicit implementation/live-enable authorization and all prior gates, choose one newly eligible task with authoritative completion evidence and a standing policy.
- Verify baseline, run one agent-originated commit, reopen every saved view, compare unrelated records, and verify attachments at the declared assurance level.
- A single unexplained discrepancy stops further mutation rollout. Reconcile read-only; do not use additional user tasks as experiments.
- Refresh actual desktop cache/projection, exercise packaged UI observer, and provide journal-backed report.
- Update `README.md`, `docs/ARCHITECTURE.md`, `docs/AGENT-WORKSPACE.md`, `docs/VERIFICATION.md` and the completion skill during implementation, not during this planning turn.

## 11. Validation commands and hard acceptance gates

Existing verified project commands to retain:

```bash
npm test
npm run typecheck
npm run build
node node_modules/electron/cli.js tests/portal.dom.e2e.cjs
node tests/desktop.e2e.cjs
npm run package
node scripts/inspect-package.cjs
```

New test/script commands named in work packages are planned files; they are not present or executed by this plan. Run the packaged E2E harness with `PES_FOCUS_TEST_EXECUTABLE` pointing to the built executable and `PES_FOCUS_DATA_DIR` isolated. Never run destructive fixtures against the real profile.

Release acceptance:
- [ ] No human-renderer route can call completion, directly or indirectly; Sync remains read-only.
- [ ] Agent-only enrollment demonstrated against an actual runtime, not an actor label.
- [ ] Every write has a scoped consumed capability, fresh live preflight, policy decision, evidence manifest and durable intent.
- [ ] Unknown/submitted/locked tasks never receive a second automatic submission.
- [ ] Unsafe evidence paths and changed bytes are rejected before click.
- [ ] Both date fields are read before submission and after reopening; per-view conflicts remain visible.
- [ ] Store/FIFO historical discrepancies never classify as fully verified without separately established semantics.
- [ ] Approval/Open omission never produces a false zero-overdue or solved count.
- [ ] Remote result, cache freshness, projection status and notification delivery are separate assertions.
- [ ] All existing tests plus new policy/journal/gateway/portal/recovery/packaged tests pass with real output.
- [ ] Actual live canary is distinctly identified; fixture/shadow results are not represented as live writes.
- [ ] Existing profile, source records, work files and authentication session remain preserved.

## 12. Rollout and unresolved decisions

Recommended rollout: read-only enrollment proof → shadow proposals → isolated fixture writes → independent review → explicit standing authorization → one live canary → limited agent-only operation. Default mutation switch stays off until the live-enable gate.

Implementation decisions requiring proof, not guesses:
1. **Agent enrollment:** which actual supervisor supplies authenticated process/session identity and capability bootstrap? Block commit until demonstrated.
2. **PES semantics:** what distinguishes Update Task from Solved, and what does list TglSelesai represent relative to detail FinishDate? Unknown now; preserve discrepancies.
3. **Standing date policy:** retain target-date reporting only with explicit durable policy; future-target completion needs separately authorized actual-date handling.
4. **Evidence assurance:** can server attachment bytes be read back safely under current restrictions? Otherwise disclose metadata-only verification.
5. **Always-on operation:** v1 requires the app and enrolled agent runtime to be available. No new background service, startup task or recurring monitor is implied; add later only with authorization.

**Definition of done:** An enrolled agent can take a genuinely completed eligible task through evidence-backed one-shot completion, independently verify what PES saved, retain discrepancies without rewriting them, refresh the user's actual cache, and report an honest operation outcome. A successful click, upload response, changed active count, or polished UI is not sufficient.
