# Aurelia — A Personal Agentic Task Management

Read-only PES task extraction for **MUHAMMAD HERNANDA (3220)**, department **IT Mitra Seribu Saudara (32)**.

**Workspace:** `C:\Workspace\pesautomation`  
**Session date:** October 26, 2026, local timezone UTC+07:00.  
**Last preserved website extraction:** `2026-10-26T08:45:19.320966+07:00`.

This workspace documents the entire task lifecycle visible in the session: requirements, secure-login blocker and resolution, browser inspection, extraction mistakes and corrections, task-history collection, test-first automation development, live verification, packaging, and this documentation handoff. It contains the actual code, captured task data, and byte-identical historical snapshots—not only a description.

## Aurelia desktop application

A standalone Windows desktop application is implemented under [desktop/](desktop/README.md). It has task/detail/deadline views, local focus and pinning, persistent activity, offline snapshots, themes, and secure manual PES sign-in. It does not depend on Hermes private browser/Vault APIs at runtime.

Open **PES** from its Desktop/Start menu shortcut or `C:\Workspace\pesautomation\Open PES.cmd`. The portable executable is `desktop\release\PES-win32-x64\PES.exe`; keep its complete folder intact. The main heading is **List Tasks**. Agent-accessible data is under `data\agent-workspace\`; see the [storage and agent workflow guide](desktop/docs/AGENT-WORKSPACE.md). The existing 09:58 Asia/Jakarta live snapshot is preserved; launching the update is not a new PES sync. See [desktop verification](desktop/docs/VERIFICATION.md) and the current handoff JSON for exact release evidence.

The extraction artifacts and session documentation below remain preserved as historical foundations. The original Python script is still a Hermes helper; the new desktop app is an independent implementation.

## Verified extraction outcome

| Item | Result | Evidence class |
|---|---|---|
| Date range | September 1–November 30, 2026 | Preserved live extraction |
| Rows inspected | 32: 8 Approval, 24 Solved | Captured grid, independently recounted |
| Selected statuses | 8 Approval, 0 Open | Captured JSON/CSV |
| Detailed target histories | 8 matching task numbers | Captured Info panels |
| Overdue on October 26 | 2 tasks, each 3 days | Report calculation |
| Reusable automation | Implemented; exercised against PES, including Home-to-report navigation | Historical live verification |
| Offline tests | Two unittest cases; rerun evidence in the verification folder | Local verification |
| Credentials | Vault-managed; not copied into the workspace | Security boundary |
| Scheduling, deployment, task mutations | Not installed / not performed | Explicit scope boundary |

**Freshness:** these are session results, not a continuous live monitor. This documentation pass preserves the captured website state; it does not re-query PES or imply the tasks remain unchanged later.

## Read in this order

1. [Session record](docs/01-SESSION-RECORD.md) — full chronological account, including failed attempts and corrections.
2. [Requirements and acceptance traceability](docs/02-REQUIREMENTS.md) — all ten original steps, exact values, and completion evidence.
3. [Architecture and E2E data flow](docs/03-ARCHITECTURE-E2E.md) — components, browser lifecycle, diagrams, recovery paths.
4. [Operator runbook](docs/04-OPERATIONS.md) — secure login, repeat execution, checks, outputs, recovery.
5. [Data dictionary and results](docs/05-DATA-AND-RESULTS.md) — every field, selection rules, preserved results and status semantics.
6. [Lessons learned](docs/LESSONS_LEARNED.md) — blockers, fixes, platform pitfalls, reliability improvements.
7. [Security and scope](docs/07-SECURITY.md) — credential handling, read-only boundaries, confidentiality, sharing rules.
8. [Verification and limitations](docs/08-VERIFICATION-AND-LIMITATIONS.md) — exact tests, evidence levels, gaps, future work.
9. [Workspace provenance and handoff](docs/09-PROVENANCE-AND-HANDOFF.md) — paths, snapshots, source precedence and Git status.

## Artifacts

| Path | Purpose |
|---|---|
| [pes_automation.py](pes_automation.py) | Working reference script; unchanged copy of the tested implementation |
| [test_pes_automation.py](test_pes_automation.py) | Two offline regression tests using real captured fixtures |
| [evidence/](evidence/) | Original real-site grid/history fixtures used by tests |
| [reports/2026-10-26/pes_tasks.md](reports/2026-10-26/pes_tasks.md) | Complete readable details for all selected tasks |
| [reports/2026-10-26/pes_tasks.csv](reports/2026-10-26/pes_tasks.csv) | Spreadsheet-compatible export |
| [reports/2026-10-26/pes_tasks.json](reports/2026-10-26/pes_tasks.json) | Structured selected-task report and complete histories |
| [reports/2026-10-26/pes_filtered_raw.json](reports/2026-10-26/pes_filtered_raw.json) | All 32 grid rows and grid HTML |
| [source/provenance.json](source/provenance.json) | SHA-256 and original locations for preserved snapshot files |
| [source/original/](source/original/) | Historical originals, including old README and original ZIP |
| [source/pes-task-extraction.SKILL.snapshot.md](source/pes-task-extraction.SKILL.snapshot.md) | Skill as it existed before this documentation handoff |
| [verification/](verification/) | Test output and machine-checked documentation/data validation |

## Quick use

Ask Hermes: **“Refresh my PES tasks using C:\Workspace\pesautomation.”**

The script requires an authenticated Hermes `browser_exec` environment. It is **not** a standalone program that can log in when run as `python pes_automation.py`. The exact invocation is in the [runbook](docs/04-OPERATIONS.md).

Offline regression checks, through the terminal tool with working directory `C:/Workspace/pesautomation`:

```bash
python test_pes_automation.py
```

## Documentation contract

- Original code and captured reports outrank prose describing their behavior.
- Preserve `source/` snapshots. Historical paths inside them are intentional, not current run instructions.
- Current canonical documentation is this README and `docs/`.
- The active reusable skill points to this workspace; the original Documents folder remains intact for backward compatibility.
- No password, cookie, authentication token, browser profile, or login database belongs here.
- No Git repository or remote was present for this workspace; no commit or push is claimed.
