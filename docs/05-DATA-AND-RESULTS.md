# 05 — Data Dictionary and Preserved Results

[Documentation index](../README.md) · [Full task report](../reports/2026-10-26/pes_tasks.md) · [JSON](../reports/2026-10-26/pes_tasks.json) · [CSV](../reports/2026-10-26/pes_tasks.csv)

## 1. Source and freshness

| Property | Preserved value |
|---|---|
| Application page | `https://pes.grcboard.com/Modul/ISO/FormInputTask.aspx` |
| Retrieval timestamp | `2026-10-26T08:45:19.320966+07:00` |
| Department | IT Mitra Seribu Saudara, selector value `32` |
| PIC | MUHAMMAD HERNANDA, selector value `3220` |
| Start / end | `2026-09-01` / `2026-11-30` |
| Raw task rows | 32 distinct task numbers |
| Raw status distribution | Approval 8; Solved 24; Open 0 |
| Selected report | Approval 8; Open 0 |
| Matching target histories | 8 |

The documentation copies these actual artifacts and does not refresh them. The retrieval timestamp describes the original completed browser run. Overdue flags are calculated against that run's local date, not the date a reader opens this document.

## 2. Selection and identity rules

- Grid status index 12 must equal `Approval` or `Open` exactly.
- Grid PIC index 3 must equal `MUHAMMAD HERNANDA`.
- Task number is the deduplication and history-association key.
- Task identifiers are preserved literally, including the space in `Task. IT` and the original slash-separated suffix.
- History key must exist for every selected task. Live runner waits for the exact task number in the visible panel.
- All scanned statuses remain in the raw evidence; selected reports omit the 24 Solved tasks.
- Do not filter the raw data again by `TglInput`. The site's date filter returned some tasks originally entered before September.

## 3. Grid field dictionary

All exported grid values are strings unless explicitly described otherwise.

| Index | Export field | Source meaning / handling |
|---:|---|---|
| 0 | `Row` | Display row number; not a globally unique task ID |
| 1 | `TaskNo` | Exact PES task identifier and association key |
| 2 | `TglInput` | Displayed task input date, Indonesian abbreviation retained |
| 3 | `Pic` | Assigned person; verified against requested PIC |
| 4 | `Jabatan` | Displayed position; source says Programmer Back End even on FE task names |
| 5 | `DeptName` | Grid's short department label, ITMSS, distinct from selector display text |
| 6 | `TaskName` | Complete original task description; original punctuation and whitespace retained in JSON |
| 7 | `GoalTask` | Completion goal, not proof that it has been achieved |
| 8 | `AsalTask` | Displayed origin, Lain-Lain in selected rows |
| 9 | `Bobot` | Displayed task weight; stored as source string, not inferred hours |
| 10 | `Target` | Grid target code, T1 for all eight selected tasks |
| 11 | `Duedate` | Source due date used for overdue computation |
| 12 | `Status` | List status; selection uses this field |
| 13 | `TglApproval` | Source approval date; do not infer it is completion |
| 14 | `TglSelesai` | Completion-date cell; blank for all selected tasks |
| 15 | `Lampiran` | Attachment-cell text; blank for selected tasks; attachments were not downloaded |

Additional selected-task properties:

| Field | Type | Meaning |
|---|---|---|
| `overdue` | Boolean | Due date is strictly before local extraction date |
| `days_overdue` | Integer | `max(0, extraction_date - due_date)` in days |
| `history` | Object | Complete Info text and captured table-cell arrays |

## 4. JSON report envelope

The envelope contains `retrieved_at`, `source`, `department`, `pic`, `pic_value`, `date_from`, `date_to`, `total_scanned`, `counts`, and `tasks`. `counts` always has the requested status keys Approval and Open, including explicit zero values.

`retrieved_at` is generated when export occurs using the current local timestamp. `date_window(today)` defines the filter metadata and overdue reference date. Replaying a fixed fixture on a later day for a unit test can produce a fresh export timestamp while preserving the test's explicitly supplied historical date; that is test output, not a newly captured website result.

