import {describe,it,expect} from 'vitest';
import {completionObservation} from '../src/main/completion-observer';
import type {CompletionJournalEvent} from '../src/main/completion-journal';

describe('completion observer never grants mutation authority',()=>{
 it('reports enrollment blocked even if caller labels or environment claim agent',()=>{
  const s=completionObservation([],null);
  expect(s.mode).toBe('assessment-only');expect(s.liveWritesEnabled).toBe(false);
  expect(s.reasonCodes).toContain('AGENT_ENROLLMENT_UNVERIFIED');
  expect(s.rawRowsAvailable).toBe(false);expect(s.unresolvedCount).toBe(0);
 });
 it('retains intermediate raw statuses and journal discrepancies outside active filters',()=>{
  const event=(operationId:string,state:string,sequence:number)=>({sequence,identity:{operationId,taskId:'EXACT '+operationId},state}) as CompletionJournalEvent;
  const snapshot={sourceRows:[['','A','','','','','','','','','','','Update Task'],['','B','','','','','','','','','','','Solved']]} as any;
  const s=completionObservation([event('op1','SUBMIT_INTENT',1),event('op1','SAVED_WITH_DISCREPANCY',2),event('op2','VERIFIED',3)],snapshot);
  expect(s.operationCount).toBe(2);expect(s.unresolvedCount).toBe(1);expect(s.intermediateTaskCount).toBe(1);
  expect(s.recent[0]).toEqual({operationId:'op2',taskNo:'EXACT op2',state:'VERIFIED'});
  expect(snapshot.sourceRows[0][12]).toBe('Update Task');
 });
 it('reports journal corruption as unavailable rather than silently zero healthy operations',()=>{
  const s=completionObservation([],null,false);expect(s.journalAvailable).toBe(false);
  expect(s.reasonCodes).toContain('JOURNAL_UNAVAILABLE');expect(s.liveWritesEnabled).toBe(false);
 });
});
