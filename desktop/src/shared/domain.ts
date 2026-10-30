import type { Settings, Snapshot, SnapshotDiff, Task } from './types';

const PIC = 'MUHAMMAD HERNANDA';
const TASK_FIELDS = ['TaskNo', 'TglInput', 'Pic', 'Jabatan', 'DeptName', 'TaskName', 'GoalTask', 'AsalTask', 'Bobot', 'Target', 'Duedate', 'Status', 'TglApproval', 'TglSelesai', 'Lampiran'] as const;
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label}`);
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, nonempty = false): string {
  if (typeof value !== 'string' || (nonempty && !value.trim())) throw new Error(`Invalid ${label}`);
  return value;
}
function count(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${label}`);
  return value;
}
function timestamp(value: unknown): string {
  const s = text(value, 'retrievedAt');
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(s);
  if (!m || parsePesDate(m[1]) !== m[1] || +m[2] > 23 || +m[3] > 59 || +m[4] > 59 || (m[6] && (+m[6] > 23 || +m[7] > 59)) || !Number.isFinite(Date.parse(s))) throw new Error('Invalid retrievedAt timestamp');
  return s;
}
export function validateSnapshot(value: unknown): Snapshot {
  const s = record(value, 'snapshot');
  const id = text(s.id, 'snapshot id', true);
  if (s.source !== 'live' && s.source !== 'imported') throw new Error('Invalid snapshot source');
  const retrievedAt = timestamp(s.retrievedAt);
  const raw = record(s.scope, 'scope');
  const from = text(raw.from, 'scope.from'), to = text(raw.to, 'scope.to');
  if (parsePesDate(from) !== from || parsePesDate(to) !== to || from > to) throw new Error('Invalid scope dates');
  if (raw.pic !== PIC) throw new Error('Invalid scope PIC');
  const scope = { from, to, pic: PIC, department: text(raw.department, 'scope.department', true) };
  const totalScanned = count(s.totalScanned, 'totalScanned');
  if (!Array.isArray(s.tasks) || totalScanned < s.tasks.length) throw new Error('Invalid tasks/counts');
  const keys = new Set<string>();
  const tasks = s.tasks.map((value): Task => {
    const rawTask = record(value, 'task');
    const fields = Object.fromEntries(TASK_FIELDS.map(key => [key, text(rawTask[key], `task.${key}`)]));
    const key = text(fields.TaskNo, 'TaskNo', true);
    if (key !== key.trim() || keys.has(key)) throw new Error('Duplicate or invalid TaskNo');
    keys.add(key);
    if (fields.Pic !== PIC) throw new Error('Invalid task PIC');
    if (!['Approval', 'Open', 'Update Task', 'Selesai', 'Solved'].includes(fields.Status as string)) throw new Error('Invalid task status');
    const h = record(rawTask.history, 'task history');
    const history: Task['history'] = { text: text(h.text, 'history.text', true) };
    const historyId = history.text.match(/(?:^|\n)\s*TaskNo\s*:\s*([^\r\n]+)/)?.[1].trim();
    if (historyId !== key) throw new Error('Target history identity mismatch');
    if (h.tables !== undefined) {
      if (!Array.isArray(h.tables) || !h.tables.every(table => Array.isArray(table) && table.every(row => Array.isArray(row) && row.every(cell => typeof cell === 'string')))) throw new Error('Invalid history tables');
      history.tables = structuredClone(h.tables) as string[][][];
    }
    const task = { ...fields, history } as Task;
    if (rawTask.Row !== undefined) task.Row = text(rawTask.Row, 'Row');
    return task;
  });
  const result: Snapshot = { id, source: s.source, retrievedAt, scope, totalScanned, tasks };
  if (s.sourceRows !== undefined) {
    if (!Array.isArray(s.sourceRows) || s.sourceRows.length !== totalScanned || !s.sourceRows.every(row => Array.isArray(row) && row.length === 16 && row.every(cell => typeof cell === 'string'))) throw new Error('Invalid source rows');
    const rowKeys = new Set<string>();
    const detailed = new Map(tasks.map(task => [task.TaskNo, task]));
    let activeRows = 0;
    for (const row of s.sourceRows as string[][]) {
      const key = row[1];
      if (!key.trim() || key !== key.trim() || rowKeys.has(key) || row[3] !== PIC) throw new Error('Invalid source row identity');
      rowKeys.add(key);
      if (detailed.has(key)) {
        activeRows++;
        const task = detailed.get(key)!;
        if (TASK_FIELDS.some((field, i) => !['Status', 'TglSelesai', 'Lampiran'].includes(field) && task[field] !== row[i + 1]) || (task.Row !== undefined && task.Row !== row[0])) throw new Error('Source row/detail mismatch');
      }
    }
    if (activeRows !== tasks.length) throw new Error('Source row/active count mismatch');
    result.sourceRows = structuredClone(s.sourceRows) as string[][];
  }
  if (s.diff !== undefined) {
    const diff = record(s.diff, 'snapshot diff');
    if (typeof diff.scopeChanged !== 'boolean') throw new Error('Invalid scopeChanged');
    result.diff = { added: count(diff.added, 'added'), changed: count(diff.changed, 'changed'), outOfScope: count(diff.outOfScope, 'outOfScope'), scopeChanged: diff.scopeChanged };
  }
  return result;
}
export function importedSnapshot(value: unknown): Snapshot {
  const report = record(value, 'report');
  if (report.source !== 'https://pes.grcboard.com/Modul/ISO/FormInputTask.aspx') throw new Error('Invalid report source');
  const snapshot = validateSnapshot({
    id: `imported:${text(report.retrieved_at, 'retrieved_at', true)}`, source: 'imported', retrievedAt: report.retrieved_at,
    scope: { from: report.date_from, to: report.date_to, pic: report.pic, department: report.department }, totalScanned: report.total_scanned, tasks: report.tasks,
  });
  const counts = record(report.counts, 'report counts');
  for (const status of ['Approval', 'Open']) if (count(counts[status], `counts.${status}`) !== snapshot.tasks.filter(t => t.Status === status).length) throw new Error('Report counts do not match tasks');
  return snapshot;
}
function meaningful(task: Task): string {
  return JSON.stringify([...TASK_FIELDS.map(key => task[key]), task.history.text, task.history.tables ?? null]);
}
export function compareSnapshots(previous: Snapshot | null, next: Snapshot): SnapshotDiff {
  const scopeChanged = previous !== null && ['from', 'to', 'pic', 'department'].some(key => previous.scope[key as keyof Snapshot['scope']] !== next.scope[key as keyof Snapshot['scope']]);
  const before = new Map(previous?.tasks.map(t => [t.TaskNo, t]) ?? []);
  const after = new Set(next.tasks.map(t => t.TaskNo));
  return {
    added: next.tasks.filter(t => !before.has(t.TaskNo)).length,
    changed: next.tasks.filter(t => before.has(t.TaskNo) && meaningful(before.get(t.TaskNo)!) !== meaningful(t)).length,
    outOfScope: scopeChanged ? 0 : [...before.keys()].filter(key => !after.has(key)).length,
    scopeChanged,
  };
}
export function sanitizeLog(value: string): string {
  return String(value)
    .replace(/\b(?:authorization|proxy-authorization|cookie|set-cookie)["']?\s*[:=]\s*[^\r\n]*/gi, '[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]')
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/(["']?(?:password|passwd|pwd|cookie|token|access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|secret|client[_-]?secret|authorization)["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s&;,}\r\n]+)/gi, '$1[REDACTED]')
    .slice(0, 4000);
}

