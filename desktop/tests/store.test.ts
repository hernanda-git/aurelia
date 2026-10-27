import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store, createInitialState } from '../src/main/store';
import { importedSnapshot } from '../src/shared/domain';
import type { AppState } from '../src/shared/types';
const report = JSON.parse(fs.readFileSync(new URL('../assets/seed.json', import.meta.url), 'utf8'));
const dirs: string[] = [];
function location() {
  const scratch = process.env.HERMES_TEST_TMPDIR ?? join(process.env.LOCALAPPDATA ?? tmpdir(), 'hermes', 'cache', 'scratch');
  fs.mkdirSync(scratch, { recursive: true });
  const dir = fs.mkdtempSync(join(scratch, 'pes-store-')); dirs.push(dir); return join(dir, 'nested', 'state.json');
}
function initial(): AppState { return { ...createInitialState(), snapshot: importedSnapshot(report) }; }
afterEach(() => { vi.restoreAllMocks(); for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

describe('runtime and activity boundaries', () => {
  it('adds real local activity IDs and timestamps, redacts all log text, and clears persisted history', () => {
    const file = location(); const store = new Store(file);
    const before = Date.now();
    const state = store.appendEvent({ level: 'error', category: 'sync', message: 'password=topsecret', detail: 'Cookie: SID=cookiesecret', runId: 'token=runsecret', stage: 'password=stagesecret', durationMs: 42 });
    const event = state.activities[0];
    expect(event.id).toBeTruthy(); expect(Date.parse(event.at)).toBeGreaterThanOrEqual(before); expect(Date.parse(event.at)).toBeLessThanOrEqual(Date.now());
    for (const secret of ['topsecret', 'cookiesecret', 'runsecret', 'stagesecret']) expect(fs.readFileSync(file, 'utf8')).not.toContain(secret);
    expect(event.durationMs).toBe(42);
    state.activities[0].message = 'outside mutation'; expect(store.getState().activities[0].message).not.toBe('outside mutation');
    expect(store.clearActivities().activities).toEqual([]); expect(new Store(file).getState().activities).toEqual([]);
  });
  it('retains the latest 1000 events and gives consecutive writes distinct IDs', () => {
    const seed = createInitialState();
    seed.activities = Array.from({ length: 1000 }, (_, i) => ({ id: `old-${i}`, at: '2026-10-26T00:00:00Z', level: 'info' as const, category: 'local' as const, message: String(i) }));
    const store = new Store(location(), seed);
    store.appendEvent({ level: 'success', category: 'sync', message: 'latest1' });
    const state = store.appendEvent({ level: 'info', category: 'local', message: 'latest2' });
    expect(state.activities).toHaveLength(1000); expect(state.activities[0].message).toBe('2');
    expect(state.activities.slice(-2).map(e => e.message)).toEqual(['latest1', 'latest2']);
    expect(new Set(state.activities.map(e => e.id)).size).toBe(1000);
  });
  it('persists truthful attempt/error and runtime status, then resets interrupted runtime on reopen', () => {
    const file = location(); const store = new Store(file, initial());
    const at = '2026-10-26T02:00:00Z';
    expect(store.setLastAttempt(at, 'token=attemptsecret').lastAttemptAt).toBe(at);
    expect(store.getState().lastError).not.toContain('attemptsecret');
    expect(store.setConnection('login-required').connection).toBe('login-required');
    const sync = { phase: 'reading' as const, message: 'password=syncsecret', completed: 2, total: 8, runId: 'run-1' };
    expect(store.setSync(sync).sync).toMatchObject({ phase: 'reading', completed: 2, total: 8 });
    sync.message = 'outside mutation'; expect(store.getState().sync.message).not.toContain('outside mutation');
    expect(fs.readFileSync(file, 'utf8')).not.toContain('syncsecret');
    const reopened = new Store(file).getState();
    expect(reopened.sync.phase).toBe('idle'); expect(reopened.sync).not.toHaveProperty('runId');
    expect(reopened.connection).toBe('unknown'); expect(reopened.lastAttemptAt).toBe(at); expect(reopened.snapshot!.retrievedAt).toBe(report.retrieved_at);
    expect(reopened.activities).toEqual([]);
    expect(store.setLastAttempt(at).lastError).toBeNull();
  });
  it.each(['connecting', 'authenticating', 'filtering', 'reading', 'details', 'validating', 'saving'] as const)('resets persisted connected auth and interrupted %s without inventing a historical event', phase => {
    const file = location(); const store = new Store(file, initial());
    store.setConnection('connected'); store.setSync({ phase, message: 'In progress', runId: 'interrupted' });
    const restarted = new Store(file).getState();
    expect(restarted.connection).toBe('unknown'); expect(restarted.sync.phase).toBe('idle');
    expect(restarted.sync).not.toHaveProperty('runId'); expect(restarted.activities).toEqual([]);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(restarted);
  });
  it('rejects malformed runtime writes before touching disk or memory', () => {
    const file = location(); const store = new Store(file); const before = store.getState(); const disk = fs.readFileSync(file, 'utf8');
    for (const fn of [
      () => store.setSync({ phase: 'fake', message: '' } as any), () => store.setSync({ phase: 'reading', message: 'x', completed: -1 }),
      () => store.setSync({ phase: 'reading', message: 'x', completed: 4, total: 3 }), () => store.setConnection('fake' as any),
      () => store.setLastAttempt('2026-02-30T00:00:00Z'), () => store.togglePin('__proto__'), () => store.setFocus(''),
      () => store.appendEvent({ category: 'local', level: 'fake', message: 'x' } as any),
      () => store.appendEvent({ category: 'fake', level: 'info', message: 'x' } as any),
      () => store.appendEvent({ category: 'local', level: 'info', message: 'x', durationMs: -1 }),
    ]) expect(fn).toThrow();
    expect(store.getState()).toEqual(before); expect(fs.readFileSync(file, 'utf8')).toBe(disk);
  });
  it.each(['{invalid json', JSON.stringify({ ...createInitialState(), schemaVersion: 2 }), JSON.stringify({ ...createInitialState(), activities: 'wrong' }), JSON.stringify({ ...createInitialState(), preferences: { x: { pinned: 'yes' } } })])('backs up corrupt state with explicit error and never silently replaces it: %s', contents => {
    const file = location(); fs.mkdirSync(join(file, '..'), { recursive: true }); fs.writeFileSync(file, contents);
    expect(() => new Store(file, initial())).toThrow(/corrupt.*backup/i);
    expect(fs.readFileSync(file, 'utf8')).toBe(contents);
    const backups = fs.readdirSync(join(file, '..')).filter(name => name.includes('.corrupt-'));
    expect(backups).toHaveLength(1); expect(fs.readFileSync(join(file, '..', backups[0]), 'utf8')).toBe(contents);
  });
});

describe('atomic Store', () => {
  it('creates an honest empty state without imported fake logs and persists the initial state', () => {
    const empty = createInitialState();
    expect(empty).toMatchObject({ schemaVersion: 1, snapshot: null, activities: [], preferences: {}, focusTaskId: null, lastAttemptAt: null, lastError: null, connection: 'unknown', sync: { phase: 'idle' } });
    const file = location(); const store = new Store(file, initial());
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(store.getState());
    expect(store.getState().snapshot?.retrievedAt).toBe(report.retrieved_at);
    expect(store.getState().activities).toEqual([]);
  });
  it('isolates initial, input and return objects from committed memory', () => {
    const seed = initial(); const store = new Store(location(), seed);
    seed.snapshot!.tasks[0].TaskName = 'outside mutation';
    const read = store.getState(); read.settings.compact = true; read.snapshot!.tasks[0].history.text = 'outside mutation';
    expect(store.getState().settings.compact).toBe(false);
    expect(store.getState().snapshot!.tasks[0].TaskName).not.toBe('outside mutation');
    expect(store.getState().snapshot!.tasks[0].history.text).not.toBe('outside mutation');
    const snapshot = importedSnapshot(report); store.commitSnapshot(snapshot); snapshot.tasks[0].TaskName = 'outside mutation';
    expect(store.getState().snapshot!.tasks[0].TaskName).not.toBe('outside mutation');
  });
  it('preserves local preferences and focus when tasks leave the latest snapshot', () => {
    const file = location(); const store = new Store(file, initial()); const id = report.tasks[0].TaskNo;
    expect(store.togglePin(id).preferences[id].pinned).toBe(true);
    store.setFocus(id); store.updateSettings({ compact: true, theme: 'light', timezone: 'America/New_York' });
    const snapshot = importedSnapshot(report); snapshot.tasks = []; snapshot.totalScanned = 0;
    const committed = store.commitSnapshot(snapshot);
    expect(committed.snapshot!.diff).toMatchObject({ outOfScope: report.tasks.length });
    expect(committed.preferences[id].pinned).toBe(true); expect(committed.focusTaskId).toBe(id);
    const reopened = new Store(file).getState();
    expect(reopened.preferences).toEqual(committed.preferences); expect(reopened.settings).toEqual(committed.settings); expect(reopened.focusTaskId).toBe(id);
    expect(store.togglePin(id).preferences[id].pinned).toBe(false);
    expect(store.setFocus(null).focusTaskId).toBeNull();
  });
  it('rejects an invalid snapshot without replacing last good memory or disk', () => {
    const file = location(); const store = new Store(file, initial()); const disk = fs.readFileSync(file, 'utf8'); const before = store.getState();
    const bad = importedSnapshot(report); bad.tasks.push(bad.tasks[0]);
    expect(() => store.commitSnapshot(bad)).toThrow();
    expect(store.getState()).toEqual(before); expect(fs.readFileSync(file, 'utf8')).toBe(disk);
  });
  it('uses same-directory exclusive temp writes and fsync before atomic rename; publishes only after success', () => {
    const file = location(); const store = new Store(file, initial()); const before = store.getState(); const disk = fs.readFileSync(file, 'utf8');
    const calls: string[] = []; const realSync = fs.fsyncSync;
    const sync = vi.spyOn(fs, 'fsyncSync').mockImplementation(fd => { calls.push('fsync'); realSync(fd); });
    const rename = vi.spyOn(fs, 'renameSync').mockImplementation(() => { calls.push('rename'); throw new Error('simulated rename denied'); });
    expect(() => store.updateSettings({ compact: true })).toThrow('simulated rename denied');
    expect(calls).toEqual(['fsync', 'rename']); expect(store.getState()).toEqual(before); expect(fs.readFileSync(file, 'utf8')).toBe(disk);
    expect(fs.readdirSync(join(file, '..'))).toEqual(['state.json']);
    rename.mockRestore(); sync.mockRestore();
    store.updateSettings({ compact: true }); expect(new Store(file).getState().settings.compact).toBe(true);
  });
  it('does not delete another writer\'s temp file when exclusive creation fails', () => {
    const file = location(); const store = new Store(file); const disk = fs.readFileSync(file, 'utf8'); const before = store.getState();
    const realOpen = fs.openSync; let foreign = '';
    vi.spyOn(fs, 'openSync').mockImplementation(((path: fs.PathLike, flags: string | number, mode?: fs.Mode) => {
      if (flags === 'wx') { foreign = String(path); fs.writeFileSync(path, 'foreign data'); throw Object.assign(new Error('collision'), { code: 'EEXIST' }); }
      return realOpen(path, flags, mode);
    }) as typeof fs.openSync);
    expect(() => store.setFocus('id')).toThrow('collision');
    expect(fs.readFileSync(foreign, 'utf8')).toBe('foreign data'); expect(fs.readFileSync(file, 'utf8')).toBe(disk); expect(store.getState()).toEqual(before);
  });
  it('handles fsync failure without losing the previous state or leaving a temp file', () => {
    const file = location(); const store = new Store(file); const disk = fs.readFileSync(file, 'utf8');
    vi.spyOn(fs, 'fsyncSync').mockImplementation(() => { throw new Error('simulated disk failure'); });
    expect(() => store.setFocus('task')).toThrow('simulated disk failure');
    expect(store.getState().focusTaskId).toBeNull(); expect(fs.readFileSync(file, 'utf8')).toBe(disk); expect(fs.readdirSync(join(file, '..'))).toEqual(['state.json']);
  });
  it('validates settings and rejects unknown fields without changing state', () => {
    const store = new Store(location()); const before = store.getState();
    for (const patch of [{ theme: 'neon' }, { compact: 'yes' }, { timezone: 'Bad/Zone' }, { timezone: '' }, { password: 'secret' }, { compact: undefined }]) expect(() => store.updateSettings(patch as any)).toThrow();
    expect(store.getState()).toEqual(before);
    expect(store.updateSettings({ theme: 'system' }).settings.theme).toBe('system');
  });
});
