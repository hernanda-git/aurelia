import { describe, expect, it } from 'vitest';
import { fixture } from './completion.test';
import { CompletionEngine } from '../src/main/completion';
import { CompletionJournal, type CompletionState } from '../src/main/completion-journal';

describe('crash recovery is read only — synthetic fixture only',()=>{
 it('restart after remote verification but before publication reports stale without resubmission',async()=>{
  const f=await fixture();const p=await f.engine.prepare(f.session,{proposal:f.proposal,bytes:f.bytes});
  for(const state of ['PRECHECKED','SUBMIT_INTENT','SUBMITTED','UPLOAD_INTENT','UPLOADED','VERIFYING','VERIFIED'] as const)f.journal.transition(p.operationId,state);
  f.deps.refreshCache=async()=>{f.calls.push('cache');};f.deps.refreshProjection=async()=>{f.calls.push('projection');};
  const restarted=new CompletionEngine(f.deps);const r=await restarted.commit(f.session,{operationId:p.operationId,capability:p.capability!});
  expect(r.state).toBe('VERIFIED');expect(r.cacheState).toBe('stale');expect(r.projectionState).toBe('stale');expect(f.calls).toEqual([]);
  expect((await restarted.reconcile(p.operationId)).projectionState).toBe('fresh');expect(f.calls).toEqual(['cache','projection']);
 });
 it('cancellation after submit never claims rollback and still reconciles',async()=>{
  const f=await fixture();const abort=new AbortController();const factory=f.deps.driverFactory;
  f.deps.driverFactory=s=>{const d=factory(s);d.submit=async()=>{f.calls.push('submit');abort.abort();};return d;};
  const p=await f.engine.prepare(f.session,{proposal:f.proposal,bytes:f.bytes});
  const r=await f.engine.commit(f.session,{operationId:p.operationId,capability:p.capability!},abort.signal);
  expect(r.state).toBe('VERIFIED');expect(f.calls).toEqual(['preflight','stage','submit','attach','upload','capture']);
  await new CompletionEngine(f.deps).reconcile(p.operationId);expect(f.calls.filter(c=>c==='submit')).toHaveLength(1);
 });
 it('cancellation while waiting for the portal lease is durably recorded without preflight',async()=>{
  const f=await fixture();const p=await f.engine.prepare(f.session,{proposal:f.proposal,bytes:f.bytes});let release!:()=>void;
  const held=f.deps.coordinator.run('sync',()=>new Promise<void>(resolve=>{release=resolve;}));await Promise.resolve();
  const abort=new AbortController();const pending=f.engine.commit(f.session,{operationId:p.operationId,capability:p.capability!},abort.signal);
  abort.abort();release();await held;
  expect((await pending).state).toBe('CANCELLED_BEFORE_SUBMIT');expect(f.calls).toEqual([]);
  expect(new CompletionEngine(f.deps).get(p.operationId)?.state).toBe('CANCELLED_BEFORE_SUBMIT');
 });
 it.each(['SUBMIT_INTENT','SUBMITTED','UPLOAD_INTENT','UPLOADED','VERIFYING','OUTCOME_UNKNOWN','SAVED_WITH_DISCREPANCY'] as const)('fresh driver capture only from %s',async boundary=>{
  const f=await fixture();const p=await f.engine.prepare(f.session,{proposal:f.proposal,bytes:f.bytes});
  const path:CompletionState[]=['PRECHECKED','SUBMIT_INTENT','SUBMITTED','UPLOAD_INTENT','UPLOADED','VERIFYING'];
  for(const state of path){f.journal.transition(p.operationId,state);if(state===boundary)break;}
  if(boundary==='OUTCOME_UNKNOWN'||boundary==='SAVED_WITH_DISCREPANCY')f.journal.transition(p.operationId,boundary);
  f.journal.close();const journal=new CompletionJournal(f.journal.root);
  try{const restarted=new CompletionEngine({...f.deps,journal});const r=await restarted.reconcile(p.operationId);
   expect(r.state).toBe('VERIFIED');expect(f.calls).toEqual(['capture']);
   await restarted.commit(f.session,{operationId:p.operationId,capability:p.capability!});expect(f.calls).toEqual(['capture']);
  }finally{journal.close();}
 });
 it.each(['submit','upload'] as const)('uncertain %s never retries and reconciles on a fresh driver',async boundary=>{
  const f=await fixture();delete f.observed.views.info;const factory=f.deps.driverFactory;let instances=0;
  f.deps.driverFactory=s=>{instances++;const d=factory(s);d[boundary]=async()=>{f.calls.push(boundary);throw Error('FIXTURE timeout after possible remote action');};return d;};
  const p=await f.engine.prepare(f.session,{proposal:f.proposal,bytes:f.bytes});
  const r=await f.engine.commit(f.session,{operationId:p.operationId,capability:p.capability!});
  expect(r.state).toBe('OUTCOME_UNKNOWN');expect(f.calls.filter(c=>c===boundary)).toHaveLength(1);
  expect(f.calls.filter(c=>c==='capture')).toHaveLength(1);expect(instances).toBe(2);
  await f.engine.commit(f.session,{operationId:p.operationId,capability:p.capability!});expect(f.calls.filter(c=>c===boundary)).toHaveLength(1);
 });
});
