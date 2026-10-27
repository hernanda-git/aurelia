import { createHash } from 'node:crypto';
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync, lstatSync, fstatSync, constants } from 'node:fs';
import { join, resolve, dirname, isAbsolute, parse } from 'node:path';

export type CompletionState = 'DISCOVERED' | 'ASSESSED' | 'EVIDENCE_READY' | 'PREPARED' | 'PRECHECKED' | 'SUBMIT_INTENT' | 'SUBMITTED' | 'UPLOAD_INTENT' | 'UPLOADED' | 'VERIFYING' | 'VERIFIED' | 'SAVED_WITH_DISCREPANCY' | 'OUTCOME_UNKNOWN' | 'BLOCKED' | 'AUTH_REQUIRED' | 'NOOP_ALREADY_COMPLETE' | 'CANCELLED_BEFORE_SUBMIT';
export interface CompletionAttemptIdentity { operationId: string; accountId: string; taskId: string; targetRevision: string; proposalDigest: string; evidenceDigest: string; policyRevision: string }
export interface CompletionJournalEvent { sequence: number; previousHash: string; identity: CompletionAttemptIdentity; state: CompletionState; hash: string }
export interface CompletionAttempt { identity: CompletionAttemptIdentity; state: CompletionState }
const pathStates: CompletionState[] = ['DISCOVERED', 'ASSESSED', 'EVIDENCE_READY', 'PREPARED', 'PRECHECKED', 'SUBMIT_INTENT', 'SUBMITTED', 'UPLOAD_INTENT', 'UPLOADED', 'VERIFYING'];
const outcomes: CompletionState[] = ['VERIFIED', 'SAVED_WITH_DISCREPANCY', 'OUTCOME_UNKNOWN'];
const beforeSubmit: CompletionState[] = ['BLOCKED', 'AUTH_REQUIRED', 'NOOP_ALREADY_COMPLETE', 'CANCELLED_BEFORE_SUBMIT'];
function validTransition(from: CompletionState, to: CompletionState): boolean {
 const n = pathStates.indexOf(from);
 return (n >= 0 && n < 9 && pathStates[n + 1] === to)
  || (n >= 0 && n < 5 && beforeSubmit.includes(to))
  || (n >= 5 && outcomes.includes(to) && to !== 'VERIFIED')
  || (n >= 5 && n < 9 && to === 'VERIFYING')
  || (from === 'VERIFYING' && outcomes.includes(to))
  || (['OUTCOME_UNKNOWN', 'SAVED_WITH_DISCREPANCY'].includes(from) && to === 'VERIFYING');
}
function syncDirectory(path: string): void {
 // Node on Windows cannot flush directory handles. File fsync remains mandatory;
 // process-crash recovery is supported, but power-loss metadata durability is not promised there.
 let fd: number;
 try { fd = openSync(path, 'r'); } catch (error) {
  if (process.platform === 'win32' && ['EPERM', 'EISDIR', 'EINVAL', 'ENOTSUP'].includes((error as NodeJS.ErrnoException).code ?? '')) return;
  throw error;
 }
 try { fsyncSync(fd); } catch (error) {
  if (!(process.platform === 'win32' && ['EPERM', 'EISDIR', 'EINVAL', 'ENOTSUP'].includes((error as NodeJS.ErrnoException).code ?? ''))) throw error;
 } finally { closeSync(fd); }
}
function safeDirectory(path: string, create = false): string {
 if (typeof path !== 'string' || !isAbsolute(path) || /^[\\/]{2}/.test(path) || /[\x00-\x1f]/.test(path)
  || path.split(/[\\/]/).some((p, n) => p === '.' || p === '..' || /[. ]$/.test(p) || (n > 0 && /[:*?"<>|]/.test(p)))) throw new Error('Unsafe storage root path');
 const full = resolve(path); if (full === parse(full).root) throw new Error('Unsafe volume root');
 const ancestors: string[] = []; for (let p = full; ; p = dirname(p)) { ancestors.unshift(p); if (p === dirname(p)) break; }
 for (const p of ancestors) {
  let st; try { st = lstatSync(p); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (!st && create) { mkdirSync(p, { mode: 0o700 }); st = lstatSync(p); }
  if (st && (st.isSymbolicLink() || !st.isDirectory())) throw new Error('Unsafe storage root link');
  if (!st && !create) throw new Error('Missing storage root');
 }
 if (process.platform !== 'win32' && (lstatSync(full).mode & 0o022)) throw new Error('Unsafe writable storage root');
 return full;
}
function safeRead(path: string, max: number): Buffer {
 safeDirectory(dirname(path));
 const before = lstatSync(path);
 if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) throw new Error('Unsafe artifact link');
 if (before.size > max) throw new Error('Artifact exceeds size limit');
 const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
 try {
  const opened = fstatSync(fd);
  if (!opened.isFile() || opened.nlink !== 1 || opened.ino !== before.ino || opened.dev !== before.dev || opened.size !== before.size) throw new Error('Unsafe artifact identity');
  const bytes = readFileSync(fd); const after = lstatSync(path);
  if (after.isSymbolicLink() || after.nlink !== 1 || after.ino !== opened.ino || after.dev !== opened.dev || bytes.length > max) throw new Error('Unsafe artifact link changed');
  return bytes;
 } finally { closeSync(fd); }
}

const owners = new Set<string>();
function validateIdentity(identity: CompletionAttemptIdentity): void {
 if (!identity || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(identity.operationId) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(identity.operationId)) throw new Error('Unsafe operation ID');
 for (const field of ['accountId', 'taskId', 'targetRevision', 'policyRevision'] as const) {
  if (typeof identity[field] !== 'string' || !identity[field].trim() || identity[field].length > 2048 || /[\x00-\x1f]/.test(identity[field])) throw new Error('Invalid identity');
 }
 if (![identity.proposalDigest, identity.evidenceDigest].every(h => typeof h === 'string' && /^[a-f0-9]{64}$/.test(h))) throw new Error('Invalid digest');
}
const digest = (text: string) => createHash('sha256').update(text).digest('hex');

/**
 * Synchronous standalone storage; successful transition() means the event file was fsynced.
 * The Electron host MUST acquire its single-instance lock before constructing this journal.
 * The in-memory owner registry/reentrancy guard is not an inter-process lock.
 * Recovered submit/upload states permit read-only reconciliation transitions, never another click.
 * Hash chains detect accidental corruption, not malicious rewriting or whole-tail deletion by the same user.
 * Directory fsync is attempted; Windows returns EPERM, so power-loss metadata durability is NOT guaranteed.
 */
export class CompletionJournal {
 readonly root: string;
 private history: CompletionJournalEvent[] = [];
 private attempts = new Map<string, CompletionAttempt>();
 private reconcile = new Set<string>();
 private busy = false;
 private exclusive<T>(work: () => T): T {
  this.assertWritable(); if (this.busy) throw new Error('Reentrant journal write');
  this.busy = true; try { return work(); } finally { this.busy = false; }
 }
 private closed = false;
 private failed = false;
 private ownerKey: string;
 private assertWritable(): void { if (this.closed) throw new Error('Journal closed'); if (this.failed) throw new Error('Journal failed closed'); }
 constructor(root: string) {
  this.root = safeDirectory(root, true); this.ownerKey = process.platform === 'win32' ? this.root.toLowerCase() : this.root;
  if (owners.has(this.ownerKey)) throw new Error('Journal owner already active');
  mkdirSync(this.root, { recursive: true });
  for (const name of readdirSync(this.root).sort()) {
   const text = safeRead(join(this.root, name), 32768).toString('utf8');
   const event = JSON.parse(text) as CompletionJournalEvent;
   validateIdentity(event.identity);
   const body = { sequence: event.sequence, previousHash: event.previousHash, identity: event.identity, state: event.state };
   const prior = this.attempts.get(event.identity.operationId);
   if (name !== `${String(this.history.length + 1).padStart(12, '0')}.json`
    || event.sequence !== this.history.length + 1 || event.previousHash !== (this.history.at(-1)?.hash ?? '0'.repeat(64))
    || event.hash !== digest(JSON.stringify(body)) || text !== `${JSON.stringify({ ...body, hash: event.hash })}\n`
    || (prior ? JSON.stringify(prior.identity) !== JSON.stringify(event.identity) || !validTransition(prior.state, event.state) : event.state !== 'DISCOVERED')) throw new Error('Corrupt journal chain');
   this.history.push(event); this.attempts.set(event.identity.operationId, { identity: event.identity, state: event.state });
   if (pathStates.indexOf(event.state) >= 5 || outcomes.includes(event.state)) this.reconcile.add(event.identity.operationId);
  }
  owners.add(this.ownerKey);
 }
 createAttempt(identity: CompletionAttemptIdentity): CompletionAttempt {
  return this.exclusive(() => {
  validateIdentity(identity); identity = structuredClone(identity);
  if (this.attempts.has(identity.operationId)) throw new Error('Duplicate operation');
  for (const a of this.attempts.values()) {
   if (a.identity.accountId === identity.accountId && a.identity.taskId === identity.taskId && a.identity.targetRevision === identity.targetRevision && !['BLOCKED', 'AUTH_REQUIRED', 'CANCELLED_BEFORE_SUBMIT'].includes(a.state)) throw new Error('Task target already reserved');
  }
  return this.record(identity, 'DISCOVERED');
  });
 }
 transition(operationId: string, state: CompletionState): CompletionAttempt {
  return this.exclusive(() => {
  const prior = this.attempts.get(operationId); if (!prior) throw new Error('Unknown operation');
  if (this.reconcile.has(operationId) && !['VERIFYING', ...outcomes].includes(state)) throw new Error('Reconcile only after recovery');
  if (!validTransition(prior.state, state)) throw new Error('Invalid transition');
  return this.record(prior.identity, state);
  });
 }
 private record(identity: CompletionAttemptIdentity, state: CompletionState): CompletionAttempt {
  const body = { sequence: this.history.length + 1, previousHash: this.history.at(-1)?.hash ?? '0'.repeat(64), identity, state };
  const event = { ...body, hash: digest(JSON.stringify(body)) };
  try {
   safeDirectory(this.root);
   const names = readdirSync(this.root).sort();
   if (names.length !== this.history.length) throw new Error('Journal changed or corrupt');
   for (const [index, prior] of this.history.entries()) {
    if (names[index] !== `${String(index + 1).padStart(12, '0')}.json` || safeRead(join(this.root, names[index]), 32768).toString('utf8') !== `${JSON.stringify(prior)}\n`) throw new Error('Journal changed or corrupt');
   }
   const fd = openSync(join(this.root, `${String(body.sequence).padStart(12, '0')}.json`), 'wx', 0o600);
   try { writeFileSync(fd, `${JSON.stringify(event)}\n`); fsyncSync(fd); } finally { closeSync(fd); }
   syncDirectory(this.root);
  } catch (error) { this.failed = true; throw error; }
  this.history.push(event); this.attempts.set(identity.operationId, { identity, state }); return this.get(identity.operationId)!;
 }
 get(operationId: string): CompletionAttempt | undefined { const value = this.attempts.get(operationId); return value ? structuredClone(value) : undefined; }
 recoveryMode(operationId: string): 'RECONCILE_ONLY' | 'CONTINUE' {
  if (!this.attempts.has(operationId)) throw new Error('Unknown operation');
  return this.reconcile.has(operationId) ? 'RECONCILE_ONLY' : 'CONTINUE';
 }
 events(): CompletionJournalEvent[] { return structuredClone(this.history); }
 close(): void { if (this.busy) throw new Error('Reentrant journal close'); if (!this.closed) { this.closed = true; owners.delete(this.ownerKey); } }
}
