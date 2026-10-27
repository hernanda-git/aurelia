# 04 — Operator Runbook

[Documentation index](../README.md) · [Selectors and acceptance](02-REQUIREMENTS.md) · [Recovery lessons](LESSONS_LEARNED.md)

## 1. Preconditions

- Use the current default Hermes profile with browser tools and the PES saved login available.
- Read the `pes-task-extraction` skill and browser safety guidance.
- Use the Windows workspace `C:/Workspace/pesautomation`.
- Confirm the intended operation is extraction only.
- Verify local date using the terminal tool; the runner itself also uses `datetime.date.today()`.
- The script uses Python standard library only but depends on helper functions injected by `browser_exec`. Installing Python alone does not provide the browser integration.

No administrator rights or additional package installation was needed for the completed workflow. The original machine was Windows, and terminal commands were delivered through bash/MSYS rather than PowerShell.

## 2. Secure login through tools

Use `browser_exec(local=True)` for DOM work. On first navigation:

```python
# Open PES login
new_tab('https://pes.grcboard.com/Default.aspx')
wait_for_load()
print(page_info())
```

If already on an authenticated PES tab, preserve it instead of needlessly signing in again.

1. At the login page call `browser_vault(action='list')` through the deferred tool interface.
2. Select the available PES login for origin `https://pes.grcboard.com`; do not persist its tool handle in source.
3. Fill the username in `browser_exec`:

```python
fill_input('#txtLogin', 'muhammad hernanda')
```

4. Fill the password with `browser_vault(action='fill', handle=<handle returned by list>)`. This is a tool argument placeholder, not runnable Python.
5. Submit with DOM click:

```python
js("document.getElementById('btnLogin1').click()")
wait_for_load()
print(page_info())
```

6. Confirm authenticated Home or task-page state. If a verification challenge appears, follow the Vault's secure code workflow; never type codes from chat.

If there is no saved login, use the Vault's secure save flow. If it returns `prompt_unavailable`, stop and ask the user to save the login through Passwords & Logins. If the user declines, do not retry through another password-entry path.

## 3. Run the extraction

Execute this **inside `browser_exec(local=True)`**, not the shell:

```python
# Extract PES tasks from the authenticated session
import pathlib, json
source = pathlib.Path('C:/Workspace/pesautomation/pes_automation.py')
ns = {}
exec(compile(source.read_text(encoding='utf-8'), str(source), 'exec'), ns)
result = ns['run'](globals(), 'C:/Workspace/pesautomation/reports')
print(json.dumps(result, indent=2))
```

Expected return structure contains output paths, a count for each requested status, and total scanned. Do not hardcode the October 26 values for future runs.

The module will navigate to the exact task URL, click List if needed, select department then PIC, apply the date range, reset origin/status filters, Preview, read filters back, capture the grid, read Info panels, and export.

## 4. Verify before reporting

Read the returned JSON path and validate in Python:

```python
import json, pathlib, collections
report = json.loads(pathlib.Path(result['json']).read_text(encoding='utf-8'))
tasks = report['tasks']
assert len(tasks) == len({task['TaskNo'] for task in tasks})
assert all(task['Status'] in ('Approval', 'Open') for task in tasks)
assert all(task['Pic'] == 'MUHAMMAD HERNANDA' for task in tasks)
assert all(task['TaskNo'] in task['history']['text'] for task in tasks)
counts = collections.Counter(task['Status'] for task in tasks)
assert report['counts'] == {status: counts[status] for status in ('Approval', 'Open')}
```

Also inspect the saved raw grid and history file: their task-number sets must agree with the selected report. Parse CSV using `csv.DictReader`, not physical line counting, because History contains embedded newlines. Confirm report retrieval time corresponds to this successful run, especially after a failed same-day retry.

Summarize counts and dates, list selected tasks, highlight overdue dates, and provide full Markdown/CSV attachments. In Hermes desktop use `MEDIA:` followed by the exact absolute path. Do not substitute local Markdown image links for file delivery.

## 5. Exact UI control reference

| Action | Element ID / selector | Value or condition |
|---|---|---|
| Username | `#txtLogin` | Saved identifier |
| Password | `#txtPassword` | Vault fill only |
| Submit login | `#btnLogin1` | Click |
| List | `#MainContent_btnList1` | Click and wait for async response |
| Department | `#MainContent_ddlDept1` | `32` |
| PIC | `#MainContent_ddlPic1` | `3220` |
| Start | `#MainContent_txtFrom` | First previous-month date |
| End | `#MainContent_txtTo` | Last next-month date |
| Origin | `#MainContent_ddlAsal1` | Empty value |
| Status | `#MainContent_ddlStatus1` | Empty value; select requested statuses after capture |
| Preview | `#MainContent_btnPreview` | Click |
| Grid | Table containing `th` text `TaskNo` | Capture row-own `cells` |
| Info | `#MainContent_lst_info_<index>` | Read-only target panel |
| Info panel | `#MainContent_PanelModalTarget` | Visible and includes correct TaskNo |
| Close Info | `#MainContent_btnClose` | Click and confirm hidden |

Do not confuse `MainContent_btnClose` with `MainContent_btnCloseModal` or generic `.modal` containers. The successful history capture used the named panel.

## 6. Offline tests

Use the terminal tool with working directory `C:/Workspace/pesautomation`:

```bash
python test_pes_automation.py
```

For this host's task automation, temporary files should use the Hermes scratch directory. The verification run explicitly sets `TMPDIR`, `TEMP` and `TMP` to `C:/Users/it26/AppData/Local/hermes/cache/scratch` rather than depending on the shell's inherited system-temp setting.

Offline tests do not require website authentication and do not contact PES. They consume the real fixtures under `evidence/`. They check fixed historical expectations; they are not a monitor for the user's current task count.

## 7. Recovery playbook

| Symptom | Safe recovery |
|---|---|
| Real Brave profile locked | Use the fresh browser context and Vault login. Do not close the user's browser without approval. |
| Login page after earlier success | Inspect current state and authenticate again through Vault. |
| `Page.navigate` or `Runtime.evaluate` timeout | Inspect browser targets; reattach with `ensure_real_tab`; read current state before repeating any action. |
| Old form still present immediately after List | Wait for ASP.NET async postback plus expected selector, not just document load. |
| PIC option missing | Verify department value and wait for its postback; do not select from stale options. |
| No generic modal found | Inspect `MainContent_PanelModalTarget` directly. |
| History task number mismatched | Stop; do not associate the panel with the requested task by row position alone. |
| Detected server pagination | Runner stops; implement and verify all-page support before claiming completeness. |
| Empty grid timeout | Inspect the actual response; do not convert timeout into a zero-task result. |
| Partial history files after failure | Treat as incomplete. Preserve evidence and rerun after resolving the cause. |
| Same-day old finished report remains | Compare completion result, timestamp and current raw data; do not deliver stale output as the new run. |

## 8. Repeatability and archival

The current implementation writes `reports/<local date>/` and overwrites same-day files. Preserve a previous day's directory or copy a completed run to a uniquely timestamped archive before rerunning if immutable multi-run history is required. A run-ID/atomic-output improvement is proposed but not implemented.

No recurring execution is configured. A future schedule requires a user request plus proven unattended Vault/browser availability. The current successful workflow should not be described as an unattended job.
