import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ASANA_MUTATION,
  updateLocalDbTask,
  executeAsanaTaskUpdate,
  executeAsanaBatchUpdate,
} from '../src/main/asana-mutation';

describe('Asana task mutation', () => {
  function createTestDb(): { dir: string; dbPath: string; cleanup: () => void } {
    const dir = mkdtempSync(join(process.env.TMPDIR || process.env.TEMP || tmpdir(), 'asana-mut-test-'));
    const dbPath = join(dir, 'test-catalog.db');
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE tasks (
        connector TEXT,
        id TEXT,
        name TEXT,
        raw_json TEXT,
        modified_at TEXT
      );
    `);
    const initialRaw = {
      gid: '1219921901471557',
      name: '[Seller Center] FE | ST-2300 | INTP | Kelola Rekening',
      custom_fields: [
        {
          gid: ASANA_MUTATION.statusFieldGid,
          name: 'Status',
          enum_value: null,
          display_value: null,
        },
        {
          gid: ASANA_MUTATION.progressFieldGid,
          name: 'Task Progress',
          enum_value: { gid: '1208878509891763', name: 'Not Started' },
          display_value: 'Not Started',
        },
        {
          gid: ASANA_MUTATION.itStartDateFieldGid,
          name: 'IT Start Date',
          display_value: null,
          date_value: null,
        },
        {
          gid: ASANA_MUTATION.itEndDateFieldGid,
          name: 'IT End Date',
          display_value: null,
          date_value: null,
        },
      ],
    };
    db.prepare('INSERT INTO tasks (connector, id, name, raw_json, modified_at) VALUES (?, ?, ?, ?, ?)').run(
      'asana',
      '1219921901471557',
      initialRaw.name,
      JSON.stringify(initialRaw),
      '2026-10-20T00:00:00Z'
    );
    db.close();

    return {
      dir,
      dbPath,
      cleanup: () => {
        try {
          rmSync(dir, { recursive: true, force: true });
        } catch {}
      },
    };
  }

  it('updates local SQLite custom fields to In-Progress, today start date, and due end date', () => {
    const { dbPath, cleanup } = createTestDb();
    try {
      updateLocalDbTask(dbPath, '1219921901471557', '2026-10-29', '2026-11-06');

      const db = new DatabaseSync(dbPath);
      const row = db.prepare('SELECT raw_json FROM tasks WHERE connector=? AND id=?').get('asana', '1219921901471557') as { raw_json: string };
      db.close();

      expect(row).toBeDefined();
      const updatedRaw = JSON.parse(row.raw_json);
      const statusField = updatedRaw.custom_fields.find((f: { gid: string }) => f.gid === ASANA_MUTATION.statusFieldGid);
      const progressField = updatedRaw.custom_fields.find((f: { gid: string }) => f.gid === ASANA_MUTATION.progressFieldGid);
      const startField = updatedRaw.custom_fields.find((f: { gid: string }) => f.gid === ASANA_MUTATION.itStartDateFieldGid);
      const endField = updatedRaw.custom_fields.find((f: { gid: string }) => f.gid === ASANA_MUTATION.itEndDateFieldGid);

      expect(statusField.enum_value.gid).toBe(ASANA_MUTATION.statusInProgressOptionGid);
      expect(statusField.display_value).toBe('In-Progress');
      expect(progressField.enum_value.gid).toBe(ASANA_MUTATION.progressInProgressOptionGid);
      expect(progressField.display_value).toBe('In Progress');
      expect(startField.display_value).toBe('2026-10-29');
      expect(startField.date_value.date).toBe('2026-10-29');
      expect(endField.display_value).toBe('2026-11-06');
      expect(endField.date_value.date).toBe('2026-11-06');
    } finally {
      cleanup();
    }
  });

  it('executes batch update for multiple tasks', async () => {
    const { dbPath, cleanup } = createTestDb();
    try {
      const res = await executeAsanaBatchUpdate(
        [{ gid: '1219921901471557', dueDate: '2026-11-06' }],
        dbPath,
        '2026-10-29'
      );
      expect(res.success).toBe(true);
      expect(res.count).toBe(1);
    } finally {
      cleanup();
    }
  });
});
