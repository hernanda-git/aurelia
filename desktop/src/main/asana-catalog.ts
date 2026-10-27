import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { ASANA_SCOPE, normalizeAsanaTask, validateAsanaSnapshot } from '../shared/asana-domain';
import type { AsanaSnapshot } from '../shared/asana-types';
const MAX_RAW_BYTES = 2000000;
const MAX_TASKS = 10000;
/** Fixed read-only schema-2 adapter: no Store/migration/credentials/network. */
export function readAsanaCatalog(path: string, now = new Date().toISOString()): AsanaSnapshot {
  let db: DatabaseSync | undefined;
  try {
    const stat = fs.lstatSync(path); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error();
    db = new DatabaseSync(path, { readOnly: true }); db.exec('PRAGMA query_only=ON; BEGIN');
    if ((db.prepare('PRAGMA user_version').get() as any)?.user_version !== 2) throw new Error();
    const project = db.prepare('SELECT workspace FROM projects WHERE connector=? AND id=?').get('asana', ASANA_SCOPE.project);
    if (!project || (project.workspace != null && project.workspace !== ASANA_SCOPE.workspace)) throw new Error();
    // Check validity inside SQLite before json_each: malformed records must not
    // disappear from the personal set through a permissive SQL predicate.
    if (db.prepare('SELECT 1 FROM tasks WHERE connector=? AND deleted=0 AND (NOT json_valid(raw_json) OR length(raw_json)>?) LIMIT 1').get('asana', MAX_RAW_BYTES)) throw new Error();
    const rows = db.prepare(`SELECT id,raw_json,last_seen_at FROM tasks
      WHERE connector=? AND deleted=0 AND EXISTS (
        SELECT 1 FROM json_each(tasks.raw_json,'$.custom_fields') AS field
        WHERE json_extract(field.value,'$.gid')=? AND json_extract(field.value,'$.enum_value.gid')=?
      ) ORDER BY id LIMIT ?`).all('asana', ASANA_SCOPE.ownerField, ASANA_SCOPE.ownerOption, MAX_TASKS + 1);
    if (rows.length > MAX_TASKS) throw new Error();
    const tasks: AsanaSnapshot['tasks'] = []; const options = new Map<string, AsanaSnapshot['statusOptions'][number]>();
    for (const row of rows) {
      if (typeof row.raw_json !== 'string' || typeof row.id !== 'string') throw new Error();
      const raw = JSON.parse(row.raw_json); if (raw.gid !== row.id) throw new Error();
      const task = normalizeAsanaTask(raw, row.last_seen_at as string | null);
      if (!task) continue;
      tasks.push(task);
      const status = raw.custom_fields.find((f: any) => f.gid === ASANA_SCOPE.statusField);
      if (status?.enum_options != null) {
        if (!Array.isArray(status.enum_options) || status.enum_options.length > 500) throw new Error();
        for (const option of status.enum_options) {
          if (typeof option.gid !== 'string' || typeof option.name !== 'string' || (option.enabled !== undefined && typeof option.enabled !== 'boolean')) throw new Error();
          if (!options.has(option.gid)) options.set(option.gid, { gid: option.gid, name: option.name, enabled: option.enabled !== false });
        }
      }
    }
    for (const task of tasks) if (task.status.gid && !options.has(task.status.gid)) options.set(task.status.gid, { gid: task.status.gid, name: task.status.name ?? task.status.gid, enabled: true });
    const run = db.prepare('SELECT MAX(finished_at) AS at FROM sync_runs WHERE connector=? AND status=?').get('asana', 'ok');
    const snapshot = validateAsanaSnapshot({ id: randomUUID(), source: 'catalog', retrievedAt: now, sourceUpdatedAt: run?.at ?? null, tasks, statusOptions: [...options.values()], coverage: 'catalog_only' });
    db.exec('COMMIT'); return snapshot;
  } catch { throw new Error('Asana catalog could not be read.'); }
  finally { try { db?.close(); } catch { /* Never expose database diagnostics. */ } }
}
