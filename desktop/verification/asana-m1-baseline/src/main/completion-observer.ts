import type {CompletionJournalEvent} from './completion-journal';
import type {Snapshot} from '../shared/types';
import type {CompletionObservation} from '../shared/completion-observation';
export type {CompletionObservation} from '../shared/completion-observation';
/** Pure read model. Read-only observation never enrolls an agent or starts a job. */
export function completionObservation(events:CompletionJournalEvent[],snapshot:Snapshot|null,journalAvailable=true):CompletionObservation{
 const latest=new Map<string,CompletionJournalEvent>();for(const event of events)latest.set(event.identity.operationId,event);
 const unresolved=new Set(['SUBMIT_INTENT','SUBMITTED','UPLOAD_INTENT','UPLOADED','VERIFYING','SAVED_WITH_DISCREPANCY','OUTCOME_UNKNOWN']);
 const recent=[...latest.values()].sort((a,b)=>b.sequence-a.sequence);
 return {mode:'assessment-only',liveWritesEnabled:false,reasonCodes:['AGENT_ENROLLMENT_UNVERIFIED',...(!journalAvailable?['JOURNAL_UNAVAILABLE']:[])],journalAvailable,operationCount:latest.size,unresolvedCount:recent.filter(e=>unresolved.has(e.state)).length,rawRowsAvailable:!!snapshot?.sourceRows,intermediateTaskCount:snapshot?.sourceRows?snapshot.sourceRows.filter(r=>r[12]==='Update Task').length:null,recent:recent.slice(0,20).map(e=>({operationId:e.identity.operationId,taskNo:e.identity.taskId,state:e.state}))};
}
