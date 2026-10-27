import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface AsanaLiveSyncResult {
  ok: boolean;
  tasksSeen?: number;
  changed?: number;
  durationMs?: number;
  error?: string;
}

export const ASANA_SYNC_WORKSPACE = 'C:/Workspace/asana-pes-sync';
export const TASKBRIDGE_EXE = 'C:/Users/it26/source/repos/taskbridge/.venv/Scripts/taskbridge.exe';
export const TASKBRIDGE_CONFIG = 'C:/Workspace/asana-pes-sync/config/config.toml';

export const ASANA_DEFAULT_DB = 'C:/Workspace/asana-pes-sync/data/taskbridge.db';

export function isAsanaLiveSyncAvailable(targetDbPath?: string): boolean {
  if (process.env.PES_FOCUS_DATA_DIR) return false;
  if (targetDbPath && path.resolve(targetDbPath).toLowerCase() !== path.resolve(ASANA_DEFAULT_DB).toLowerCase()) {
    return false;
  }
  return fs.existsSync(TASKBRIDGE_EXE) && fs.existsSync(TASKBRIDGE_CONFIG);
}

export function runAsanaLiveSync(signal?: AbortSignal, targetDbPath?: string): Promise<AsanaLiveSyncResult> {
  const { promise, resolve } = Promise.withResolvers<AsanaLiveSyncResult>();
  if (!isAsanaLiveSyncAvailable(targetDbPath)) {
    resolve({ ok: false, error: 'Live sync engine not available' });
    return promise;
  }

  const started = Date.now();
  let child: ChildProcess;
  try {
    child = spawn(TASKBRIDGE_EXE, ['--config', TASKBRIDGE_CONFIG, 'sync'], {
      cwd: ASANA_SYNC_WORKSPACE,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (e) {
    resolve({ ok: false, error: e instanceof Error ? e.message : String(e) });
    return promise;
  }

  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', d => { stdout += d; });
  child.stderr?.on('data', d => { stderr += d; });

  const onAbort = () => {
    try {
      child.kill();
    } catch {}
  };

  if (signal) {
    if (signal.aborted) {
      onAbort();
      resolve({ ok: false, error: 'CANCELLED' });
      return promise;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }

  child.on('close', (code) => {
    if (signal) signal.removeEventListener('abort', onAbort);
    const durationMs = Date.now() - started;
    if (code === 0) {
      const match = stdout.match(/tasks_seen=(\d+)\s+changed=(\d+)/);
      const tasksSeen = match ? parseInt(match[1], 10) : undefined;
      const changed = match ? parseInt(match[2], 10) : undefined;
      resolve({ ok: true, tasksSeen, changed, durationMs });
    } else {
      const err = stderr.trim() || stdout.trim() || `Exit code ${code}`;
      resolve({ ok: false, error: err, durationMs });
    }
  });

  child.on('error', (err) => {
    if (signal) signal.removeEventListener('abort', onAbort);
    resolve({ ok: false, error: err.message, durationMs: Date.now() - started });
  });

  return promise;
}
