import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import type { Activity, AppState, Snapshot, Task } from '../shared/types';
import { validateSnapshot } from '../shared/domain';

export interface TaskCorrelation {
  issueKey: string;
  asanaId: string;
  asanaName: string;
  pesTaskNo: string;
  pesStatus: string;
  role: string;
}

interface ActivityRow {
  id: string;
  at: string;
  level: Activity['level'];
  category: Activity['category'];
  message: string;
  detail: string | null;
  stage: string | null;
  run_id: string | null;
  duration_ms: number | null;
}

interface SnapshotMetaRow {
  id: string;
  source: Snapshot['source'];
  retrieved_at: string;
  from_date: string | null;
  to_date: string | null;
  pic: string | null;
  department: string | null;
  total_scanned: number;
  diff_json: string | null;
}

interface PesTaskRow {
  task_no: string;
  row_num: string | null;
  tgl_input: string;
  pic: string;
  jabatan: string;
  dept_name: string;
  task_name: string;
  goal_task: string;
  asal_task: string;
  bobot: string;
  target: string;
  due_date: string;
  status: string;
  tgl_approval: string;
  tgl_selesai: string;
  lampiran: string;
  history_json: string | null;
}

interface CorrelationRow {
  pesTaskNo: string;
  pesTaskName: string;
  pesStatus: string;
  asanaId: string;
  asanaName: string;
}

export class AureliaDb {
  private db: DatabaseSync;

