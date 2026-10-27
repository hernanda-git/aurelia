import fs from 'node:fs';
import { dirname, basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { compareSnapshots, defaultSettings, parsePesDate, sanitizeLog, validateSnapshot } from '../shared/domain';
import type { Activity, AppState, Settings, Snapshot, SyncState } from '../shared/types';

export function createInitialState(): AppState {
  return { schemaVersion: 1, snapshot: null, preferences: {}, focusTaskId: null,
    settings: { ...defaultSettings }, activities: [], lastAttemptAt: null, lastError: null,
    connection: 'unknown', sync: { phase: 'idle', message: 'Belum ada sinkronisasi.' } };
}
function settings(value: Settings): Settings {
  if (!value || typeof value !== 'object' || Object.keys(value).some(key => !['theme', 'timezone', 'compact'].includes(key)) || !['dark', 'light', 'system'].includes(value.theme) || typeof value.compact !== 'boolean' || typeof value.timezone !== 'string' || !value.timezone.trim()) throw new Error('Invalid settings');
  new Intl.DateTimeFormat('en', { timeZone: value.timezone });
  return { theme: value.theme, timezone: value.timezone, compact: value.compact };
}
function taskId(id: unknown): string {
  if (typeof id !== 'string' || !id.trim() || id !== id.trim() || id.length > 500 || ['__proto__', 'prototype', 'constructor'].includes(id)) throw new Error('Invalid task id');
  return id;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid state object');
  return value as Record<string, unknown>;
}
function logText(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid log text');
  return sanitizeLog(value);
}
function instant(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid timestamp');
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!m || parsePesDate(m[1]) !== m[1] || +m[2] > 23 || +m[3] > 59 || +m[4] > 59 || (m[5] && (+m[5] > 23 || +m[6] > 59)) || !Number.isFinite(Date.parse(value))) throw new Error('Invalid timestamp');
  return value;
}
function nonnegative(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Invalid progress count');
  return value;
}
function connection(value: unknown): AppState['connection'] {
  if (value !== 'unknown' && value !== 'connected' && value !== 'login-required') throw new Error('Invalid connection');
  return value;
}
const phases = ['idle', 'connecting', 'authenticating', 'filtering', 'reading', 'details', 'validating', 'saving', 'success', 'cancelled', 'failed'];
const activePhases = ['connecting', 'authenticating', 'filtering', 'reading', 'details', 'validating', 'saving'];
function syncState(value: unknown): SyncState {
  const s = object(value);
  if (typeof s.phase !== 'string' || !phases.includes(s.phase)) throw new Error('Invalid sync phase');
  const result: SyncState = { phase: s.phase as SyncState['phase'], message: logText(s.message) };
  if (s.runId !== undefined) result.runId = logText(s.runId);
  if (s.completed !== undefined) result.completed = nonnegative(s.completed);
  if (s.total !== undefined) result.total = nonnegative(s.total);
  if (result.completed !== undefined && result.total !== undefined && result.completed > result.total) throw new Error('Invalid sync progress');
  return result;
}
function activity(value: unknown): Activity {
  const a = object(value);
  if (!['info', 'success', 'warning', 'error'].includes(a.level as string) || !['sync', 'connection', 'local', 'export', 'system'].includes(a.category as string)) throw new Error('Invalid activity');
  const result: Activity = { id: taskId(a.id), at: instant(a.at), level: a.level as Activity['level'], category: a.category as Activity['category'], message: logText(a.message) };
  if (a.detail !== undefined) result.detail = logText(a.detail);
  if (a.stage !== undefined) result.stage = logText(a.stage);
  if (a.runId !== undefined) result.runId = logText(a.runId);
  if (a.durationMs !== undefined) {
    if (typeof a.durationMs !== 'number' || !Number.isFinite(a.durationMs) || a.durationMs < 0) throw new Error('Invalid activity duration');
    result.durationMs = a.durationMs;
  }
  return result;
}
function appState(value: unknown): AppState {
  const s = object(value);
  if (s.schemaVersion !== 1) throw new Error('Invalid state schema version');
  const prefs = object(s.preferences);
  const preferences = Object.fromEntries(Object.entries(prefs).map(([key, pref]) => {
    taskId(key); const p = object(pref);
    if (typeof p.pinned !== 'boolean') throw new Error('Invalid task preference');
    return [key, { pinned: p.pinned }];
  }));
  if (!Array.isArray(s.activities)) throw new Error('Invalid activities');
  const activities = s.activities.map(activity);
  if (new Set(activities.map(a => a.id)).size !== activities.length) throw new Error('Duplicate activity id');
  return {
    schemaVersion: 1, snapshot: s.snapshot === null ? null : validateSnapshot(s.snapshot), preferences,
    focusTaskId: s.focusTaskId === null ? null : taskId(s.focusTaskId), settings: settings(object(s.settings) as unknown as Settings),
    activities: activities.slice(-1000), lastAttemptAt: s.lastAttemptAt === null ? null : instant(s.lastAttemptAt),
    lastError: s.lastError === null ? null : logText(s.lastError), connection: connection(s.connection), sync: syncState(s.sync),
  };
}
// One synchronous owner in Electron's main event loop. This is not a
// cross-process database/lock. File fsync precedes same-directory rename.
// Corrupt files are COPIED to a unique .corrupt-*.bak and startup throws;
// the original is preserved. Recovery is explicit: inspect/restore the backup.
// No directory fsync is promised on Windows, nor sudden-power-loss durability
// beyond the platform's file-fsync/rename guarantees.
export class Store {
  private state: AppState;
  constructor(private readonly filePath: string, initial?: AppState) {
    let raw: string | undefined;
    try { raw = fs.readFileSync(filePath, 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    let loaded: AppState;
    if (raw === undefined) loaded = appState(initial ?? createInitialState());
    else {
      try { loaded = appState(JSON.parse(raw)); }
      catch {
        const backup = `${filePath}.corrupt-${Date.now()}-${randomUUID()}.bak`;
        try { fs.copyFileSync(filePath, backup, fs.constants.COPYFILE_EXCL); }
        catch { throw new Error('Corrupt state; backup failed. Original file preserved.'); }
        throw new Error(`Corrupt state; backup saved to ${backup}. Original file preserved; explicit recovery required.`);
      }
    }
    if (activePhases.includes(loaded.sync.phase)) loaded.sync = { phase: 'idle', message: 'Sinkronisasi sebelumnya terhenti. Jalankan ulang secara manual.' };
    loaded.connection = 'unknown';
    this.state = loaded;
    this.persist(loaded);
  }
  getState(): AppState { return structuredClone(this.state); }
  private persist(next: AppState): AppState {
    const encoded = JSON.stringify(next, null, 2) + '\n';
    const dir = dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    const temp = join(dir, `.${basename(this.filePath)}.${randomUUID()}.tmp`);
    let fd: number | undefined;
    let created = false;
    try {
      fd = fs.openSync(temp, 'wx', 0o600); created = true;
      fs.writeFileSync(fd, encoded, 'utf8');
      fs.fsyncSync(fd);
      fs.closeSync(fd); fd = undefined;
      fs.renameSync(temp, this.filePath);
    } catch (error) {
      if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* Preserve original failure. */ } }
      if (created) { try { fs.unlinkSync(temp); } catch { /* Preserve original failure. */ } }
      throw error;
    }
    this.state = next;
    return this.getState();
  }
  appendEvent(event: Omit<Activity, 'id' | 'at'>): AppState {
    const next = activity({ ...object(event), id: randomUUID(), at: new Date().toISOString() });
    return this.persist({ ...this.getState(), activities: [...this.state.activities, next].slice(-1000) });
  }
  clearActivities(): AppState { return this.persist({ ...this.getState(), activities: [] }); }
  setSync(sync: SyncState): AppState { return this.persist({ ...this.getState(), sync: syncState(sync) }); }
  setConnection(value: AppState['connection']): AppState { return this.persist({ ...this.getState(), connection: connection(value) }); }
  setLastAttempt(at: string, error: string | null = null): AppState {
    return this.persist({ ...this.getState(), lastAttemptAt: instant(at), lastError: error === null ? null : logText(error) });
  }
  commitSnapshot(snapshot: Snapshot): AppState {
    const validated = validateSnapshot(snapshot);
    validated.diff = compareSnapshots(this.state.snapshot, validated);
    return this.persist({ ...this.getState(), snapshot: validated });
  }
  updateSettings(patch: Partial<Settings>): AppState {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid settings patch');
    return this.persist({ ...this.getState(), settings: settings({ ...this.state.settings, ...patch }) });
  }
  togglePin(id: string): AppState {
    taskId(id);
    return this.persist({ ...this.getState(), preferences: { ...this.state.preferences, [id]: { pinned: !this.state.preferences[id]?.pinned } } });
  }
  setFocus(id: string | null): AppState {
    if (id !== null) taskId(id);
    return this.persist({ ...this.getState(), focusTaskId: id });
  }
}
