import fs from 'node:fs';
import { basename, dirname, join, parse, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readAsanaCatalog } from './asana-catalog';
import { isAsanaLiveSyncAvailable, runAsanaLiveSync } from './asana-sync';
import { validateAsanaPreferences, validateAsanaSnapshot } from '../shared/asana-domain';
import type { AsanaPreferences, AsanaState } from '../shared/asana-types';
const MAX_STATE_BYTES = 32 * 1024 * 1024;
function initial(): AsanaState { return { snapshot: null, phase: 'idle', lastAttemptAt: null, lastError: null, preferences: { pinned: [], focusGid: null, savedViews: [] } }; }
// Refuse existing symlink/junction components and multiply-linked files. The
// app owns a private userData directory; this is not a cross-process lock.
function safePath(file: string): void {
  const absolute = resolve(file); const root = parse(absolute).root; let current = root;
  for (const part of absolute.slice(root.length).split(/[\\/]/).filter(Boolean)) {
    current = join(current, part);
    try {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink() || (current === absolute ? !stat.isFile() || stat.nlink !== 1 : !stat.isDirectory())) throw new Error('Unsafe state path');
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}
/** One isolated main-process owner; no catalog rows are saved before scoping. */
export class AsanaStore {
  private state: AsanaState = initial();
  private pending: Promise<void> | null = null;
  private generation = 0;
  private abortController: AbortController | null = null;
  constructor(private readonly file: string) {
    try {
      safePath(file);
      let stat: fs.Stats;
      try { stat = fs.statSync(file); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return; throw e; }
      if (stat.size > MAX_STATE_BYTES) throw new Error();
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (data.schemaVersion !== 1 || !data.state || Object.keys(data).some(k => !['schemaVersion', 'state'].includes(k))) throw new Error();
      const s = data.state;
      if (Object.keys(s).some(k => !['snapshot', 'phase', 'lastAttemptAt', 'lastError', 'preferences'].includes(k)) || !['idle', 'loading', 'ready', 'failed'].includes(s.phase)) throw new Error();
      if (s.lastAttemptAt !== null && (typeof s.lastAttemptAt !== 'string' || !Number.isFinite(Date.parse(s.lastAttemptAt)))) throw new Error();
      if (s.lastError !== null && typeof s.lastError !== 'string') throw new Error();
      this.state = { snapshot: s.snapshot === null ? null : validateAsanaSnapshot(s.snapshot), preferences: validateAsanaPreferences(s.preferences), phase: s.snapshot === null ? 'idle' : 'ready', lastAttemptAt: s.lastAttemptAt, lastError: s.lastError === null ? null : 'Previous Asana catalog reload failed.' };
    } catch { this.state = { ...initial(), phase: 'failed', lastError: 'Asana state could not be loaded.' }; }
  }
  getState(): AsanaState { return structuredClone(this.state); }
  private persist(next: AsanaState): void {
    let temp: string | undefined; let fd: number | undefined;
    try {
      const encoded = JSON.stringify({ schemaVersion: 1, state: next });
      if (Buffer.byteLength(encoded, 'utf8') > MAX_STATE_BYTES) throw new Error();
      safePath(this.file); fs.mkdirSync(dirname(this.file), { recursive: true }); safePath(this.file);
      temp = join(dirname(this.file), `.${basename(this.file)}.${randomUUID()}.tmp`);
      fd = fs.openSync(temp, 'wx', 0o600); fs.writeFileSync(fd, encoded, 'utf8'); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
      safePath(this.file); fs.renameSync(temp, this.file); temp = undefined;
      this.state = next;
    } catch { throw new Error('Asana state could not be saved.'); }
    finally { if (fd !== undefined) try { fs.closeSync(fd); } catch { /* Best effort. */ } if (temp) try { fs.unlinkSync(temp); } catch { /* Original preserved. */ } }
  }
  setPreferences(patch: Partial<AsanaPreferences>): void {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).some(k => !['pinned', 'focusGid', 'savedViews'].includes(k))) throw new Error('Invalid Asana preferences.');
    const preferences = validateAsanaPreferences({ ...this.state.preferences, ...patch });
    this.persist({ ...this.getState(), preferences });
  }
  reloadCatalog(path: string): Promise<void> {
    if (this.pending) return this.pending;
    const generation = ++this.generation;
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    this.state = { ...this.state, phase: 'loading', lastAttemptAt: new Date().toISOString(), lastError: null };
    const pending = (async () => {
      // Yield so the IPC cancel action can discard a scheduled read. SQLite's
      // bounded synchronous read itself cannot be interrupted mid-query.
      await new Promise<void>(r => setImmediate(r));
      if (generation !== this.generation) return;
      let syncWarning: string | null = null;
      if (isAsanaLiveSyncAvailable(path)) {
        try {
          const syncResult = await runAsanaLiveSync(signal, path);
          if (generation !== this.generation) return;
          if (!syncResult.ok && syncResult.error !== 'CANCELLED') {
            syncWarning = syncResult.error || 'Live sync failed';
          }
        } catch (e) {
          if (generation !== this.generation) return;
          syncWarning = e instanceof Error ? e.message : 'Live sync failed';
        }
      }
      if (generation !== this.generation) return;
      try {
        const snapshot = readAsanaCatalog(path);
        await new Promise<void>(r => setImmediate(r));
        if (generation !== this.generation) return;
        const lastError = syncWarning ? `Asana sync notice: ${syncWarning}. Data snapshot tetap tersedia.` : null;
        this.persist({ ...this.getState(), snapshot, phase: 'ready', lastError });
      } catch {
        if (generation !== this.generation) return;
        this.state = { ...this.state, phase: 'failed', lastError: 'Asana catalog reload failed. Last good data is retained.' };
      }
    })();
    this.pending = pending;
    void pending.finally(() => {
      if (this.pending === pending) {
        this.pending = null;
        this.abortController = null;
      }
    });
    return pending;
  }
  cancelReload(): void {
    if (!this.pending) return;
    ++this.generation;
    if (this.abortController) {
      try { this.abortController.abort(); } catch {}
      this.abortController = null;
    }
    this.state = { ...this.state, phase: this.state.snapshot ? 'ready' : 'idle', lastError: null };
  }
}
