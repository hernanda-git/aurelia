import { describe, expect, it } from 'vitest';
import * as domain from '../src/shared/domain';
import { readFileSync } from 'node:fs';
import type { Snapshot } from '../src/shared/types';
const report = JSON.parse(readFileSync(new URL('../assets/seed.json', import.meta.url), 'utf8'));
const fixture = (): Snapshot => ({ id: 'snapshot-1', source: 'live', retrievedAt: report.retrieved_at, scope: { from: report.date_from, to: report.date_to, pic: report.pic, department: report.department }, totalScanned: report.total_scanned, tasks: structuredClone(report.tasks) });

describe('snapshot boundaries', () => {
  it('imports historical provenance without pretending to refresh or retaining computed report fields', () => {
    const snapshot = domain.importedSnapshot(report);
    expect(snapshot.source).toBe('imported');
    expect(snapshot.retrievedAt).toBe(report.retrieved_at);
    expect(snapshot.tasks).toHaveLength(report.counts.Approval + report.counts.Open);
    expect(snapshot.tasks[0]).not.toHaveProperty('overdue');
    expect(domain.validateSnapshot({ ...fixture(), tasks: [], totalScanned: 0 }).tasks).toEqual([]);
  });
  it('retains every captured grid row without replacing source text or inventing excluded histories', () => {
    const raw = JSON.parse(readFileSync(new URL('../../reports/2026-10-26/pes_filtered_raw.json', import.meta.url), 'utf8'));
    const sourceRows: string[][] = raw.rows.map((row: { cells: string[] }) => row.cells);
    const snapshot = domain.validateSnapshot({ ...fixture(), sourceRows });
    expect(snapshot.sourceRows).toEqual(sourceRows);
    expect(snapshot.sourceRows).toHaveLength(32);
    expect(snapshot.tasks).toHaveLength(8);
    sourceRows[0][6] = 'Changed outside the validated snapshot';
    expect(snapshot.sourceRows![0][6]).not.toBe(sourceRows[0][6]);
  });
  it('rejects inconsistent captured rows before publishing a snapshot', () => {
    const raw = JSON.parse(readFileSync(new URL('../../reports/2026-10-26/pes_filtered_raw.json', import.meta.url), 'utf8'));
    const sourceRows: string[][] = raw.rows.map((row: { cells: string[] }) => row.cells);
    const mutations: Array<(s: Snapshot) => void> = [
      s => s.sourceRows!.pop(),
      s => s.sourceRows![0].pop(),
      s => s.sourceRows![0][3] = 'SOMEONE ELSE',
      s => s.sourceRows![0][1] = ' ' + s.sourceRows![0][1],
      s => s.sourceRows![1][1] = s.sourceRows![0][1],
      s => s.sourceRows![0][6] = 'Different source task title',
      s => s.sourceRows![0][12] = 'Solved',
      s => s.tasks.pop(),
      s => s.sourceRows![8][12] = 'Open',
    ];
    for (const mutate of mutations) {
      const snapshot = { ...fixture(), sourceRows: structuredClone(sourceRows) };
      mutate(snapshot);
      expect(() => domain.validateSnapshot(snapshot)).toThrow();
    }
  });
  it('rejects duplicate keys, wrong PIC, missing source fields and incomplete histories', () => {
    const mutations: Array<(s: any) => void> = [
      s => s.tasks.push(s.tasks[0]), s => s.tasks[0].Pic = 'SOMEONE ELSE', s => s.scope.pic = 'SOMEONE ELSE',
      s => delete s.tasks[0].history, s => s.tasks[0].history = {}, s => s.tasks[0].history.tables = [['not a row']],
      s => delete s.tasks[0].GoalTask, s => s.tasks[0].Status = 'Closed', s => s.tasks[0].Status = 'approval',
      s => s.totalScanned = 0, s => s.totalScanned = 1.5, s => s.source = 'fixture', s => s.id = '',
      s => s.retrievedAt = '2026-02-30T00:00:00Z', s => s.retrievedAt = '2026-10-26',
      s => s.scope.from = '2026-09-31', s => s.scope.from = '01-Sep-2026', s => s.scope.to = '2026-01-01', s => s.scope.department = '',
    ];
    for (const mutate of mutations) { const s = fixture(); mutate(s); expect(() => domain.validateSnapshot(s)).toThrow(); }
    for (const value of [null, {}, [], 'snapshot']) expect(() => domain.validateSnapshot(value)).toThrow();
  });
  it('rejects empty and mismatched target histories before persistence',()=>{
    for(const historyText of ['', 'TaskNo: OTHER-TASK\nVerifikasi']){
      const s=fixture();s.tasks[0].history.text=historyText;
      expect(()=>domain.validateSnapshot(s)).toThrow();
    }
  });
  it('rejects invalid report origin, source counts and missing real retrieval timestamp', () => {
    for (const patch of [{ source: 'https://attacker.test/' }, { retrieved_at: null }, { counts: { Approval: 0, Open: 0 } }, { total_scanned: -1 }]) expect(() => domain.importedSnapshot({ ...report, ...patch })).toThrow();
  });
  it('compares meaningful task fields but ignores row ordering and property ordering', () => {
    const previous = domain.validateSnapshot(fixture());
    const next = structuredClone(previous);
    next.tasks.reverse(); next.tasks.forEach((t, i) => t.Row = String(i + 42));
    expect(domain.compareSnapshots(previous, next)).toEqual({ added: 0, changed: 0, outOfScope: 0, scopeChanged: false });
    for (const field of ['Status', 'GoalTask', 'Duedate', 'history'] as const) {
      const edited = structuredClone(previous);
      if (field === 'history') edited.tasks[0].history.text += '\nUpdated';
      else edited.tasks[0][field] = field === 'Status' ? 'Open' : 'Changed';
      expect(domain.compareSnapshots(previous, edited).changed).toBe(1);
    }
    next.tasks.pop();
    expect(domain.compareSnapshots(previous, next).outOfScope).toBe(1);
    next.scope.from = '2026-10-01';
    expect(domain.compareSnapshots(previous, next)).toMatchObject({ outOfScope: 0, scopeChanged: true });
    expect(domain.compareSnapshots(null, previous)).toEqual({ added: previous.tasks.length, changed: 0, outOfScope: 0, scopeChanged: false });
  });
  it('redacts cookie assignments, JSON credentials and standalone JWT-shaped tokens', () => {
    const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.signature';
    for (const raw of [
      'cookie=SID=cookiesecret; other=secondsecret',
      'cookie: {"SID":"cookiesecret", "other":"secondsecret"}',
      '{"cookie": {"SID":"cookiesecret", "other":"secondsecret"}}',
      '{"password":"cookiesecret", "refresh_token":"secondsecret"}',
      `received ${token}`,
    ]) {
      const clean = domain.sanitizeLog(raw);
      expect(clean).not.toContain('cookiesecret'); expect(clean).not.toContain('secondsecret'); expect(clean).not.toContain(token);
    }
  });
  it('redacts tokens, cookies and password assignments before bounding log messages', () => {
    const text = domain.sanitizeLog('Authorization: Bearer abc.def.secret\nCookie: SID=very-secret; auth=second-secret\npassword="my password" token=token-secret access_token=access-secret api_key=key-secret\nhttps://example.test/?token=url-secret&x=1');
    for (const secret of ['abc.def.secret', 'very-secret', 'second-secret', 'my password', 'token-secret', 'access-secret', 'key-secret', 'url-secret']) expect(text).not.toContain(secret);
    expect(text).toContain('[REDACTED]');
    expect(domain.sanitizeLog('x'.repeat(20000)).length).toBeLessThanOrEqual(4000);
  });
});

