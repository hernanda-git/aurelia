# Context Briefing: Aurelia (Personal Agentic Task Management)

This is a read-only context briefing to establish project knowledge. Do not execute commands, make edits, or perform actions. Simply acknowledge this state and stand by for instructions.

---

## 1. Project & Repository
- **Workspace root:** `C:\Workspace\pesautomation`
- **Application path:** `C:\Workspace\pesautomation\desktop`
- **Git repository:** `https://github.com/hernanda-git/aurelia.git` on branch `main`
- **Application name:** `Aurelia` (desktop agentic task management)
- **Built executable:** `C:\Workspace\pesautomation\desktop\release\Aurelia-win32-x64\Aurelia.exe`
- **Launcher shortcut:** `C:\Workspace\pesautomation\Open Aurelia.cmd`
- **Stack:** Electron 45, React 19, TypeScript, Vite, Vitest, Playwright

---

## 2. Architecture & Data Systems

### A. PES System
- Manages PES tasks cached locally in `%APPDATA%\PES Focus\workspace.json` (or `PES_FOCUS_DATA_DIR`).
- Live sync via `PesPortal` + `SyncCoordinator` against the official PES portal.
- **Task Detail:** Closed by default (center table takes 100% full width); opens on task row click; horizontally resizable via left drag handle; closable via `×` button or Escape.
- **Task Sorting:** Default order is descending date/time (`date-desc`, latest `TglInput` / due date first).

### B. Asana System
- **Scope:** Board `1208922858503175` (MSS Sprint Planning), workspace `1206737432461724` (1000saudara.com), strictly scoped to `IT PIC = HERNANDA MSS` (`1208878911420813: 1214725811552235`).
- **Live Sync Engine:** `taskbridge` CLI (`C:\Users\it26\source\repos\taskbridge\.venv\Scripts\taskbridge.exe`) with config at `C:\Workspace\asana-pes-sync\config\config.toml` pulling into SQLite catalog `C:\Workspace\asana-pes-sync\data\taskbridge.db`.
- **Dynamic Live Sync:** Wired through `desktop\src\main\asana-sync.ts` and `desktop\src\main\asana-store.ts`. Triggered in UI via `Sinkronkan` button or `Ctrl+R`. Sync completions log to Aurelia's workspace activity ledger (`category: 'sync'`).
- **Asana UI Layout (`desktop\src\renderer\asana\AsanaPanel.tsx`):**
  1. **Section Order:** Strictly ordered:
     1. `Unset`
     2. `In-Progress`
     3. `Ready to QA`
     4. `User/PO Testing`
     *(followed alphabetically by remaining statuses)*
  2. **Collapsible Filters:** Search row includes a `Filters` toggle button with active filter badge. Filter dropdowns and saved views are collapsed (`display: none`) by default to keep the UI clean.
  3. **Table Columns (7 columns):**
     `Task` | `IT PIC` | `Progress` | `Last Modified Date` | `Due Date` | `IT Start Date` | `IT End Date`
  4. **Row Descriptions:** Each task row renders the description (`t.notes || t.goal`) under the task title with a 2-line clamp (`.asana-row-desc`).
  5. **Task Detail:** Closed by default (table takes full width). Opens on task click. Horizontally adjustable with drag handle (`.detail-resize-handle`), double-click reset (360px), and keyboard arrow adjustments. Closable via `×` or Escape.
  6. **Detail Sections:** Every section inside task detail is collapsible via `DetailSection`. By default:
     - **Hidden/Collapsed:** `Memberships`, `Custom fields · raw display values`, `Parent reference`.
     - **Open/Visible:** `Overview`, `Goal`, `Dates & freshness`, `Komentar & lampiran`.
  7. **Real IT Dates:** `itStartDate` and `itEndDate` are parsed directly from Asana custom fields (`display_value ?? date_value?.date ?? text_value`) and formatted as civil dates (`14 Okt 2026`).
  8. **Default Sort:** Descending date/time (`modified`, latest modified/due/seen first).

### C. Left Sidebar Menu
- Hero logo (`.brand-hero-logo`) touches the top border edge-to-edge with no gap or corner radius.
- Vertical scroll extent is clamped via `onScroll` to the exact height of the logo image (`logo.offsetHeight`, ~143px), so scrolling down only moves the image out of view, parking the bold `Aurelia` text at the top boundary without any excessive blank void at the bottom.
- Footer displays dynamic live connection status (`Terhubung ke PES` on PES, `Terhubung ke Asana` on Asana) and user identity (`Muhammad Hernanda / IT Mitra Seribu Saudara`).

---

## 3. Test Suites & Verification Status
- `node tests/desktop.e2e.cjs`: 32/32 checks pass.
- `node tests/asana.desktop.e2e.cjs`: 10/10 checks pass.
- `npx vitest run tests/asana-*.test.ts`: 37/37 tests pass.
- `npm run typecheck`: 0 errors.
- Packaged build `desktop\release\Aurelia-win32-x64\Aurelia.exe` is up to date and verified.
