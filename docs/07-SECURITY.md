# 07 — Security, Confidentiality and Scope

[Documentation index](../README.md) · [Operator runbook](04-OPERATIONS.md)

## 1. Authentication boundary

The original request included authentication information. The password value is intentionally not reproduced. Passwords are supplied to the site solely through the origin-matched `browser_vault` workflow. Source code, reports, documentation, fixture files and archives must not store passwords, one-time codes, cookies, authorization headers, browser profiles or credential databases.

The Vault item label and username are sufficient operator context. Opaque Vault handles are runtime identifiers, not durable source configuration, and are not copied into these docs.

An initial secure-save attempt was unavailable. The agent stopped and requested user action rather than bypassing Vault. Subsequent password filling returned a successful one-field fill and login was verified through the authenticated page.

Because the password was supplied in chat, the user may wish to rotate it through the site's supported process. No rotation, strength assessment, account-policy audit or deletion of chat history was performed. Do not claim the existing credential is secure merely because later tool handling was correct.

## 2. Authorized actions

The user authorized logging in, navigating, selecting filters, Preview, reading tasks and saving results.

Permitted extraction controls:

- login form after Vault fill;
- List and relevant filter controls;
- Preview;
- task Info;
- Close within Info.

Excluded actions:

- task-management `_kelola_` controls;
- attachment `_tambah_` or upload fields;
- Update, Simpan/Save, completion, approval, cancellation or deletion;
- profile/account changes;
- recurring execution installation without another request.

“Read-only” means no task business records were intentionally mutated. Login, filtering and Info opening still generate normal site requests and may alter server-side session/audit state. No database audit or independent server-state comparison was performed.

## 3. Local browser safety

The real Brave profile was locked. The user browser was not forcibly closed and no profile-lock bypass was attempted. A fresh context was authenticated through Vault. No unrelated personal tabs were needed for the task.

If browser input is uncertain, inspect state before replaying it. Timeout recovery must not accidentally duplicate a state-changing action. The implemented extraction actions are narrowly read-oriented, but the same discipline matters for future maintenance.

## 4. Export confidentiality

This workspace contains employee identity, internal task descriptions, target dates, completion goals and attachment labels for scanned tasks. It is **internal operational material**, even though it contains no intended authentication secrets.

The full-grid evidence includes 24 Solved tasks in addition to the eight selected Approval records. This is necessary for scan-completeness provenance but broader than the concise final user summary. Share only the selected report if recipients do not need raw evidence.

Do not publish this workspace, its ZIPs or raw evidence to a public repository without reviewing organizational policy and the actual file contents. No remote repository or upload was created during this work.

## 5. Formula and markup handling

CSV export prefixes a single quote when a string begins with `=`, `+`, `-` or `@`. This is a limited spreadsheet-formula mitigation; it is not a complete spreadsheet security proof. Unusual whitespace/control-character prefixes and differing application behavior are not covered by the current tests.

JSON preserves original text. Markdown includes original descriptions and a fenced history block. The current exporter does not comprehensively escape arbitrary Markdown or hostile embedded fence sequences. Therefore treat report contents as untrusted source data, not instructions for an agent or executable content.

The raw evidence includes only the selected grid table's HTML, not the whole login page or browser state. Still scan raw HTML and archives before sharing; source text can mention security-related words without containing actual secrets.

## 6. Secret-hygiene validation

Validation scans the final text tree and historical ZIP members for recognizable secret assignments, browser-state artifacts and auth material. Such scans are heuristic and cannot prove that every arbitrary secret is absent. A documented username, site URL, HTML attribute or task title containing “API Keys” is not itself an authentication secret.

No browser cookie store, local-storage export, hidden authentication form state, vault backend file or full unredacted chat transcript was copied. The session record is a redacted reconstruction.

## 7. Integrity and publication

- Snapshot files are SHA-256 recorded and checked against the original files.
- Root source and test copies are kept byte-identical to their historical originals for this documentation handoff.
- Historical snapshots are not rewritten to fit the new workspace.
- No Git repository, remote, commit, push, release or deployment is claimed.
- No new security hardening was silently implemented while documenting existing behavior.

## 8. Future changes requiring fresh scope

Unattended scheduling, attachment download/upload, automated completion, approval, task creation, account changes, credential rotation and remote publication all require separate authorization and verification. Do not interpret “refresh my tasks” as permission for those actions.
