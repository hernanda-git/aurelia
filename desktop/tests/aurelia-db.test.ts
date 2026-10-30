import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { AureliaDb } from '../src/main/aurelia-db';
import type { AppState } from '../src/shared/types';
import { createInitialState } from '../src/main/store';

const dirs: string[] = [];
function createTestDb(): { dir: string; db: AureliaDb } {
  const scratch = process.env.TMPDIR || process.env.TEMP || tmpdir();
  const dir = fs.mkdtempSync(join(scratch, 'aurelia-db-test-'));
  dirs.push(dir);
  const db = new AureliaDb(join(dir, 'aurelia.db'));
  return { dir, db };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
});

describe('Aurelia SQLite Database', () => {
  it('creates tables and loads/saves full AppState cleanly', () => {
    const { db } = createTestDb();
    try {
      const state: AppState = {
        ...createInitialState(),
        focusTaskId: 'M03938/Task. IT/1026',
        preferences: { 'M03938/Task. IT/1026': { pinned: true } },
        activities: [
          {
            id: 'act-1',
            at: '2026-10-30T04:00:00.000Z',
            level: 'info',
            category: 'local',
            message: 'Task pinned in test',
          },
        ],
        snapshot: {
          id: 'snap-1',
          source: 'live',
          retrievedAt: '2026-10-30T04:00:00.000Z',
          scope: {
            from: '2026-09-01',
            to: '2026-11-30',
            pic: 'MUHAMMAD HERNANDA',
            department: 'ITMSS',
          },
          totalScanned: 1,
          tasks: [
            {
              TaskNo: 'M03938/Task. IT/1026',
              TglInput: '14-Okt-2026',
              Pic: 'MUHAMMAD HERNANDA',
              Jabatan: 'Programmer Back End',
              DeptName: 'ITMSS',
              TaskName: 'FE | [Seller Center] ST-2297 | INTP | Profile Toko Online',
              GoalTask: 'FE completed ST-2297',
              AsalTask: 'Lain-Lain',
              Bobot: '4',
              Target: 'T1',
              Duedate: '30-Okt-2026',
              Status: 'Update Task',
              TglApproval: '',
              TglSelesai: '30-Okt-2026',
              history: { text: 'TaskNo: M03938/Task. IT/1026\nTarget history', tables: [] },
              Row: '1',
            },
          ],
        },
      };

      db.saveState(state);
      const loaded = db.loadState();

      expect(loaded).toBeDefined();
      expect(loaded!.focusTaskId).toBe('M03938/Task. IT/1026');
      expect(loaded!.preferences['M03938/Task. IT/1026']?.pinned).toBe(true);
      expect(loaded!.activities).toHaveLength(1);
      expect(loaded!.activities[0].message).toBe('Task pinned in test');
      expect(loaded!.snapshot).toBeDefined();
      expect(loaded!.snapshot!.tasks).toHaveLength(1);
      expect(loaded!.snapshot!.tasks[0].TaskNo).toBe('M03938/Task. IT/1026');
      expect(loaded!.snapshot!.tasks[0].Status).toBe('Update Task');
    } finally {
      db.close();
    }
  });

  it('performs cross-system SQL correlation between PES and Asana', () => {
    const { dir, db } = createTestDb();
    const asanaDbPath = join(dir, 'mock-taskbridge.db');
    const asanaDb = new DatabaseSync(asanaDbPath);
    try {
      asanaDb.exec(`
        CREATE TABLE tasks (
          id TEXT PRIMARY KEY,
          name TEXT,
          deleted INTEGER DEFAULT 0
        );
        INSERT INTO tasks (id, name, deleted) VALUES
          ('1219494105093433', 'FE | [Seller Center] ST-2297 | INTP | Profile Toko Online', 0),
          ('1219494105093425', 'BE | [Seller Center] ST-2297 | INTP | Profile Toko Online', 0);
      `);
      asanaDb.close();

      // Seed PES task in aurelia.db
      const state: AppState = {
        ...createInitialState(),
        snapshot: {
          id: 'snap-2',
          source: 'live',
          retrievedAt: '2026-10-30T04:00:00.000Z',
          scope: { from: '2026-09-01', to: '2026-11-30', pic: 'MUHAMMAD HERNANDA', department: 'ITMSS' },
          totalScanned: 1,
          tasks: [
            {
              TaskNo: 'M03938/Task. IT/1026',
              TglInput: '14-Okt-2026',
              Pic: 'MUHAMMAD HERNANDA',
              Jabatan: 'Programmer Back End',
              DeptName: 'ITMSS',
              TaskName: 'FE | [Seller Center] ST-2297 | INTP | Profile Toko Online',
              GoalTask: 'FE completed ST-2297',
              AsalTask: 'Lain-Lain',
              Bobot: '4',
              Target: 'T1',
              Duedate: '30-Okt-2026',
              Status: 'Update Task',
              TglApproval: '',
              TglSelesai: '30-Okt-2026',
              Lampiran: 'bukti.png',
              history: { text: '', tables: [] },
            },
          ],
        },
      };
      db.saveState(state);

      const correlations = db.findCrossSystemCorrelations(asanaDbPath);
      expect(correlations.length).toBeGreaterThan(0);
      const match = correlations.find(c => c.pesTaskNo === 'M03938/Task. IT/1026');
      expect(match).toBeDefined();
      expect(match!.issueKey).toBe('ST-2297');
      expect(match!.role).toBe('FE');
    } finally {
      db.close();
    }
  });
});
