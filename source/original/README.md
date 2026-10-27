# PES task extraction

Read-only automation for MUHAMMAD HERNANDA (PIC 3220), department IT Mitra Seribu Saudara (32).

## Output

Dated folders under `reports/YYYY-MM-DD/` contain:
- `pes_tasks.md`: full readable task details and target history.
- `pes_tasks.csv`: spreadsheet-compatible details, including full history text.
- `pes_tasks.json`: structured report, counts, filter values and history tables.
- `pes_filtered_raw.json`: all grid rows inspected, including excluded statuses, for audit.
- `pes_task_histories.json`: target-history panels for each selected task.

The date range is calculated on every run using the machine's local date: first day of the previous month through the last day of the next month. Only exact list statuses `Approval` and `Open` are included. History status is preserved separately; the history panel can say `Verifikasi` while the list says `Approval`.

No password is stored in this folder. No task is created, edited, approved, completed, uploaded to, or deleted. No recurring schedule has been installed.

## Run through Hermes

This script depends on the Hermes `browser_exec` helper environment; it is not a standalone Selenium/Playwright program.

1. Open `https://pes.grcboard.com/Default.aspx` with `browser_exec(local=True)`. If already authenticated, keep that session.
2. If login is needed, call `browser_vault` with `action=list`. Fill `#txtLogin` with the saved identifier using `fill_input`, then use `browser_vault(action=fill, handle=...)` for the password. Click `#btnLogin1`. Never put the password in code or chat.
3. Run this inside `browser_exec(local=True)`:

```python
import pathlib
ns = {}
source = pathlib.Path('C:/Users/it26/Documents/PES-Automation/pes_automation.py')
exec(compile(source.read_text(encoding='utf-8'), str(source), 'exec'), ns)
result = ns['run'](globals(), 'C:/Users/it26/Documents/PES-Automation/reports')
print(result)
```

4. Read the exported JSON, verify the counts and unique task identifiers, and deliver Markdown/CSV to the user.

The automation navigates to the task page, opens List, sets department and PIC, resets origin/status filters, sets the date range, clicks Preview, verifies the filter readback, captures all grid rows and reads each selected task's Info panel.

## Verification

Run from this directory through the terminal tool:

```bash
python test_pes_automation.py
```

Tests cover rolling month/year/leap-year boundaries and complete export against the real captured fixture in `evidence/`. A live authenticated browser run is required to verify current selectors and the website.

## Limits and recovery

- Login is through Hermes Vault, not through a password embedded in the script.
- Session expiry or a browser restart requires login again.
- The page uses asynchronous ASP.NET postbacks. The script waits for postback completion instead of immediately trusting stale DOM.
- A CDP timeout during navigation can occur after the page has loaded. The script reattaches and reads state; it does not repeat the previous action.
- Server-side pagination is not implemented: the script stops if a page-postback link is detected rather than claiming a partial report is complete. The verified current grid had all 32 rows in one DOM table.
- If there are no grid rows, the current script stops instead of claiming a verified empty report. Inspect the page manually before interpreting that as zero tasks.
- The report preserves Indonesian display dates and original task identifiers. Do not rewrite them as inferred tickets or statuses.
- The grid date filter can include tasks created before the date range; do not add a separate client-side creation-date filter.