export const defaultSettings: Settings = { theme: 'dark', timezone: 'Asia/Jakarta', compact: false };
const DAY = 86400000;
const pad = (n: number) => String(n).padStart(2, '0');
function civilMs(y: number, m: number, d: number): number {
  const date = new Date(0);
  date.setUTCFullYear(y, m - 1, d);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}
function iso(y: number, m: number, d: number): string { return `${String(y).padStart(4, '0')}-${pad(m)}-${pad(d)}`; }
export function parsePesDate(input: string): string | null {
  if (typeof input !== 'string') return null;
  const value = input.trim();
  let y: number, m: number, d: number;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) [, y, m, d] = match.map(Number);
  else {
    const pes = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(value);
    if (!pes) return null;
    const months: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, agu: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12 };
    y = Number(pes[3]); m = months[pes[2].toLowerCase()]; d = Number(pes[1]);
  }
  if (!(y >= 1 && y <= 9999 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const date = new Date(civilMs(y, m, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? iso(y, m, d) : null;
}
const formatters = new Map<string, Intl.DateTimeFormat>();
function localDate(now: Date, timezone: string): string {
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid current date');
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
    if (formatters.size > 64) formatters.clear();
    formatters.set(timezone, formatter);
  }
  const parts = formatter.formatToParts(now);
  const get = (type: string) => Number(parts.find(p => p.type === type)!.value);
  return iso(get('year'), get('month'), get('day'));
}
export function dateWindow(now: Date, timezone = defaultSettings.timezone): { from: string; to: string } {
  const [y, m] = localDate(now, timezone).split('-').map(Number);
  const from = new Date(civilMs(y, m - 1, 1));
  const to = new Date(civilMs(y, m + 2, 0));
  return { from: iso(from.getUTCFullYear(), from.getUTCMonth() + 1, 1), to: iso(to.getUTCFullYear(), to.getUTCMonth() + 1, to.getUTCDate()) };
}
export function deadlineInfo(input: string, now: Date, timezone: string): {
  kind: 'overdue' | 'today' | 'upcoming' | 'unknown'; days: number; label: string; remainingMs: number | null; dueIso: string | null; detail: string;
} {
  const today = localDate(now, timezone);
  const dueIso = parsePesDate(input);
  if (!dueIso) return { kind: 'unknown', days: 0, label: 'Tenggat tidak diketahui', remainingMs: null, dueIso: null, detail: 'Tanggal sumber tidak dapat dibaca.' };
  const due = Date.parse(`${dueIso}T00:00:00Z`);
  const delta = Math.round((due - Date.parse(`${today}T00:00:00Z`)) / DAY);
  // First instant outside the civil due date; DST days need not be 24 hours.
  let lo = due - 2 * DAY, hi = due + 3 * DAY;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (localDate(new Date(mid), timezone) <= dueIso) lo = mid + 1;
    else hi = mid;
  }
  const kind = delta < 0 ? 'overdue' : delta === 0 ? 'today' : 'upcoming';
  return {
    kind, days: Math.abs(delta), dueIso, remainingMs: Math.max(0, lo - now.getTime()),
    label: delta < 0 ? `Terlambat ${-delta} hari` : delta === 0 ? 'Jatuh tempo hari ini' : `${delta} hari lagi`,
    detail: `Tenggat tanggal ${dueIso}, hingga sebelum tengah malam berikutnya (${timezone}). Berdasarkan jam perangkat, bukan waktu server.`,
  };
}
