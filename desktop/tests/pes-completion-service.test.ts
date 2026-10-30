import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAutoEvidence, stageEvidenceFile } from '../src/main/pes-completion-service';
import type { Task } from '../src/shared/types';

describe('PES completion service', () => {
  it('creates and stages auto-evidence file with valid metadata and sha256', async () => {
    const dir = mkdtempSync(join(process.env.TMPDIR || process.env.TEMP || tmpdir(), 'pes-evidence-test-'));
    try {
      const task: Task = {
        TaskNo: 'M03938/Task. IT/1026',
        TglInput: '14-Okt-2026',
        Pic: 'MUHAMMAD HERNANDA',
        Jabatan: 'Programmer Back End',
        DeptName: 'ITMSS',
        TaskName: 'FE | [Seller Center] ST-2297 | INTP | Profile Toko Online',
        GoalTask: 'FE completed [Seller Center] ST-2297 | INTP | Profile Toko Online',
        AsalTask: 'Lain-Lain',
        Bobot: '4',
        Target: 'T1',
        Duedate: '30-Okt-2026',
        Status: 'Approval',
        TglApproval: '15-Okt-2026',
        TglSelesai: '',
        Lampiran: '',
        history: { text: '', tables: [] },
      };

      const staged = await createAutoEvidence(task, dir);
      expect(staged.fileName).toContain('bukti-penyelesaian-M03938');
      expect(staged.fileName).toMatch(/\.png$/);
      expect(staged.mime).toBe('image/png');
      expect(staged.size).toBeGreaterThan(0);
      expect(staged.sha256).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('stages user-selected files correctly', async () => {
    const dir = mkdtempSync(join(process.env.TMPDIR || process.env.TEMP || tmpdir(), 'pes-stage-test-'));
    try {
      const dummyPath = join(dir, 'screenshot.png');
      writeFileSync(dummyPath, Buffer.from('fake-png-content'));
      const staged = await stageEvidenceFile(dummyPath);
      expect(staged.fileName).toBe('screenshot.png');
      expect(staged.mime).toBe('image/png');
      expect(staged.size).toBe(Buffer.from('fake-png-content').length);
      expect(staged.sha256).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
