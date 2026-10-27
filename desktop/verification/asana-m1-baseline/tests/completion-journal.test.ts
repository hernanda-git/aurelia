import { afterEach, expect, test, vi } from 'vitest';
import * as fs from 'node:fs';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync, linkSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CompletionJournal } from '../src/main/completion-journal';
vi.mock('node:fs', async importOriginal => {
 const actual = await importOriginal<typeof import('node:fs')>();
 return { ...actual, fsyncSync: vi.fn(actual.fsyncSync), openSync: vi.fn(actual.openSync) };
});
const roots: string[] = [];
const journals: CompletionJournal[] = [];
function setup() { const root = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'pes-journal-')); roots.push(root); const j = new CompletionJournal(join(root, 'journal')); journals.push(j); return j; }
const identity = (operationId = 'op-1') => ({ operationId, accountId: '3220', taskId: 'M03990/Task. IT/1026', targetRevision: '2026-10-23', proposalDigest: 'a'.repeat(64), evidenceDigest: 'b'.repeat(64), policyRevision: 'v1' });
afterEach(() => { journals.forEach(j => j.close()); roots.splice(0).forEach(r => rmSync(r, { recursive: true, force: true })); });
test('rejects a VERIFYING self transition rather than appending a duplicate', () => {
 const j = setup(); reachIntent(j); j.transition('op-1', 'VERIFYING');
 expect(() => j.transition('op-1', 'VERIFYING')).toThrow(/transition/);
});
test('attempts a parent directory flush after committing an event', () => {
 const j = setup(); vi.mocked(fs.openSync).mockClear();
 j.createAttempt(identity());
 expect(vi.mocked(fs.openSync).mock.calls.some(args => args[0] === j.root && args[1] === 'r')).toBe(true);
});
test('cannot release journal ownership reentrantly during a write', () => {
 const j = setup(); const i = identity();
 Object.defineProperty(i, 'taskId', { enumerable: true, get() { expect(() => j.close()).toThrow(/reentrant/i); return 'task'; } });
 j.createAttempt(i); expect(j.events()).toHaveLength(1);
});
test('fsync failure rejects intent, poisons the writer, and recovered bytes permit reconciliation only', () => {
 const j = setup(); j.createAttempt(identity()); for (const s of ['ASSESSED', 'EVIDENCE_READY', 'PREPARED', 'PRECHECKED'] as const) j.transition('op-1', s);
 const spy = vi.spyOn(fs, 'fsyncSync').mockImplementationOnce(() => { throw new Error('simulated disk flush failure'); });
 try { expect(() => j.transition('op-1', 'SUBMIT_INTENT')).toThrow(/flush/); } finally { spy.mockRestore(); }
 expect(j.get('op-1')?.state).toBe('PRECHECKED'); expect(() => j.transition('op-1', 'SUBMIT_INTENT')).toThrow(/failed/);
 const root = j.root; j.close(); const r = new CompletionJournal(root); journals.push(r); expect(r.recoveryMode('op-1')).toBe('RECONCILE_ONLY');
});
test.each(['SUBMIT_INTENT', 'SUBMITTED', 'UPLOAD_INTENT', 'UPLOADED'] as const)('restart at %s blocks every further remote-write state', state => {
 const j = setup(); reachIntent(j);
 for (const s of ['SUBMITTED', 'UPLOAD_INTENT', 'UPLOADED'] as const) { if (j.get('op-1')?.state === state) break; j.transition('op-1', s); }
 const root = j.root; j.close(); const r = new CompletionJournal(root); journals.push(r);
 for (const s of ['SUBMIT_INTENT', 'SUBMITTED', 'UPLOAD_INTENT', 'UPLOADED'] as const) expect(() => r.transition('op-1', s)).toThrow();
 expect(r.recoveryMode('op-1')).toBe('RECONCILE_ONLY');
});
test('recovered verified attempts cannot regress even to reconciliation', () => {
 const j = setup(); reachIntent(j); j.transition('op-1', 'VERIFYING'); j.transition('op-1', 'VERIFIED'); const root = j.root; j.close();
 const r = new CompletionJournal(root); journals.push(r);
 expect(() => r.transition('op-1', 'VERIFYING')).toThrow(/transition|terminal/i);
});
test('rejects reentrant writes before validation can invoke caller getters', () => {
 const j = setup(); const i = identity();
 Object.defineProperty(i, 'taskId', { enumerable: true, get() { expect(() => j.createAttempt(identity('nested'))).toThrow(/reentrant/i); return 'task'; } });
 j.createAttempt(i); expect(j.events()).toHaveLength(1);
});
test('detects changed committed events before another append and fails closed', () => {
 const j = setup(); j.createAttempt(identity());
 const path = join(j.root, '000000000001.json'); writeFileSync(path, readFileSync(path, 'utf8').replace('3220', '3221'));
 expect(() => j.transition('op-1', 'ASSESSED')).toThrow(/changed|corrupt/i);
 expect(readdirSync(j.root)).toHaveLength(1);
});
test('rejects journal roots and events redirected through filesystem links', () => {
 const j = setup(); j.createAttempt(identity()); const root = j.root; j.close();
 linkSync(join(root, '000000000001.json'), join(roots.at(-1)!, 'external-event'));
 expect(() => new CompletionJournal(root)).toThrow(/link|safe/i);
});
test('only one in-process journal owner can mutate and closed owner cannot write', () => {
 const j = setup(); expect(() => new CompletionJournal(j.root)).toThrow(/owner/i);
 j.close(); expect(() => j.createAttempt(identity())).toThrow(/closed/i);
});
test('storage collision never overwrites and poisons further mutations', () => {
 const j = setup(); j.createAttempt(identity()); const path = join(j.root, '000000000002.json'); writeFileSync(path, 'torn');
 expect(() => j.transition('op-1', 'ASSESSED')).toThrow(); expect(readFileSync(path, 'utf8')).toBe('torn');
 rmSync(path); expect(() => j.transition('op-1', 'ASSESSED')).toThrow(/failed|poison/i);
});
test.each(['../escape', 'CON', 'a/b', 'a:b', 'a.', '', 'a'.repeat(129)])('rejects unsafe operation ID %s', id => {
 const j = setup(); expect(() => j.createAttempt(identity(id))).toThrow(); expect(j.events()).toHaveLength(0);
});
test.each(['tamper', 'gap', 'torn', 'foreign'])('fails closed on %s journal chain', mode => {
 const j = setup(); j.createAttempt(identity()); j.transition('op-1', 'ASSESSED'); const root = j.root; j.close();
 const first = join(root, '000000000001.json');
 if (mode === 'tamper') writeFileSync(first, readFileSync(first, 'utf8').replace('3220', '3221'));
 if (mode === 'gap') rmSync(first);
 if (mode === 'torn') writeFileSync(join(root, '000000000003.json'), '{');
 if (mode === 'foreign') writeFileSync(join(root, 'unexpected'), '{}');
 expect(() => new CompletionJournal(root)).toThrow();
});
function reachIntent(j: CompletionJournal) { j.createAttempt(identity()); for (const s of ['ASSESSED', 'EVIDENCE_READY', 'PREPARED', 'PRECHECKED', 'SUBMIT_INTENT'] as const) j.transition('op-1', s); }
test('task target remains blocked with changed evidence after submit intent and restart is reconcile only', () => {
 const j = setup(); reachIntent(j);
 expect(() => j.createAttempt({ ...identity('op-2'), evidenceDigest: 'c'.repeat(64) })).toThrow(/task|target/i);
 const root = j.root; j.close(); const r = new CompletionJournal(root); journals.push(r);
 expect(r.recoveryMode('op-1')).toBe('RECONCILE_ONLY');
 expect(() => r.transition('op-1', 'SUBMITTED')).toThrow(/reconcil/i);
 r.transition('op-1', 'VERIFYING'); r.transition('op-1', 'VERIFIED');
 expect(() => r.createAttempt(identity('op-3'))).toThrow();
});
test('rejects invalid transitions and duplicate operation creation without writing', () => {
 const j = setup(); j.createAttempt(identity());
 expect(() => j.transition('op-1', 'SUBMITTED')).toThrow();
 expect(() => j.createAttempt(identity())).toThrow();
 expect(j.events()).toHaveLength(1);
 j.transition('op-1', 'ASSESSED'); j.transition('op-1', 'BLOCKED');
 expect(() => j.transition('op-1', 'PREPARED')).toThrow();
});
test('persists immutable sequential hash-chained events and reloads an attempt', () => {
 const j = setup(); j.createAttempt(identity()); j.transition('op-1', 'ASSESSED');
 expect(j.get('op-1')?.state).toBe('ASSESSED'); const root = j.root; j.close();
 const reopened = new CompletionJournal(root); journals.push(reopened);
 expect(reopened.get('op-1')?.identity).toEqual(identity()); expect(reopened.events()).toHaveLength(2);
 expect(reopened.events()[1].previousHash).toBe(reopened.events()[0].hash);
});
