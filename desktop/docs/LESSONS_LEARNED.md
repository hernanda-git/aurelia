# Desktop lessons — PES 0.2

## Preserve identity and user work

- Product branding and the profile's physical name are separate. Keep the legacy userData directory and persistent portal partition when changing the app name; otherwise an apparent rename can abandon the cache and sign-in storage. The packaged 0.2 app was exercised against the actual profile and all eight source tasks, preferences, focus, and settings were compared with the pre-update backup.
- Keep source and agent work separate. Hash/slug folder identifiers but retain literal TaskNo inside data. Never overwrite existing work files, infer completion from disappearance, or merge old grid evidence into a newer snapshot without provenance.
- Legacy selected-only snapshots must remain valid. A historical totalScanned of 32 does not mean 32 cached detailed tasks; disclose sourceRowsAvailable. New captures preserve raw rows separately from selected Info histories.

## Projection consistency and failure isolation

- Publish the agent index last and reference immutable generations. Convenience aliases can be ahead after a partial write; they are not a multi-file transaction.
- Optional projection initialization must be inside the same error boundary as projection writes. The first implementation let an unowned destination abort app startup. An actual Electron failing/passing regression now proves cached tasks remain available, the error is visible, unrelated files survive, and projection recovers after the collision is resolved.
- Refuse managed symlinks, junctions, hard links, and identity collisions. These checks are not protection against a hostile concurrent path-swap race; document the single-owner boundary.

## API and export regressions

- The pinned Electron clipboard APIs return promises. Await writes and reads before a success event or UI toast; verify copied agent context without reading agent-owned notes or unrelated prior clipboard contents.
- Adding complete raw rows also changes single-task export semantics. The first export included all 32 rows despite one selected task. A failing/passing desktop regression now checks one exported row, one task, and queryTotalScanned retained separately.
- Normalize historical generated interface messages only at presentation. Do not alter stored audit records, original TaskName/GoalTask, identifiers, or histories to satisfy a wording change.

## Verification and handoff

- Keep every automated test profile and its projected workspace isolated with PES_FOCUS_DATA_DIR. Run the actual packaged executable, not only development Electron.
- Read shortcut properties back through WScript.Shell after saving. Resolve Desktop/Programs via Windows known folders, avoid unrelated shortcut collisions, and use the real packaged exe as target.
- Distinguish an actual user's cache-preservation check from a fresh portal sync. The update preserved the 09:58 live snapshot; it did not reauthenticate or fetch newer tasks.
- A protected AGENTS.md write was denied after its approval prompt timed out. It was not retried or recreated through another route. The optional file is not part of the delivered feature; existing task data and the ordinary storage guide remain usable.
- Current machine-readable results are consolidated in verification/update-0.2-handoff.json. No new independent-review approval is claimed; prior final-source review deferral remains documented.