describe('civil dates', () => {
  it('parses Indonesian and English abbreviations and validates actual calendar dates', () => {
    for (const value of ['30-Okt-2026', '30-Oct-2026', '2026-10-30']) expect(domain.parsePesDate(value)).toBe('2026-10-30');
    expect(domain.parsePesDate(' 1-Agu-2026 ')).toBe('2026-08-01');
    expect(domain.parsePesDate('29-Feb-2024')).toBe('2024-02-29');
    for (const value of ['', '31-Apr-2026', '29-Feb-2026', '2026-02-29', '2026-1-01', '2026-10-30T12:00Z', '30-XXX-2026']) expect(domain.parsePesDate(value)).toBeNull();
  });
  it('computes previous-first through next-last using the configured local month', () => {
    expect(domain.defaultSettings).toEqual({ theme: 'dark', timezone: 'Asia/Jakarta', compact: false });
    expect(domain.dateWindow(new Date('2026-12-31T20:00:00Z'))).toEqual({ from: '2026-12-01', to: '2027-02-28' });
    expect(domain.dateWindow(new Date('2026-03-01T01:00:00Z'), 'America/New_York')).toEqual({ from: '2026-01-01', to: '2026-03-31' });
    expect(() => domain.dateWindow(new Date('invalid'))).toThrow();
    expect(() => domain.dateWindow(new Date(), 'Bad/Zone')).toThrow();
  });
  it('keeps a due date valid throughout its local day until exclusive next midnight', () => {
    expect(domain.deadlineInfo('26-Okt-2026', new Date('2026-10-26T16:59:59Z'), 'Asia/Jakarta')).toMatchObject({ kind: 'today', days: 0, remainingMs: 1000, dueIso: '2026-10-26' });
    expect(domain.deadlineInfo('26-Okt-2026', new Date('2026-10-26T17:00:00Z'), 'Asia/Jakarta')).toMatchObject({ kind: 'overdue', days: 1, remainingMs: 0 });
    expect(domain.deadlineInfo('28-Okt-2026', new Date('2026-10-25T17:00:00Z'), 'Asia/Jakarta')).toMatchObject({ kind: 'upcoming', days: 2 });
    expect(domain.deadlineInfo('?', new Date(), 'Asia/Jakarta')).toMatchObject({ kind: 'unknown', days: 0, remainingMs: null, dueIso: null });
  });
  it('uses DST-aware next midnight rather than adding 24 hours', () => {
    expect(domain.deadlineInfo('2026-03-08', new Date('2026-03-08T05:00:00Z'), 'America/New_York').remainingMs).toBe(23 * 3600000);
    expect(domain.deadlineInfo('2026-11-01', new Date('2026-11-01T04:00:00Z'), 'America/New_York').remainingMs).toBe(25 * 3600000);
    const result = domain.deadlineInfo('2026-11-01', new Date('2026-11-02T05:00:00Z'), 'America/New_York');
    expect(result.kind).toBe('overdue');
    expect(result.label).toMatch(/Terlambat/);
    expect(result.detail).toContain('America/New_York');
  });
  it('evaluates taskDeadlineInfo according to target T1 vs T2+ and completion status', () => {
    const now = new Date('2026-10-30T10:00:00Z');
    const baseTask = {
      TaskNo: 'M03861', TglInput: '14-Okt-2026', Pic: 'MUHAMMAD HERNANDA', Jabatan: 'Programmer Back End',
      DeptName: 'ITMSS', TaskName: 'CI Task', GoalTask: 'CI Goal', AsalTask: 'Lain-Lain',
      Bobot: '4', Target: 'T1', Duedate: '14-Okt-2026', Status: 'Solved', TglApproval: '14-Okt-2026',
      TglSelesai: '14-Okt-2026', Lampiran: 'proof.png', history: { text: '', tables: [] },
    };

    // 1. Solved task 16 days ago is NOT overdue, but completed
    const solvedInfo = domain.taskDeadlineInfo(baseTask, now, 'Asia/Jakarta');
    expect(solvedInfo.kind).toBe('completed');
    expect(solvedInfo.label).toBe('Selesai 14-Okt-2026');
    expect(solvedInfo.days).toBe(0);

    // 2. Update Task is completed / awaiting approval
    const updateInfo = domain.taskDeadlineInfo({ ...baseTask, Status: 'Update Task' }, now, 'Asia/Jakarta');
    expect(updateInfo.kind).toBe('completed');
    expect(updateInfo.label).toContain('Update Task');

    // 3. Active task with Target T1 past due date is NOT overdue
    const t1ActiveInfo = domain.taskDeadlineInfo({ ...baseTask, Status: 'Approval', Target: 'T1', Duedate: '14-Okt-2026' }, now, 'Asia/Jakarta');
    expect(t1ActiveInfo.kind).toBe('upcoming');
    expect(t1ActiveInfo.label).toContain('Target T1');

    // 4. Active task with Target T2 past due date IS overdue
    const t2OverdueInfo = domain.taskDeadlineInfo({ ...baseTask, Status: 'Approval', Target: 'T2', Duedate: '14-Okt-2026' }, now, 'Asia/Jakarta');
    expect(t2OverdueInfo.kind).toBe('overdue');
    expect(t2OverdueInfo.label).toMatch(/Terlambat/);
    expect(t2OverdueInfo.label).toContain('T2');
  });
});