## 5. History representation

`history.text` is the complete rendered Info Target Task text. `history.tables` preserves arrays for every table in the panel, including presentation/nested tables. Consumers should not assume every table is a clean rectangular dataset with one simple header row.

The target-history table has grouped headings: Target, Status, Tanggal, Keterangan, with Input / DueDate / Approve subheadings. Each selected task's captured data row contains target `1`, status `Verifikasi`, its input date, due date, approval date and an empty remarks cell.

The list's `T1` and history's `1` are retained in their respective representations. List Approval and history Verifikasi are separate source facts, not contradictory values to normalize away.

## 6. Selected-task inventory

The shortened descriptions below are a reading aid. Exact complete task names and goals are in the linked full report and JSON.

| TaskNo | Description summary | Input date | Due date | Approval date | Bobot |
|---|---|---|---|---|---:|
| M03938/Task. IT/1026 | FE — Seller Center ST-2297, INTP, Profile Toko Online | 14-Okt-2026 | 30-Okt-2026 | 15-Okt-2026 | 4 |
| M03939/Task. IT/1026 | FE — Seller Center ST-2301, INTP, Operasional Toko Online | 14-Okt-2026 | 30-Okt-2026 | 15-Okt-2026 | 4 |
| M03940/Task. IT/1026 | BE — Seller Center ST-2301, INTP, Operasional Toko Online | 14-Okt-2026 | 30-Okt-2026 | 15-Okt-2026 | 4 |
| M03941/Task. IT/1026 | BE — Seller Center ST-2297, INTP, Profile Toko Online | 14-Okt-2026 | 30-Okt-2026 | 15-Okt-2026 | 4 |
| M03989/Task. IT/1026 | BE — Enhance Base Inventory Store, negative-stock guard and handling notification | 20-Okt-2026 | 23-Okt-2026 | 21-Okt-2026 | 1 |
| M03990/Task. IT/1026 | BE — Enhance Base Inventory Fifo, negative-stock guard and handling notification | 20-Okt-2026 | 23-Okt-2026 | 21-Okt-2026 | 1 |
| M04020/Task. IT/1026 | BE — Seller Center ST-2302, INTP, Pengiriman Toko Online | 21-Okt-2026 | 06-Nov-2026 | 23-Okt-2026 | 2 |
| M04021/Task. IT/1026 | FE — Seller Center ST-2302, INTP, Pengiriman Toko Online | 21-Okt-2026 | 06-Nov-2026 | 23-Okt-2026 | 4 |

Common values: Status Approval; Target T1; Pic MUHAMMAD HERNANDA; Jabatan Programmer Back End; DeptName ITMSS; AsalTask Lain-Lain; completion date blank; attachment cell blank. All eight Info histories show Verifikasi.

## 7. Overdue findings

`M03989/Task. IT/1026` and `M03990/Task. IT/1026` were due October 23, 2026. They were three days overdue on October 26. Tasks due October 30 and November 6 were not overdue at extraction time.

This is a date comparison, not a judgment of actual implementation progress. No code repository, work ticket or completion evidence was inspected to establish whether development was already finished.

## 8. Encoding and preservation

- JSON uses UTF-8 and `ensure_ascii=False`.
- CSV uses UTF-8 with BOM and standard CSV quoting; History contains embedded newlines.
- Markdown uses UTF-8 and includes source fields plus fenced detail text.
- Blank cells remain empty strings in JSON/CSV; readable Markdown labels them `(blank)`.
- CSV-leading formula characters are prefixed with a quote. JSON remains the preferred format for literal source strings.
- `r.cells` captures row-owned cells rather than all descendant `td` elements.

## 9. Two evidence sets

The `evidence/` fixtures were captured before final reusable-run verification. The dated `reports/` files are the later completed runner output. Their task identities, selected counts and histories agree, but metadata shape and raw HTML may differ between exploratory and final captures. They are distinct real captures; byte identity between those two sets is not asserted.

The immutable snapshot layer contains copies of both sets. Their individual source hashes are recorded in [source/provenance.json](../source/provenance.json).
