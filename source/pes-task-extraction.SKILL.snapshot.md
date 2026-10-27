---
name: pes-task-extraction
description: Use when extracting PES Approval and Open tasks.
version: 0.1.0
author: Hernanda (hernanda-git), Hermes Agent
license: MIT
platforms: [windows]
metadata:
  hermes:
    tags: [pes, tasks, browser, automation]
---

# PES task extraction

## When to Use
- List or refresh Hernanda's PES tasks at pes.grcboard.com.
- Extract detailed Approval/Open tasks without changing task state.
- Do not use to approve, solve, upload evidence, or edit tasks.

## Prerequisites
- Load `computer-use` for browser safety, then use `browser_exec(local=True)` for DOM interactions.
- The tested script and README live in `C:/Users/it26/Documents/PES-Automation/`. Locate and read them before changing them. They are a Hermes browser helper script, not a standalone CLI.
- Use the PES saved login through `browser_vault`; never type or store passwords in code, tools, chat, memory or this skill.

## Procedure
1. Verify local date with `terminal`. Open `https://pes.grcboard.com/Default.aspx` in `browser_exec` using `new_tab` on first navigation. If an authenticated task page already exists, keep it.
2. On login, call `browser_vault(action=list)` first. Fill `#txtLogin` with the saved identifier (normally `muhammad hernanda`) using `fill_input`; fill password only with `browser_vault(action=fill,handle=...)`; submit `#btnLogin1`. Confirm the URL is Home.aspx or an authenticated task page. If no saved login exists, use the vault's secure save flow; stop if declined/unavailable.
3. Execute the tested script inside `browser_exec(local=True)`:

```python
import pathlib, json
source = pathlib.Path('C:/Users/it26/Documents/PES-Automation/pes_automation.py')
ns = {}
exec(compile(source.read_text(encoding='utf-8'), str(source), 'exec'), ns)
result = ns['run'](globals(), 'C:/Users/it26/Documents/PES-Automation/reports')
print(json.dumps(result, indent=2))
```

4. Read the current dated report JSON. Verify the counts, unique TaskNo values and that each selected task has a matching detail history. Deliver a concise task table plus the full Markdown/CSV attachments using MEDIA paths. Mention overdue tasks based on the current local date; preserve list statuses exactly.
5. Do not install a recurring schedule unless the user requests one.

## Verified controls
- Page: `https://pes.grcboard.com/Modul/ISO/FormInputTask.aspx`.
- List: `MainContent_btnList1`.
- Department: `MainContent_ddlDept1`, value `32`, text `IT Mitra Seribu Saudara`; triggers asynchronous postback.
- PIC: `MainContent_ddlPic1`, value `3220`, text `MUHAMMAD HERNANDA` (wait for department postback before selecting).
- Dates: `MainContent_txtFrom`, `MainContent_txtTo`; use Indonesian display format `01-Sep-2026`, `30-Nov-2026` with `Okt`, `Agu`, `Mei`, `Des` where applicable.
- Range: first day of previous month through last day of next month, calculated fresh every run.
- Clear origin/status filters; Preview: `MainContent_btnPreview`.
- Grid table is identified by header `TaskNo`; all 16 fields must be extracted. Status index 12, PIC index 3. Preserve exact identifiers and raw task text.
- Task Info buttons: `MainContent_lst_info_<row index>`. Target-history panel: `MainContent_PanelModalTarget`, close: `MainContent_btnClose`. Never click `_kelola_`, `_tambah_`, Update, Save or upload controls for extraction.

## Pitfalls
- ASP.NET postback is asynchronous: `wait_for_load` can return while old rows remain. Poll `Sys.WebForms.PageRequestManager.getInstance().get_isInAsyncPostBack()` and inspect the new target state.
- CDP navigation may time out after navigation actually succeeded. Use `ensure_real_tab()` to reattach and inspect state, not repeated navigation or login. The script handles timeout recovery during waits.
- Browser contexts may restart; login again through Vault when redirected to Default.aspx.
- The `workspace` variable is not injected into `browser_exec`; use `os.environ['BH_AGENT_WORKSPACE']` for browser workspace paths.
- Use `r.cells` rather than all descendant `td` nodes: attachment rows can contain nested markup and otherwise silently disappear from counts.
- List status `Approval` and detail-history status `Verifikasi` are different fields; preserve both without interpreting one as replacing the other.
- The grid's date range can include tasks created earlier. Do not impose an extra creation-date filter.
- Current script fails closed for server-side pagination and empty grids; do not claim completeness/zero tasks until those cases are explicitly handled and verified.
- CSV export protects leading spreadsheet formula characters; JSON preserves source text.

## Verification
- Run `python test_pes_automation.py` through `terminal` in the automation directory after edits. Tests cover rolling calendar boundaries and full export against real saved evidence.
- Exercise the browser script live, including navigation from Home.aspx, after changing selectors or wait behavior.
- Parse/dedupe/count tasks in Python, not mentally. Expected totals are whatever the current page returns; do not hardcode historical counts.
- Full report must include all grid fields, target history, chosen date range, PIC/department, retrieval timestamp and counts. No credentials or cookies belong in outputs.
