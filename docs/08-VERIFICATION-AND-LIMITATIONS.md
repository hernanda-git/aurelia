# 08 — Verification, Limitations and Improvement Backlog

[Documentation index](../README.md) · [Tests](../test_pes_automation.py) · [Verification artifacts](../verification/)

## 1. Evidence classes

| Label | Meaning in this workspace |
|---|---|
| HISTORICAL_LIVE_VERIFIED | Actual browser/tool execution observed earlier in this same session |
| LOCAL_VERIFIED | Rechecked against local files or executed during documentation handoff |
| SOURCE_OBSERVED | Visible in the copied implementation; not necessarily independently exercised |
| NOT_IMPLEMENTED | No implementation is present |
| NOT_RUN | Not executed or not proven during this work |

The preserved website data is historical live evidence. Fresh local tests are not a live website refresh. Documentation prose is not implementation proof.

## 2. Original live checks

The original browser execution produced these explicit success messages:

```text
LIVE CHECK PASSED: 32 rows, 8 unique selected tasks, 8 matching histories
HOME-TO-REPORT LIVE TEST PASSED
```

They followed real extraction, JSON readback and assertions, not generated sample responses. The later report returned paths under the original Documents directory, counts Approval 8 / Open 0 and total_scanned 32.

Browser checks included login success, exact filter values, grid count, task-number uniqueness and matching task numbers in all eight histories. A second complete execution started on authenticated Home.aspx and covered navigation, List and filtering again.

These messages are quoted from the session's visible results; the entire raw browser transcript has not been exported. Supporting captured data is preserved locally.

## 3. Offline tests

`test_pes_automation.py` has exactly two unittest methods:

### `test_rolling_window_handles_year_and_leap_boundaries`

Checks:

| Input local date | Expected start | Expected end |
|---|---|---|
| 2026-10-26 | 2026-09-01 | 2026-11-30 |
| 2026-01-01 | 2025-12-01 | 2026-02-28 |
| 2024-01-31 | 2023-12-01 | 2024-02-29 |
| 2026-12-31 | 2026-11-01 | 2027-01-31 |

### `test_export_preserves_all_selected_task_details`

Uses actual `evidence/` fixtures and checks the exporter exists, selected counts, 32 scanned rows, eight tasks, unique identifiers, two overdue flags, nonempty histories and nonempty JSON/CSV/Markdown files.

The tests were written before the functions were implemented and observed failing. The original final run passed both. The documentation pass reruns these same tests on the byte-identical workspace copy. Exact new output is saved as `verification/unit-tests.txt`.

They do not simulate browser operations, Vault, paging, authentication challenges, arbitrary locales or website changes.

## 4. Documentation-handoff checks

The local validator, [verify_workspace.py](../verification/verify_workspace.py), records actual execution results in `verification/validation.json` and `verification/validation-output.txt`.

It checks:

- all required canonical docs and source/evidence files exist;
- all recorded original snapshots still match their SHA-256 and source-file hashes;
- active source/test/report copies match their original snapshots;
- report and CSV selected task-number sets agree;
- raw grid has 32 distinct task identifiers and the captured expected status distribution;
- selected report has eight distinct Approval records, zero Open and eight matching histories;
- original ZIP has ten entries and passes CRC checking;
- relative Markdown links resolve;
- Markdown code fences are balanced;
- Mermaid flowchart and sequence blocks pass basic structural sanity checks;
- obvious secret assignments, browser-state artifacts and truncation markers are absent from the checked content;
- file inventory and verification timestamps are generated from the actual tree.

Secret scanning is heuristic. Mermaid structural checks are not a full parser or rendered-preview test. The validator's output, not this list alone, determines which checks passed.

## 5. Known implementation limitations

| Area | Exact current behavior / gap | Status |
|---|---|---|
| Login | External Hermes/Vault procedure; `run` requires authenticated browser | By design |
| Browser dependencies | Injected `js`, `fill_input`, `ensure_real_tab`; not standalone CLI | By design |
| Pagination | Detects anchors whose href contains `Page$`; stops; no traversal | NOT_IMPLEMENTED beyond detection |
| Alternative pagers | JavaScript-only buttons or other server patterns not exhaustively detected | NOT_RUN / coverage gap |
| Empty grid | Wait requires a task row; can time out rather than return explicit zero | NOT_IMPLEMENTED |
| Readiness | ASP.NET state/DOM checks plus fixed sleeps; no request-correlation token | SOURCE_OBSERVED limitation |
| Transport recovery | Reattaches only for RuntimeError text containing `timed out` during waits | Narrow implemented handling |
| Redirected login | Starting login URL rejected; login redirect during navigation may lead to timeout | Recovery not generalized |
| URL equality | Exact string comparison with task URL; alternative case/query strings can trigger navigation | SOURCE_OBSERVED |
| Outputs | Same-day filenames overwritten; writes not atomic; older final report can remain after failed retry | SOURCE_OBSERVED |
| Integrity guards | Several checks use Python `assert`, disabled by optimized Python mode | SOURCE_OBSERVED |
| Grid schema | Fixed positions; no independent exact-header/schema assertion | SOURCE_OBSERVED |
| Date parsing | Selected Indonesian substitutions then locale-sensitive `%b` parsing | Locale coverage gap |
| CSV sanitization | Leading formula-character mitigation only; no exhaustive spreadsheet security test | Limited hardening |
| Markdown rendering | Arbitrary source strings/fences are not comprehensively escaped | Not hardened |
| Partial history save | Progress is saved, but automatic resume from partial data is absent | Partial recovery only |
| Test breadth | Two offline test methods and tool-driven live assertions | Limited suite |
| CI / scheduler / deployment | None installed | NOT_IMPLEMENTED |
| Site date semantics | Filter values proven; exact backend date-column predicate unverified | NOT_RUN |
| Server mutation audit | No task mutation controls used; no independent DB audit | NOT_RUN |

## 6. Proposed improvements — not performed

This documentation request did not authorize an implementation expansion. The following remain a backlog:

1. **Explicit empty results:** distinguish valid no-record responses from failed navigation; add red/green tests.
2. **Full pagination:** identify each supported pager and traverse all pages with task-number deduplication and a declared-total reconciliation gate.
3. **Atomic run publication:** use unique run IDs and staging directories, then publish a completion manifest only after verification.
4. **Schema and identity guards:** explicit exceptions instead of optimized-away assertions, exact headers and row widths, exact history ID parsing.
5. **Deterministic dates:** replace locale-sensitive abbreviated-month parsing with a complete explicit month map.
6. **Transport regression coverage:** add isolated tests for already-completed navigation, stale sessions and permitted read retries.
7. **Broader export tests:** round-trip CSV quoting, Unicode, nested table structures, malformed dates, missing fields and spreadsheet-injection edge cases.
8. **Secure unattended operation:** prove that browser/Vault access works in the intended scheduled runtime before proposing a recurring job.
9. **Share-safe packaging:** offer a selected-report-only bundle separately from internal raw evidence.

## 7. Git and publication

The target did not exist when inspected, and `C:/Workspace` was not a Git repository. No remote was provided. This handoff creates local files only. No initialization, commit, push, public release, deployment or remote-readback success is claimed.

If publication is requested later, first decide confidentiality, destination and allowed artifact scope. Do not upload raw task evidence by default.

## 8. Completion gate

A complete documentation handoff means the required documents exist, source snapshots are intact, local tests pass, selected-task and raw-grid counts reconcile, internal links and structure checks pass, and limitations are explicit. It does not require a new PES login or task refresh when the user's current request is documentation only.
