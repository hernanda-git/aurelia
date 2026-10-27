# 09 — Workspace Provenance and Handoff

[Documentation index](../README.md) · [Hash manifest](../source/provenance.json)

## 1. Location interpretation

The user's destination `c/workspace/pesautomation` is represented as the Windows directory `C:\Workspace\pesautomation`, using forward slashes in Python and native-tool arguments where convenient. The target was inspected twice—before the interruption and after “continue”—and did not exist before this handoff created it.

Original completed artifacts remain at `C:/Users/it26/Documents/PES-Automation`. They were not moved, deleted or rewritten by the workspace copy operation.

## 2. Layout and authority

```text
pesautomation/
  README.md                         canonical entry point
  pes_automation.py                 unchanged working reference
  test_pes_automation.py            unchanged original tests
  docs/                             canonical concern-specific guides
  evidence/                         original test fixtures
  reports/2026-10-26/               completed original extraction outputs
  source/
    original/                      byte-identical original deliverables
    pes-task-extraction.SKILL.snapshot.md
    provenance.json                source locations and SHA-256
  verification/
    verify_workspace.py            local documentation/evidence checker
    unit-tests.txt                 actual copied-test output
    validation.json                actual validation results
    validation-output.txt          execution output
    file-inventory.json            generated final workspace inventory
```

Source-of-truth precedence:

1. Actual captured data and current source code for implementation/data claims.
2. Tool-backed test and validation results for executed checks.
3. Canonical README and `docs/` explaining those sources.
4. Historical source README, old ZIP and skill snapshot as prior-state evidence.
5. Chat summaries as navigation aids, not replacements for artifacts.

## 3. Preserved source set

`source/provenance.json` lists twelve original files: the source module, test file, original README, original ten-entry ZIP, two real test fixtures, five completed dated-report artifacts, and the pre-handoff skill snapshot. Each entry includes original path, relative snapshot path, byte length and SHA-256.

Nine active working references are copied to the workspace root/evidence/reports: source, tests, two fixtures and five dated-report files. These remain byte-identical to the original corresponding artifacts. Documentation is additive; it does not silently fix implementation behavior.

The historical skill snapshot is intentionally not updated when the active skill gains workspace guidance. Its hash records the version that accompanied the original handoff.

## 4. Skill and future-use routing

The active default-profile `pes-task-extraction` skill is the future-use procedure. It is updated to prefer the new workspace while retaining the original Documents directory as historical/backward-compatible context.

Canonical invocation uses:

```python
source = pathlib.Path('C:/Workspace/pesautomation/pes_automation.py')
result = ns['run'](globals(), 'C:/Workspace/pesautomation/reports')
```

This excerpt belongs inside the fuller `browser_exec` setup in [04-OPERATIONS.md](04-OPERATIONS.md). It is not executable by itself in a normal terminal. The skill does not embed the password and does not start a schedule.

## 5. Historical path treatment

The original README and ZIP continue to mention `C:/Users/it26/Documents/PES-Automation`. That is accurate historical context. Those files are not canonical current instructions. Do not globally replace old paths inside evidence snapshots to make a stale-path scan look clean.

Only current guidance should point to the new workspace. The original Documents folder remains usable if an earlier invocation still references it, but future updates should deliberately choose one active code location rather than editing both independently.

## 6. Original packaging versus workspace documentation

The preserved original ZIP contains ten entries and was created before these additional docs. It is evidence of the original deliverable, not a complete package of this new workspace. Its integrity is checked independently.

The new documentation is delivered directly from the requested directory. No claim is made that the old ZIP includes the new guides.

## 7. Publication and WIP protection

- No Git metadata or remote was present for this workspace at discovery.
- No repository was initialized and no remote publication was attempted.
- No existing target files were overwritten because the target directory was absent.
- Historical originals are retained and hash-checked.
- Python bytecode caches are not part of the intended preserved source set.
- Local test outputs and validator outputs belong under verification, not inside the immutable snapshots.

## 8. Maintenance contract

When changing code later:

1. Read the current code and docs before editing.
2. Add a failing regression appropriate to the intended behavior.
3. Make the minimal implementation change and rerun tests.
4. Re-exercise the browser flow if selectors/waits/authentication boundaries changed.
5. Update operation and limitation docs to distinguish implemented versus planned behavior.
6. Keep historical source snapshots unchanged; create a new source checkpoint if new provenance is required.
7. Recompute manifests only for a deliberate new checkpoint, never to hide unexpected drift.
8. Rerun link, data, integrity and secret checks before handoff or publication.

No action is needed from the user to read this documentation. A future live refresh may require a valid saved login/session. A future remote push requires an explicit destination and sharing scope.
