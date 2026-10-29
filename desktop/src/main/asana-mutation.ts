import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { TASKBRIDGE_CONFIG } from './asana-sync';

export const ASANA_MUTATION = Object.freeze({
  projectGid: '1208922858503175',
  statusFieldGid: '1208415672865789',
  statusInProgressOptionGid: '1208415672865793',
  progressFieldGid: '1208878509891762',
  progressInProgressOptionGid: '1208878509891764',
  itStartDateFieldGid: '1208878900985995',
  itEndDateFieldGid: '1208878923161869',
});

export function getAsanaToken(): string | null {
  if (process.env.ASANA_TOKEN) return process.env.ASANA_TOKEN;
  try {
    if (fs.existsSync(TASKBRIDGE_CONFIG)) {
      const content = fs.readFileSync(TASKBRIDGE_CONFIG, 'utf8');
      const m = /^\s*token\s*=\s*["']([^"']+)["']/m.exec(content);
      if (m) return m[1];
    }
  } catch {}
  return null;
}

export interface TaskUpdatePayload {
  gid: string;
  dueDate?: string | null;
}

interface RawCustomField {
  gid: string;
  name?: string;
  enum_value?: { gid: string; name?: string } | null;
  display_value?: string | null;
  text_value?: string | null;
  date_value?: { date: string } | null;
}

export function updateLocalDbTask(dbPath: string, taskGid: string, today: string, endDate: string): void {
  if (!fs.existsSync(dbPath)) return;
  const db = new DatabaseSync(dbPath);
  try {
    const row = db.prepare('SELECT raw_json FROM tasks WHERE connector=? AND id=?').get('asana', taskGid) as { raw_json: string } | undefined;
    if (row && typeof row.raw_json === 'string') {
      const raw = JSON.parse(row.raw_json) as { custom_fields?: RawCustomField[] };
      if (Array.isArray(raw.custom_fields)) {
        for (const cf of raw.custom_fields) {
          if (cf.gid === ASANA_MUTATION.progressFieldGid) {
            cf.enum_value = { gid: ASANA_MUTATION.progressInProgressOptionGid, name: 'In Progress' };
            cf.display_value = 'In Progress';
          } else if (cf.gid === ASANA_MUTATION.statusFieldGid) {
            cf.enum_value = { gid: ASANA_MUTATION.statusInProgressOptionGid, name: 'In-Progress' };
            cf.display_value = 'In-Progress';
          } else if (cf.gid === ASANA_MUTATION.itStartDateFieldGid) {
            cf.display_value = today;
            cf.text_value = today;
            cf.date_value = { date: today };
          } else if (cf.gid === ASANA_MUTATION.itEndDateFieldGid) {
            cf.display_value = endDate;
            cf.text_value = endDate;
            cf.date_value = { date: endDate };
          }
        }
        const existingGids = new Set(raw.custom_fields.map(f => f.gid));
        if (!existingGids.has(ASANA_MUTATION.statusFieldGid)) {
          raw.custom_fields.push({ gid: ASANA_MUTATION.statusFieldGid, name: 'Status', enum_value: { gid: ASANA_MUTATION.statusInProgressOptionGid, name: 'In-Progress' }, display_value: 'In-Progress' });
        }
        if (!existingGids.has(ASANA_MUTATION.progressFieldGid)) {
          raw.custom_fields.push({ gid: ASANA_MUTATION.progressFieldGid, name: 'Task Progress', enum_value: { gid: ASANA_MUTATION.progressInProgressOptionGid, name: 'In Progress' }, display_value: 'In Progress' });
        }
        if (!existingGids.has(ASANA_MUTATION.itStartDateFieldGid)) {
          raw.custom_fields.push({ gid: ASANA_MUTATION.itStartDateFieldGid, name: 'IT Start Date', display_value: today, text_value: today, date_value: { date: today } });
        }
        if (!existingGids.has(ASANA_MUTATION.itEndDateFieldGid)) {
          raw.custom_fields.push({ gid: ASANA_MUTATION.itEndDateFieldGid, name: 'IT End Date', display_value: endDate, text_value: endDate, date_value: { date: endDate } });
        }
        const newRawJson = JSON.stringify(raw);
        db.prepare('UPDATE tasks SET raw_json=?, modified_at=? WHERE connector=? AND id=?').run(newRawJson, new Date().toISOString(), 'asana', taskGid);
      }
    }
  } finally {
    db.close();
  }
}

export async function executeAsanaTaskUpdate(
  taskGid: string,
  dueDate: string | null | undefined,
  dbPath: string,
  civilToday?: string
): Promise<{ success: boolean; error?: string }> {
  const today = civilToday || new Date().toISOString().slice(0, 10);
  const end = dueDate || today;
  const token = getAsanaToken();
  const isTestMode = Boolean(process.env.PES_FOCUS_DATA_DIR);

  if (token && !isTestMode) {
    const url = `https://app.asana.com/api/1.0/tasks/${taskGid}`;
    const payload = {
      data: {
        custom_fields: {
          [ASANA_MUTATION.progressFieldGid]: ASANA_MUTATION.progressInProgressOptionGid,
          [ASANA_MUTATION.statusFieldGid]: ASANA_MUTATION.statusInProgressOptionGid,
          [ASANA_MUTATION.itStartDateFieldGid]: { date: today },
          [ASANA_MUTATION.itEndDateFieldGid]: { date: end },
        },
      },
    };

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.text();
      return { success: false, error: `Asana API error (${response.status}): ${err}` };
    }
  }

  // Update local SQLite cache
  try {
    updateLocalDbTask(dbPath, taskGid, today, end);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }

  return { success: true };
}

export async function executeAsanaBatchUpdate(
  tasks: TaskUpdatePayload[],
  dbPath: string,
  civilToday?: string
): Promise<{ success: boolean; count: number; error?: string }> {
  let updated = 0;
  for (const t of tasks) {
    const res = await executeAsanaTaskUpdate(t.gid, t.dueDate, dbPath, civilToday);
    if (!res.success) {
      return { success: false, count: updated, error: res.error };
    }
    updated++;
  }
  return { success: true, count: updated };
}