  constructor(public readonly dbPath: string) {
    fs.mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;

      CREATE TABLE IF NOT EXISTS pes_snapshot (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        retrieved_at TEXT NOT NULL,
        from_date TEXT,
        to_date TEXT,
        pic TEXT,
        department TEXT,
        total_scanned INTEGER NOT NULL,
        diff_json TEXT
      );

      CREATE TABLE IF NOT EXISTS pes_tasks (
        task_no TEXT PRIMARY KEY,
        row_num TEXT,
        tgl_input TEXT,
        pic TEXT NOT NULL,
        jabatan TEXT,
        dept_name TEXT,
        task_name TEXT NOT NULL,
        goal_task TEXT,
        asal_task TEXT,
        bobot TEXT,
        target TEXT,
        due_date TEXT,
        status TEXT NOT NULL,
        tgl_approval TEXT,
        tgl_selesai TEXT,
        lampiran TEXT,
        history_json TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS pes_source_rows (
        row_index INTEGER PRIMARY KEY,
        task_no TEXT NOT NULL,
        cells_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pes_activities (
        id TEXT PRIMARY KEY,
        at TEXT NOT NULL,
        level TEXT NOT NULL,
        category TEXT NOT NULL,
        message TEXT NOT NULL,
        detail TEXT,
        stage TEXT,
        run_id TEXT,
        duration_ms REAL
      );

      CREATE TABLE IF NOT EXISTS pes_preferences (
        task_no TEXT PRIMARY KEY,
        pinned INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS app_kv (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL
      );
    `);
  }

  saveState(state: AppState): void {
    this.db.exec('BEGIN TRANSACTION;');
    try {
      // 1. Settings & focus & sync & connection
      const setKv = this.db.prepare('INSERT INTO app_kv (key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json;');
      setKv.run('schemaVersion', JSON.stringify(state.schemaVersion));
      setKv.run('settings', JSON.stringify(state.settings));
      setKv.run('focusTaskId', JSON.stringify(state.focusTaskId));
      setKv.run('connection', JSON.stringify(state.connection));
      setKv.run('sync', JSON.stringify(state.sync));
      setKv.run('lastAttemptAt', JSON.stringify(state.lastAttemptAt));
      setKv.run('lastError', JSON.stringify(state.lastError));

      // 2. Preferences
      this.db.exec('DELETE FROM pes_preferences;');
      const insertPref = this.db.prepare('INSERT INTO pes_preferences (task_no, pinned) VALUES (?, ?);');
      for (const [id, pref] of Object.entries(state.preferences)) {
        insertPref.run(id, pref.pinned ? 1 : 0);
      }

      // 3. Activities
      this.db.exec('DELETE FROM pes_activities;');
      const insertAct = this.db.prepare('INSERT INTO pes_activities (id, at, level, category, message, detail, stage, run_id, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);');
      for (const a of state.activities.slice(-1000)) {
        insertAct.run(a.id, a.at, a.level, a.category, a.message, a.detail ?? null, a.stage ?? null, a.runId ?? null, a.durationMs ?? null);
      }

      // 4. Snapshot & Tasks
      if (state.snapshot) {
        const s = state.snapshot;
        this.db.prepare('INSERT INTO pes_snapshot (id, source, retrieved_at, from_date, to_date, pic, department, total_scanned, diff_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET source=excluded.source, retrieved_at=excluded.retrieved_at, total_scanned=excluded.total_scanned, diff_json=excluded.diff_json;').run(
          s.id, s.source, s.retrievedAt, s.scope?.from ?? null, s.scope?.to ?? null, s.scope?.pic ?? null, s.scope?.department ?? null, s.totalScanned, s.diff ? JSON.stringify(s.diff) : null
        );

        this.db.exec('DELETE FROM pes_tasks;');
        const insertTask = this.db.prepare(`
          INSERT INTO pes_tasks (
            task_no, row_num, tgl_input, pic, jabatan, dept_name, task_name,
            goal_task, asal_task, bobot, target, due_date, status, tgl_approval,
            tgl_selesai, lampiran, history_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `);
        for (const t of s.tasks) {
          insertTask.run(
            t.TaskNo,
            t.Row ?? null,
            t.TglInput ?? '',
            t.Pic ?? '',
            t.Jabatan ?? '',
            t.DeptName ?? '',
            t.TaskName ?? '',
            t.GoalTask ?? '',
            t.AsalTask ?? '',
            t.Bobot ?? '',
            t.Target ?? '',
            t.Duedate ?? '',
            t.Status ?? '',
            t.TglApproval ?? '',
            t.TglSelesai ?? '',
            t.Lampiran ?? '',
            JSON.stringify(t.history ?? { text: '', tables: [] })
          );
        }
        if (Array.isArray(s.sourceRows)) {
          this.db.exec('DELETE FROM pes_source_rows;');
          const insertRow = this.db.prepare('INSERT INTO pes_source_rows (row_index, task_no, cells_json) VALUES (?, ?, ?);');
          s.sourceRows.forEach((row, idx) => {
            insertRow.run(idx, row[1] ?? '', JSON.stringify(row));
          });
        }
      }

      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  loadState(): AppState | null {
    try {
      const getKv = this.db.prepare('SELECT value_json FROM app_kv WHERE key = ?;');
      const schemaRow = getKv.get('schemaVersion') as { value_json: string } | undefined;
      if (!schemaRow) return null;

      const settingsRow = getKv.get('settings') as { value_json: string } | undefined;
      const focusRow = getKv.get('focusTaskId') as { value_json: string } | undefined;
      const connRow = getKv.get('connection') as { value_json: string } | undefined;
      const syncRow = getKv.get('sync') as { value_json: string } | undefined;
      const lastAttemptRow = getKv.get('lastAttemptAt') as { value_json: string } | undefined;
      const lastErrorRow = getKv.get('lastError') as { value_json: string } | undefined;

      const prefRows = this.db.prepare('SELECT task_no, pinned FROM pes_preferences;').all() as { task_no: string; pinned: number }[];
      const preferences: Record<string, { pinned: boolean }> = {};
      for (const p of prefRows) {
        preferences[p.task_no] = { pinned: p.pinned === 1 };
      }

      const actRows = this.db.prepare('SELECT id, at, level, category, message, detail, stage, run_id, duration_ms FROM pes_activities ORDER BY at ASC;').all() as unknown as ActivityRow[];
      const activities: Activity[] = actRows.map(a => ({
        id: a.id,
        at: a.at,
        level: a.level,
        category: a.category,
        message: a.message,
        ...(a.detail ? { detail: a.detail } : {}),
        ...(a.stage ? { stage: a.stage } : {}),
        ...(a.run_id ? { runId: a.run_id } : {}),
        ...(a.duration_ms !== null && a.duration_ms !== undefined ? { durationMs: a.duration_ms } : {}),
      }));

      // Snapshot
      const snapMeta = this.db.prepare('SELECT id, source, retrieved_at, from_date, to_date, pic, department, total_scanned, diff_json FROM pes_snapshot ORDER BY retrieved_at DESC LIMIT 1;').get() as unknown as SnapshotMetaRow | undefined;
      let snapshot: Snapshot | null = null;
      if (snapMeta) {
        const taskRows = this.db.prepare(`
          SELECT task_no, row_num, tgl_input, pic, jabatan, dept_name, task_name,
                 goal_task, asal_task, bobot, target, due_date, status, tgl_approval,
                 tgl_selesai, lampiran, history_json
          FROM pes_tasks;
        `).all() as unknown as PesTaskRow[];

        const tasks: Task[] = taskRows.map(r => ({
          TaskNo: r.task_no,
          ...(r.row_num ? { Row: r.row_num } : {}),
          TglInput: r.tgl_input,
          Pic: r.pic,
          Jabatan: r.jabatan,
          DeptName: r.dept_name,
          TaskName: r.task_name,
          GoalTask: r.goal_task,
          AsalTask: r.asal_task,
          Bobot: r.bobot,
          Target: r.target,
          Duedate: r.due_date,
          Status: r.status,
          TglApproval: r.tgl_approval,
          TglSelesai: r.tgl_selesai,
          Lampiran: r.lampiran,
          history: r.history_json ? JSON.parse(r.history_json) : { text: '', tables: [] },
        }));

        const srcRows = this.db.prepare('SELECT cells_json FROM pes_source_rows ORDER BY row_index ASC;').all() as { cells_json: string }[];
        const sourceRows = srcRows.map(r => JSON.parse(r.cells_json) as string[]);

        snapshot = validateSnapshot({
          id: snapMeta.id,
          source: snapMeta.source,
          retrievedAt: snapMeta.retrieved_at,
          scope: snapMeta.from_date ? {
            from: snapMeta.from_date,
            to: snapMeta.to_date,
            pic: snapMeta.pic,
            department: snapMeta.department,
          } : undefined,
          totalScanned: snapMeta.total_scanned,
          tasks,
          sourceRows: sourceRows.length ? sourceRows : undefined,
          diff: snapMeta.diff_json ? JSON.parse(snapMeta.diff_json) : undefined,
        });
      }

      return {
        schemaVersion: schemaRow ? JSON.parse(schemaRow.value_json) : 1,
        snapshot,
        preferences,
        focusTaskId: focusRow ? JSON.parse(focusRow.value_json) : null,
        settings: settingsRow ? JSON.parse(settingsRow.value_json) : { theme: 'system', timezone: 'Asia/Jakarta', compact: false },
        activities,
        lastAttemptAt: lastAttemptRow ? JSON.parse(lastAttemptRow.value_json) : null,
        lastError: lastErrorRow ? JSON.parse(lastErrorRow.value_json) : null,
        connection: connRow ? JSON.parse(connRow.value_json) : 'unknown',
        sync: syncRow ? JSON.parse(syncRow.value_json) : { phase: 'idle', message: 'Belum ada sinkronisasi.' },
      };
    } catch {
      return null;
    }
  }

  findCrossSystemCorrelations(asanaDbPath: string): TaskCorrelation[] {
    if (!fs.existsSync(asanaDbPath)) return [];
    try {
      this.db.exec(`ATTACH DATABASE '${asanaDbPath.replace(/'/g, "''")}' AS asana;`);
      const results = this.db.prepare(`
        SELECT
          p.task_no as pesTaskNo,
          p.task_name as pesTaskName,
          p.status as pesStatus,
          a.id as asanaId,
          a.name as asanaName
        FROM pes_tasks p
        JOIN asana.tasks a ON (
          (a.name LIKE '%' || substr(p.task_name, instr(p.task_name, 'ST-'), 7) || '%' AND instr(p.task_name, 'ST-') > 0)
        )
        WHERE a.deleted = 0
        LIMIT 50;
      `).all() as unknown as CorrelationRow[];

      this.db.exec('DETACH DATABASE asana;');

      return results.map(r => {
        const mKey = /(ST-\d+)/.exec(r.pesTaskName);
        const mRole = /\b(FE|BE|QA|SA)\b/i.exec(r.pesTaskName);
        return {
          issueKey: mKey ? mKey[1] : 'Unknown',
          asanaId: r.asanaId,
          asanaName: r.asanaName,
          pesTaskNo: r.pesTaskNo,
          pesStatus: r.pesStatus,
          role: mRole ? mRole[1].toUpperCase() : 'General',
        };
      });
    } catch {
      try { this.db.exec('DETACH DATABASE asana;'); } catch {}
      return [];
    }
  }

  close(): void {
    try {
      this.db.close();
    } catch {}
  }
}
