import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { AgentWorkspace } from '../src/main/agent-workspace';
import { createInitialState } from '../src/main/store';
import { importedSnapshot } from '../src/shared/domain';
import type { AppState } from '../src/shared/types';
const report = JSON.parse(fs.readFileSync(new URL('../assets/seed.json', import.meta.url), 'utf8'));
const dirs: string[] = [];
function root() {
  const scratch = process.env.HERMES_TEST_TMPDIR ?? join(process.env.LOCALAPPDATA ?? tmpdir(), 'hermes', 'cache', 'scratch');
  fs.mkdirSync(scratch, { recursive: true }); const dir = fs.mkdtempSync(join(scratch, 'pes-agent-')); dirs.push(dir); return join(dir, 'workspace');
}
function initial(): AppState { return { ...createInitialState(), snapshot: importedSnapshot(report) }; }
function json(file: string) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
afterEach(() => { vi.restoreAllMocks(); for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
it('projects the real eight-task captured seed without inventing excluded rows or changing source strings', () => {
  const path = root(); const workspace = new AgentWorkspace(path); const state = initial();
  expect(workspace.write(state)).toMatchObject({ path, taskCount: 8, error: null });
  const index = json(join(path, 'index.json')); expect(index.tasks).toHaveLength(8);
  expect(index.totalScanned).toBe(32); expect(index.sourceRowsAvailable).toBe(false);
  for (const task of state.snapshot!.tasks) {
    const entry = index.tasks.find((t: any) => t.TaskNo === task.TaskNo);
    expect(entry).toMatchObject({ inCurrentScope: true, historyAvailable: true, activeSelected: true });
    expect(json(join(workspace.taskDir(task.TaskNo), 'source.json')).task).toEqual(task);
    expect(workspace.context(task.TaskNo)).toContain(task.history.text);
    expect(workspace.context(task.TaskNo)).toBe(fs.readFileSync(join(workspace.taskDir(task.TaskNo), 'TASK.md'), 'utf8'));
  }
  expect(() => workspace.taskDir('../unknown')).toThrow(/unknown/i);
  expect(() => workspace.context('unknown')).toThrow(/unknown/i);
  expect(new AgentWorkspace(path).info()).toMatchObject({ taskCount: 8, error: null });
});
it('rejects nonempty unowned roots instead of overwriting unrelated data', () => {
  const path = root(); fs.mkdirSync(path, { recursive: true }); fs.writeFileSync(join(path, 'README.md'), 'unrelated');
  expect(() => new AgentWorkspace(path).write(initial())).toThrow(/owned|marker/i);
  expect(fs.readFileSync(join(path, 'README.md'), 'utf8')).toBe('unrelated');
});
it('uses literal IDs with distinct safe deterministic paths and rejects an on-disk identity collision', () => {
  const path = root(); const state = initial(); const ids = ['../../CON', '..\\\\NUL', 'CON', 'a/b', 'a\\\\b', '__proto__'];
  state.snapshot!.tasks = ids.map(TaskNo => ({ ...state.snapshot!.tasks[0], TaskNo, history: { text: `TaskNo: ${TaskNo}\nfull original history` } }));
  const workspace = new AgentWorkspace(path); workspace.write(state);
  const paths = ids.map(id => workspace.taskDir(id)); expect(new Set(paths).size).toBe(ids.length);
  for (const [i, dir] of paths.entries()) {
    const rel = relative(path, dir); expect(isAbsolute(rel)).toBe(false); expect(rel.startsWith('..')).toBe(false);
    expect(json(join(dir, 'source.json')).task.TaskNo).toBe(ids[i]);
  }
  expect(new AgentWorkspace(path).taskDir(ids[0])).toBe(paths[0]);
  fs.writeFileSync(join(paths[0], 'source.json'), JSON.stringify({ task: { TaskNo: 'foreign task' } }));
  const index = fs.readFileSync(join(path, 'index.json'), 'utf8');
  expect(() => workspace.write(state)).toThrow(/collision|identity/i);
  expect(fs.readFileSync(join(path, 'index.json'), 'utf8')).toBe(index);
});
it.each(['root', 'tasks', 'work', 'source', 'notes', 'snapshot'])('rejects %s symlink/junction traversal without touching the outside target', kind => {
  const path = root(); const outside = root(); fs.mkdirSync(outside, { recursive: true });
  const state = initial(); const workspace = new AgentWorkspace(path); workspace.write(state);
  const dir = workspace.taskDir(state.snapshot!.tasks[0].TaskNo);
  const index = json(join(path, 'index.json'));
  const target = kind === 'root' ? path : kind === 'tasks' ? join(path, 'tasks') : kind === 'work' ? join(dir, 'work') : kind === 'source' ? join(dir, 'source.json') : kind === 'notes' ? join(dir, 'work', 'notes.md') : join(path, index.snapshotPath);
  const file = ['source', 'notes', 'snapshot'].includes(kind);
  fs.rmSync(target, { recursive: true, force: true });
  const destination = file ? join(outside, 'keep.json') : outside;
  if (file) fs.writeFileSync(destination, '{"outside":true}');
  try { fs.symlinkSync(destination, target, file ? 'file' : 'junction'); }
  catch (error) {
    if (!file || (error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
    // Windows without Developer Mode: exercise a real junction at the managed file path instead.
    fs.symlinkSync(outside, target, 'junction');
  }
  expect(() => workspace.write(state)).toThrow(/symlink|reparse/i);
  expect(fs.readdirSync(outside)).toEqual(file ? ['keep.json'] : []);
  if (file) expect(fs.readFileSync(destination, 'utf8')).toBe('{"outside":true}');
});
it('rejects tampered index paths when reopening rather than using arbitrary directories', () => {
  const path = root(); const state = initial(); const workspace = new AgentWorkspace(path); workspace.write(state);
  const index = json(join(path, 'index.json')); index.tasks[0].path = '../outside';
  fs.writeFileSync(join(path, 'index.json'), JSON.stringify(index));
  expect(() => new AgentWorkspace(path).taskDir(index.tasks[0].TaskNo)).toThrow(/path|index/i);
});
it('mirrors allowlisted state and bounded sanitized logs, not credentials or unknown runtime fields', () => {
  const path = root(); const state = initial(); const id = state.snapshot!.tasks[0].TaskNo;
  state.preferences[id] = { pinned: true }; state.focusTaskId = id;
  state.settings = { theme: 'light', timezone: 'Asia/Jakarta', compact: true };
  state.lastAttemptAt = '2026-10-26T00:00:00Z'; state.lastError = 'password=errorsecret';
  state.sync = { phase: 'failed', message: 'Cookie: syncsecret', runId: 'token=runsecret', completed: 3, total: 8 };
  state.activities = Array.from({ length: 1002 }, (_, i) => ({ id: String(i), at: '2026-10-26T00:00:00Z', level: 'error', category: 'sync', message: 'password=logsecret', detail: 'Bearer detailsecret', stage: 'token=stagesecret', runId: 'cookie=eventsecret', durationMs: 12 }));
  Object.assign(state, { password: 'topsecret', cookies: 'cookiesecret', browser: { session: 'browsersecret' } });
  Object.assign(state.settings, { password: 'settingsecret' });
  Object.assign(state.snapshot!, { cookie: 'snapshotsecret' });
  Object.assign(state.snapshot!.tasks[0], { password: 'tasksecret' });
  Object.assign(state.snapshot!.tasks[0].history, { session: 'historysecret' });
  Object.assign(state.preferences[id], { token: 'prefsecret' });
  Object.assign(state.activities[1001], { token: 'activitysecret' });
  const workspace = new AgentWorkspace(path); workspace.write(state);
  const current = json(join(path, 'current.json'));
  expect(current.settings).toEqual({ theme: 'light', timezone: 'Asia/Jakarta', compact: true });
  expect(current.preferences).toEqual({ [id]: { pinned: true } }); expect(current.focusTaskId).toBe(id);
  expect(current.activities).toHaveLength(1000); expect(current.activities[0].id).toBe('2');
  expect(current.activityRetention).toMatchObject({ limit: 1000, completeHistory: false });
  const index = json(join(path, 'index.json'));
  expect(index.tasks.find((t: any) => t.TaskNo === id)).toMatchObject({ pinned: true, focused: true });
  expect(json(join(path, index.currentPath))).toEqual(current);
  const readAll = (dir: string): string => fs.readdirSync(dir, { withFileTypes: true }).map(e => e.isDirectory() ? readAll(join(dir, e.name)) : fs.readFileSync(join(dir, e.name), 'utf8')).join('\n');
  const exported = readAll(path);
  for (const secret of ['topsecret', 'cookiesecret', 'browsersecret', 'settingsecret', 'snapshotsecret', 'tasksecret', 'historysecret', 'prefsecret', 'activitysecret', 'errorsecret', 'syncsecret', 'runsecret', 'logsecret', 'detailsecret', 'stagesecret', 'eventsecret']) expect(exported).not.toContain(secret);
  expect(fs.readFileSync(join(path, 'README.md'), 'utf8')).toMatch(/index.json/);
  expect(fs.readdirSync(path).some(name => /password|cookie|session|credential/i.test(name))).toBe(false);
});
it('publishes index last and retains a readable previous generation on projection failure', () => {
  const path = root(); const state = initial(); const workspace = new AgentWorkspace(path); workspace.write(state);
  const disk = fs.readFileSync(join(path, 'index.json'), 'utf8'); const before = json(join(path, 'index.json')); const info = workspace.info();
  const id = state.snapshot!.tasks[0].TaskNo; const context = workspace.context(id);
  state.snapshot!.tasks[0].TaskName += ' updated'; state.settings.compact = true;
  const rename = fs.renameSync;
  vi.spyOn(fs, 'renameSync').mockImplementation((a, b) => { if (String(b) === join(path, 'index.json')) throw new Error('injected index failure'); return rename(a, b); });
  expect(() => workspace.write(state)).toThrow('injected index failure');
  expect(fs.readFileSync(join(path, 'index.json'), 'utf8')).toBe(disk);
  expect(workspace.info().lastWrittenAt).toBe(info.lastWrittenAt); expect(workspace.info().error).toContain('injected');
  expect(workspace.context(id)).toBe(context); expect(new AgentWorkspace(path).context(id)).toBe(context);
  expect(json(join(path, before.currentPath)).settings.compact).toBe(false);
  vi.restoreAllMocks(); workspace.write(state); expect(workspace.info().error).toBeNull();
  expect(workspace.context(id)).toContain(' updated');
});
it('refuses altered immutable files and never overwrites an earlier capture', () => {
  const path = root(); const state = initial(); const workspace = new AgentWorkspace(path); workspace.write(state);
  const index = json(join(path, 'index.json')); const snapshot = join(path, index.snapshotPath);
  fs.writeFileSync(snapshot, 'tampered immutable data');
  expect(() => workspace.write(state)).toThrow(/immutable|integrity/i);
  expect(fs.readFileSync(snapshot, 'utf8')).toBe('tampered immutable data');
});
it('rejects a foreign identity in pinned source context rather than returning another task', () => {
  const path = root(); const state = initial(); const workspace = new AgentWorkspace(path); workspace.write(state);
  const index = json(join(path, 'index.json')); const id = state.snapshot!.tasks[0].TaskNo;
  const entry = index.tasks.find((t: any) => t.TaskNo === id); const file = join(path, entry.sourcePath);
  const source = json(file); source.task.TaskNo = 'a foreign identity'; fs.writeFileSync(file, JSON.stringify(source));
  expect(() => workspace.context(id)).toThrow(/identity/i);
});
it.each(['currentPath', 'snapshotPath'])('rejects a tampered %s in the persisted index', key => {
  const path = root(); const workspace = new AgentWorkspace(path); workspace.write(initial());
  const index = json(join(path, 'index.json')); index[key] = '../unrelated.json';
  fs.writeFileSync(join(path, 'index.json'), JSON.stringify(index));
  expect(() => new AgentWorkspace(path)).toThrow(/index/i);
});
it('preserves user work README and notes and never reads them for context', () => {
  const path = root(); const state = initial(); const workspace = new AgentWorkspace(path); workspace.write(state);
  const id = state.snapshot!.tasks[0].TaskNo; const work = join(workspace.taskDir(id), 'work');
  fs.writeFileSync(join(work, 'README.md'), 'User README'); fs.writeFileSync(join(work, 'notes.md'), 'User private notes');
  const read = fs.readFileSync;
  const spy = vi.spyOn(fs, 'readFileSync').mockImplementation(((file: any, options: any) => {
    if (String(file).includes(`${join('work', 'notes.md')}`) || String(file).includes(`${join('work', 'README.md')}`)) throw new Error('Work must not be read');
    return read(file, options);
  }) as typeof fs.readFileSync);
  workspace.write(state); expect(workspace.context(id)).not.toContain('User private notes');
  spy.mockRestore();
  expect(fs.readFileSync(join(work, 'README.md'), 'utf8')).toBe('User README');
  expect(fs.readFileSync(join(work, 'notes.md'), 'utf8')).toBe('User private notes');
});
it('adds all 32 real captured own-cell rows, pins immutable generations, and preserves work and disappeared metadata', () => {
  const captured = JSON.parse(fs.readFileSync(new URL('../../reports/2026-10-26/pes_filtered_raw.json', import.meta.url), 'utf8'));
  const rows = captured.rows.map((r: any) => r.cells);
  expect(rows).toHaveLength(32); expect(rows.every((r: string[]) => r.length === 16)).toBe(true);
  const path = root(); const workspace = new AgentWorkspace(path); const state = initial();
  workspace.write(state);
  const id = state.snapshot!.tasks[0].TaskNo; const taskPath = workspace.taskDir(id);
  fs.writeFileSync(join(taskPath, 'work', 'notes.md'), 'agent private notes');
  fs.writeFileSync(join(taskPath, 'work', 'attachment.txt'), 'keep me');
  const before = json(join(path, 'index.json'));
  const oldEntry = before.tasks.find((t: any) => t.TaskNo === id);
  const oldSource = fs.readFileSync(join(path, oldEntry.sourcePath), 'utf8');
  state.snapshot!.sourceRows = rows; state.snapshot!.id = '../../unsafe snapshot id';
  workspace.write(state);
  const index = json(join(path, 'index.json')); expect(index.tasks).toHaveLength(32);
  expect(index.sourceRowsAvailable).toBe(true); expect(index.tasks.filter((t: any) => t.activeSelected)).toHaveLength(8);
  const snapshot = json(join(path, index.snapshotPath)); expect(snapshot.sourceRows).toEqual(rows);
  for (const entry of index.tasks) {
    const source = json(join(path, entry.sourcePath));
    expect(source.rawCells).toEqual(rows.find((r: string[]) => r[1] === entry.TaskNo));
    expect(source.historyAvailable).toBe(state.snapshot!.tasks.some(t => t.TaskNo === entry.TaskNo));
    if (!source.historyAvailable) expect(source.task).not.toHaveProperty('history');
  }
  expect(fs.readFileSync(join(path, oldEntry.sourcePath), 'utf8')).toBe(oldSource);
  expect(workspace.taskDir(id)).toBe(taskPath);
  expect(fs.readFileSync(join(taskPath, 'work', 'notes.md'), 'utf8')).toBe('agent private notes');
  expect(fs.readFileSync(join(taskPath, 'work', 'attachment.txt'), 'utf8')).toBe('keep me');
  const immutable = index.tasks[0].sourcePath;
  state.settings.compact = true; workspace.write(state);
  expect(json(join(path, 'index.json')).tasks[0].sourcePath).toBe(immutable);
  state.snapshot = { ...state.snapshot!, id: 'next', sourceRows: [], tasks: [], totalScanned: 0 };
  workspace.write(state);
  expect(json(join(path, 'index.json')).tasks).toHaveLength(32);
  expect(json(join(path, 'index.json')).tasks.every((t: any) => !t.inCurrentScope && !t.activeSelected)).toBe(true);
  expect(workspace.context(id)).toContain(state.snapshot === null ? '' : report.tasks[0].history.text);
}, 30000);
