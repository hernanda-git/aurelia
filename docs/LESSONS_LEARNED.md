# Lessons Learned — PES Extraction Session

[Documentation index](../README.md) · [Session record](01-SESSION-RECORD.md) · [Known limits](08-VERIFICATION-AND-LIMITATIONS.md)

## 1. Secure login is a prerequisite, not an obstacle to bypass

**Observed:** the initial Vault list was empty. Secure saving returned `prompt_unavailable`. The request contained a password, but generic typing tools were not an acceptable substitute.

**Resolution:** stop at the login boundary, explain what was not yet retrieved, ask the user to save the login, and continue only after confirmation and a fresh Vault list. The password was then filled through Vault at the correct origin.

**Reusable rule:** keep credential acquisition separate from extraction. Record the blocker without copying the secret into notes or source. A user-provided password in chat does not make chat a suitable credential store.

## 2. Local-browser mode may still use a fresh context

**Observed:** Brave was running and its profile was locked, preventing its login data from being copied. The tool used a fresh context.

**Resolution:** authenticate in the fresh context through Vault. Do not close the user's browser or risk unsaved tabs merely to reuse cookies.

**Boundary:** local-browser mode is not proof that existing user sessions are present. Inspect the actual page.

## 3. A navigation timeout is not proof navigation failed

**Observed:** `Page.navigate` and `Runtime.evaluate` timed out, while `Target.getTargets` showed the requested task page. There was no JavaScript dialog in the particular probe. `ensure_real_tab()` restored DOM access.

**Resolution:** inspect target state, reattach, read back. The runner's polling helper catches timeout-text runtime errors and reattaches before retrying the read.

**What is proven:** reattachment worked. **What is not proven:** the exact internal browser/daemon fault. Avoid asserting a specific framework bug or deterministic root cause unsupported by instrumentation.

**Improvement retained:** do not replay the previous click after a transport timeout; it may already have taken effect.

## 4. ASP.NET async updates outlive document-load waits

**Observed:** List was clicked, but an immediate inspection still returned Input Data selectors. Department selection similarly required waiting for the PIC options.

**Resolution:** poll the ASP.NET request manager and expected DOM conditions. Verify selected values after Preview.

**Remaining risk:** the implementation also uses fixed half-second sleeps and does not correlate a specific network response with each requested postback. Document the tested behavior, not an absolute timing guarantee.

## 5. The tool result's workspace is not an injected Python variable

**Observed:** persistence failed with `NameError` when using `Path(workspace)`.

**Resolution:** use `os.environ['BH_AGENT_WORKSPACE']` inside `browser_exec`. Durable user deliverables go to the explicit workspace rather than relying on a browser cache path.

**Consequence:** extraction was repeated only because the failed attempt did not save its data. Re-fetching after an uncertain state-changing action would require readback first.

## 6. Count each row's own cells

**Observed:** a descendant `querySelectorAll('td')` filter yielded eight rows, but the table/footer visibly contained more. Correcting the extraction to use `r.cells` yielded 32 rows, all with 16 own cells.

**Resolution:** capture direct row cells, persist all rows, deduplicate by literal task number, and compute status counts in Python.

**Reusable rule:** a plausible selected-task count is not evidence that the full scan is complete. Compare against table structure and excluded-status rows. The attachment-rich markup is a likely explanation of the descendant-count mismatch, not a fully proven renderer analysis.

## 7. Generic modal selectors miss named panels

**Observed:** after Info was clicked, visible `.modal` results were empty. The specific `MainContent_PanelModalTarget` was visible and contained the expected task.

**Resolution:** ground extraction on the actual named panel, inspect its controls, wait for the correct task number and close through its own Close control.

**Safety gain:** selecting Info rather than management/upload actions kept the extraction within its read-only scope.

## 8. List status and workflow history are separate facts

**Observed:** all eight selected tasks had list `Status=Approval`, while each history target row displayed `Verifikasi`.

**Resolution:** preserve both values with their source context. The report selection follows the requested list status. Do not infer that the user asked for Verifikasi or that one field overwrites the other.

## 9. Calendar boundaries are not fixed day offsets

**Observed requirement:** previous-month first through next-month last.

**Resolution:** use `datetime.date` and `calendar.monthrange`, with regression cases for October, January, leap February and December.

**Do not:** implement a fixed 90-day interval or rely on the model to calculate dates mentally. Use tools for date and arithmetic verification.

## 10. Parse CSV records, not lines

**Observed design:** CSV includes full multi-line history text in one quoted field.

**Resolution:** use `csv.DictReader` to count records. Eight tasks can occupy many physical text lines. UTF-8 BOM improves compatibility with common spreadsheet applications, but the session did not include a manual Excel import test.

## 11. Browser state can reset during a session

**Observed:** a later attempt returned to login and target inspection showed a different browser-context identifier.

**Resolution:** authenticate again through the same Vault procedure. Do not assume a prior successful login remains valid indefinitely.

**Not established:** a particular idle-duration limit, the trigger for the reset, or a PES authentication policy.

## 12. Keep red, green and live evidence distinct

The date and export tests were written before their implementations, observed failing, then observed passing. The live runner was first asserted absent, then implemented and exercised. A temporary editing mistake removed the exporter return and was corrected before final checks.

Two offline tests passing does not prove login, browser selectors, timeout handling, pagination or unattended operation. Those are separate claims. Original live Home-to-report verification is real session evidence; copied-source offline verification is a new local check, not a second live extraction.

## 13. Preserve evidence before relocating a workflow

The documentation request named a new workspace. The original Documents directory contained tested artifacts and was left intact. Byte-identical copies were preserved under `source/original/`, working reference copies were placed at the new root, and hashes recorded their relationship.

Historical READMEs and the skill snapshot keep their original paths. Canonical docs use the new workspace. Do not rewrite evidence merely to make old instructions look current.

## 14. Do not overstate completeness or hardening

Current code has specific boundaries:

- detects only one recognizable server-pager pattern;
- does not implement page traversal;
- does not positively represent an empty grid as a successful zero result;
- uses assertions for several data-integrity guards;
- writes same-day outputs nonatomically;
- requires browser helper injection and external login;
- uses locale-sensitive `%b` due-date parsing after selected abbreviation replacements;
- has no scheduler, standalone CLI or automated browser CI.

These are documented limitations, not silent fixes in a documentation-only pass.

## 15. Documentation validators must distinguish code from prose

The first workspace validation passed the data, integrity, secret and structure checks but reported four broken Markdown links. Inspection showed all four were false positives: the regex treated Python `ns['run'](globals(), ...)` examples inside fenced code as Markdown links targeting `globals(`.

The validator was corrected to strip fenced and inline code before scanning prose links. Historical source examples were not rewritten to satisfy a broken validator. The failing validation was observed before this correction; the final validation result is stored in `verification/validation.json`.

## 16. Final verified state and retained improvements

The completed original session extracted 32 grid rows, selected eight Approval tasks, found no Open tasks, read all eight histories, and generated a verified ten-entry original ZIP. The tested module includes calendar handling, exact filter readback, selected-status filtering, matching-history checks, duplicate checks, partial history persistence, timeout readback recovery, CSV-leading-character protection and explicit detected-pagination refusal.

The documentation handoff adds canonical guides, provenance, reproducible validation logs and an updated future-use skill pointer. It does not claim new task data or unimplemented production guarantees.
