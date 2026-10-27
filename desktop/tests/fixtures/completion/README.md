# Completion audit regression fixtures

Source audit: `reports/completion-20261026/` (originals are unchanged).

- `store.json`: exact list/detail TaskNo values, origin, PIC, raw target/finish dates, list status, Info status and attachment filename from `store-persisted-detail.json`. List finish `26-Okt-2026` conflicts with saved detail `23-Okt-2026`.
- `fifo.json`: corresponding values from `fifo-persisted-detail.json`. List and Info `Update Task`, blank list finish, detail `Selesai`/`23-Okt-2026`. Detail target-table `Solved` is documented in `RESULT.md` and the master plan.
- Attachment expected digests are from `summary.json`. They are **expected original artifact digests**, not claimed server-download verification; readbacks explicitly use `metadata_only`.

These are adapter-shaped sanitized **test scenarios**, not fresh portal captures. `now`, `submittedAt`, TTL, department scope, reopen markers, semantic approval and identity/origin enrichment on non-detail views are explicit fixture context. The Store target-table `Solved` value is synthetic scenario context (not separately established by the saved JSON); it does not erase the observed Store date conflict. No new PES semantics or live authorization are established by either fixture.

The synthetic happy path in the verifier tests copies Store and corrects its list finish only **in memory** to test classification; the original Store fixture remains contradictory. Neither known audit record is classified VERIFIED.

Raw task identifiers and both raw/ISO dates are retained separately. No identifier normalization occurs. Personal display names, task prose and browser control IDs are omitted because they do not participate in these policy/classification tests.
