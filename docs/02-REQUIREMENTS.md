# 02 — Requirements and Acceptance Traceability

[Documentation index](../README.md) · [Operator runbook](04-OPERATIONS.md)

## Original objective

Retrieve and list or save all PES tasks assigned to MUHAMMAD HERNANDA whose list status remains Approval or Open, within the site's date-filter window from the first day of the previous month through the end of the next month. Capture detailed task fields and target histories.

This is data retrieval, not permission to alter task records or install recurring execution.

## All ten requested steps

| # | User requirement | Actual implementation / evidence | Status |
|---:|---|---|---|
| 1 | Visit `pes.grcboard.com/Default.aspx` | Opened HTTPS login page in `browser_exec` | LIVE_VERIFIED in original session |
| 2 | Log in with supplied account | Identifier `muhammad hernanda`; password supplied through Vault after user saved the login; authenticated Home and task pages observed | LIVE_VERIFIED; secret omitted |
| 3 | Go to `pes.grcboard.com/Modul/ISO/FormInputTask.aspx` | Exact HTTPS task URL used by script and live browser | LIVE_VERIFIED |
| 4 | Click List | `MainContent_btnList1`, asynchronous response verified | LIVE_VERIFIED |
| 5 | Choose department IT Mitra Seribu Saudara | `MainContent_ddlDept1`, value `32`; postback awaited | LIVE_VERIFIED |
| 6 | Choose MUHAMMAD HERNANDA or value 3220 | `MainContent_ddlPic1`, value `3220`; option confirmed after department update | LIVE_VERIFIED |
| 7 | Set start to first date of previous month | `MainContent_txtFrom`; calculated `2026-09-01`, displayed `01-Sep-2026` | LIVE_VERIFIED |
| 8 | Set end to final date of next month | `MainContent_txtTo`; calculated `2026-11-30`, displayed `30-Nov-2026` | LIVE_VERIFIED |
| 9 | Click Preview | `MainContent_btnPreview`; filter values read back after response | LIVE_VERIFIED |
| 10 | List or save all Approval and Open tasks in detail | All 32 visible task records captured; 8 Approval / 0 Open selected; all 8 Info histories captured; JSON/CSV/Markdown saved | LIVE_VERIFIED for preserved snapshot |

`LIVE_VERIFIED` refers to tool-backed execution during the October 26 session, not a claim that every future website change will be compatible.

## Additional acceptance rules adopted

- Use secure origin-matched Vault filling; never enter a password from chat through generic typing tools.
- Clear task-origin and status filters before Preview to avoid accidental narrowing.
- Check exact filter values, PIC values, unique task numbers and matching history identities.
- Preserve source task identifiers and original text, including original spelling and nonbreaking spaces.
- Keep original list status and detailed-history status separately.
- Read Info only, not management or upload controls.
- Save all scanned rows as evidence, even though only requested statuses are included in the final selected report.
- Produce a reusable extraction script and a repeatable operator runbook.
- Compute date boundaries afresh for each run; historical unit-test expectations remain fixed fixtures.

## Date contract

For local date `today`:

1. `first = today.replace(day=1)`.
2. Start is the first of the month containing `first - one day`.
3. Find next month's first day using a calendar-safe month transition.
4. End is that next month's final valid day from `calendar.monthrange`.

This is a calendar-month window, not “90 days” or “30 days before/after.” On October 26, 2026 it is September 1 through November 30 inclusive as supplied to the site.

The site can return tasks created before this window. A captured task created in August had a September target. Therefore no additional client-side creation-date filter is applied. The site's backend date-column semantics were not proven.

## Scope of completeness

The final capture had 32 distinct task numbers in one inspected grid DOM and no detected `Page$` anchor links. All eight requested-status records in that capture received detail extraction. This proves completeness for the inspected grid snapshot, not unrestricted completeness across every possible site pagination implementation or backend record.

The runner currently refuses detected server-page links and times out on an empty grid rather than representing an unverified partial or empty result as complete.

## Documentation follow-up acceptance

The subsequent user request is satisfied by this workspace containing:

- detailed session chronology, including issues and corrections;
- exact requirements and selectors;
- working source and tests, kept unchanged from the original implementation;
- original captured data, readable results and machine-readable exports;
- architecture, operation, security and recovery guides;
- test and documentation validation evidence;
- historical snapshots and hash provenance;
- known limitations, unimplemented improvements and clear publication status.

No secret-bearing raw chat export is necessary to satisfy the request, and none is included.
