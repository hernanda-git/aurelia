import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, isAbsolute, join, parse, resolve } from 'node:path';
import { closeSync, constants, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { AgentCapabilityAuthority, type CapabilityScope } from './agent-capability';
import { CompletionJournal, type CompletionState } from './completion-journal';
import { CompletionEvidenceStore, type StagedCompletionEvidence } from './completion-evidence';
import { PortalCoordinator } from './portal-coordinator';
import { assessCompletion } from './completion-policy';
import { verifyCompletion } from './completion-verification';
import type { CompletionLivePreflight, CompletionPolicy, CompletionProposal, CompletionVerificationInput, CompletionVerificationResult } from '../shared/completion-types';
import type { CompletionStagedFile } from './portal-completion';
import type { CompletionNotificationOutbox, CompletionNotificationSender, CompletionNotificationOutcome } from './completion-notifications';
const digest = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
function freeze<T>(value: T): T {
 if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
 return value;
}
/** Private immutable records; file fsync mandatory. Windows directory metadata cannot
 * be fsynced: process-crash durability only, not power loss. No same-user tamper guarantee. */
export class CompletionRecordStore {
 readonly root: string;
 private failed = false;
 constructor(root: string) { this.root = this.directory(root, true); }
 private directory(path: string, create = false): string {
  if (!isAbsolute(path) || /^[\\/]{2}/.test(path) || /[\x00-\x1f]/.test(path)
   || path.split(/[\\/]/).some((p,n)=>p==='.'||p==='..'||/[. ]$/.test(p)||(n>0&&/[:*?"<>|]/.test(p)))) throw Error('UNSAFE_COMPLETION_ROOT');
  const full=resolve(path); if(full===parse(full).root)throw Error('UNSAFE_COMPLETION_ROOT');
  const ancestors:string[]=[]; for(let p=full;;p=dirname(p)){ancestors.unshift(p);if(p===dirname(p))break;}
  for(const p of ancestors){let st;try{st=lstatSync(p);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
   if(!st&&create){mkdirSync(p,{mode:0o700});st=lstatSync(p);}if(!st||st.isSymbolicLink()||!st.isDirectory())throw Error('UNSAFE_COMPLETION_ROOT');}
  if(process.platform!=='win32'&&(lstatSync(full).mode&0o022))throw Error('UNSAFE_COMPLETION_ROOT');return full;
 }
 private path(name:string):string{if(!/^[a-zA-Z0-9_-]+\.json$/.test(name))throw Error('UNSAFE_RECORD_NAME');this.directory(this.root);return join(this.root,name);}
 names():string[]{return readdirSync(this.root).sort();}
 read<T>(name:string):T|undefined {
  const path=this.path(name);let before;try{before=lstatSync(path);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw e;}
  if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||before.size>2*1024*1024)throw Error('UNSAFE_COMPLETION_RECORD');
  const fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  try{const st=fstatSync(fd);if(st.ino!==before.ino||st.dev!==before.dev||st.nlink!==1||!st.isFile())throw Error('UNSAFE_COMPLETION_RECORD');
   const text=readFileSync(fd,'utf8');const after=lstatSync(path);if(after.isSymbolicLink()||after.nlink!==1||after.ino!==st.ino||after.dev!==st.dev||Buffer.byteLength(text)>2*1024*1024)throw Error('UNSAFE_COMPLETION_RECORD');
   const record=JSON.parse(text);if(text!==JSON.stringify(record)+'\n')throw Error('CORRUPT_COMPLETION_RECORD');return record as T;
  }finally{closeSync(fd);}
 }
 write(name:string,value:unknown):void {
  if(this.failed)throw Error('COMPLETION_STORAGE_FAILED_CLOSED');
  try{const fd=openSync(this.path(name),'wx',0o600);try{writeFileSync(fd,JSON.stringify(value)+'\n');fsyncSync(fd);}finally{closeSync(fd);}
   let dir:number;try{dir=openSync(this.root,'r');}catch(e){if(process.platform==='win32'&&['EPERM','EISDIR','EINVAL','ENOTSUP'].includes((e as NodeJS.ErrnoException).code??''))return;throw e;}
   try{fsyncSync(dir);}catch(e){if(!(process.platform==='win32'&&['EPERM','EISDIR','EINVAL','ENOTSUP'].includes((e as NodeJS.ErrnoException).code??'')))throw e;}finally{closeSync(dir);}
  }catch(e){this.failed=true;throw e;}
 }
}
export interface SealedCompletion {
 operationId:string; accountId:string; principal:string; runId:string; preparedAt:string;
 proposal:CompletionProposal; evidence:StagedCompletionEvidence; policyDigest:string;
}
/** Host binds exact identity, e.g. by wrapping PortalCompletionDriver. */
export interface CompletionDriver {
 stage():Promise<unknown>; submit():Promise<unknown>; attach(file:CompletionStagedFile):Promise<unknown>;
 upload():Promise<unknown>; captureSaved():Promise<unknown>;
}
export interface CompletionEngineDependencies {
 root:string; accountId:string; authority:AgentCapabilityAuthority; journal:CompletionJournal;
 evidence:CompletionEvidenceStore; coordinator:PortalCoordinator;
 policy():CompletionPolicy; now():string;
 notifications?:CompletionNotificationOutbox; notificationSender?:CompletionNotificationSender;
 refreshCache?:(result:Readonly<CompletionEngineResult>)=>Promise<void>;
 refreshProjection?:(result:Readonly<CompletionEngineResult>)=>Promise<void>;
 verifySource?:(sealed:Readonly<SealedCompletion>)=>Promise<boolean>;
 preflight:(sealed:Readonly<SealedCompletion>,driver:CompletionDriver)=>Promise<CompletionLivePreflight>;
 driverFactory:(sealed:Readonly<SealedCompletion>)=>CompletionDriver;
 mapReadback:(raw:unknown,sealed:Readonly<SealedCompletion>)=>Pick<CompletionVerificationInput,'views'|'attachment'>;
 semanticContract:CompletionVerificationInput['semanticContract']; maxReadbackAgeMs:number;
}
export interface PreparedCompletion {operationId:string;proposalDigest:string;evidenceDigest:string;capability?:string;replayed:boolean}
export type CompletionPublicationState='not_requested'|'fresh'|'stale';
export type CompletionNotificationState='not_configured'|'pending'|'sent'|'failed';
export interface CompletionEngineResult {operationId:string;state:CompletionState;verification?:CompletionVerificationResult;cacheState:CompletionPublicationState;projectionState:CompletionPublicationState;notificationState:CompletionNotificationState}
export class CompletionEngine {
 private readonly store:CompletionRecordStore;
 constructor(private readonly deps:CompletionEngineDependencies){this.store=new CompletionRecordStore(deps.root);}
 private scope(sealed:SealedCompletion):CapabilityScope{return {taskNo:sealed.proposal.identity.listTaskNo,proposalDigest:digest(JSON.stringify(sealed)),evidenceDigest:sealed.evidence.sha256,policyRevision:sealed.proposal.policyRevision};}
 get(operationId:string):{sealed:Readonly<SealedCompletion>;consumed:boolean;state:CompletionState}|undefined {
  const attempt=this.deps.journal.get(operationId);if(!attempt)return undefined;
  const sealed=this.store.read<SealedCompletion>(`${operationId}-proposal.json`);if(!sealed||digest(JSON.stringify(sealed))!==attempt.identity.proposalDigest||sealed.operationId!==operationId||sealed.evidence.sha256!==attempt.identity.evidenceDigest)throw Error('PROPOSAL_SEAL_MISMATCH');
  return {sealed:freeze(sealed),consumed:!!this.store.read(`${operationId}-consumed.json`),state:attempt.state};
 }
 async prepare(session:object,input:{proposal:CompletionProposal;bytes:Uint8Array}):Promise<PreparedCompletion>{
  const identity=this.deps.authority.identity(session);
  if(!input||Object.keys(input).some(k=>!['proposal','bytes'].includes(k)))throw Error('UNTRUSTED_COMPLETION_FIELDS');
  const proposal=structuredClone(input.proposal);
  const prior=this.deps.journal.events().find(e=>e.identity.accountId===this.deps.accountId&&e.identity.taskId===proposal.identity.listTaskNo&&e.identity.targetRevision===proposal.targetDate.iso);
  if(prior){const existing=this.get(prior.identity.operationId)!;if(existing.sealed.principal!==identity.principal)throw Error('AGENT_UNAUTHORIZED');return {operationId:prior.identity.operationId,proposalDigest:prior.identity.proposalDigest,evidenceDigest:prior.identity.evidenceDigest,replayed:true};}
  const evidence=this.deps.evidence.stage({taskKey:proposal.identity.listTaskNo,mediaType:'image/png',bytes:input.bytes,provenance:{taskKey:proposal.identity.listTaskNo,source:proposal.evidence.provenance.uri,capturedAt:proposal.evidence.capturedAt}});
  if(evidence.sha256!==proposal.evidence.sha256||evidence.byteLength!==proposal.evidence.byteLength||proposal.evidence.mimeType!==evidence.mediaType)throw Error('EVIDENCE_BINDING_MISMATCH');
  proposal.evidence.fileName=basename(evidence.path);const operationId='op-'+randomUUID();
  const sealed=freeze({operationId,accountId:this.deps.accountId,principal:identity.principal,runId:identity.runId,preparedAt:this.deps.now(),proposal,evidence,policyDigest:digest(JSON.stringify(this.deps.policy()))});const scope=this.scope(sealed);
  this.store.write(`${operationId}-proposal.json`,sealed);
  this.deps.journal.createAttempt({operationId,accountId:sealed.accountId,taskId:proposal.identity.listTaskNo,targetRevision:proposal.targetDate.iso,proposalDigest:scope.proposalDigest,evidenceDigest:scope.evidenceDigest,policyRevision:scope.policyRevision});
  this.deps.journal.transition(operationId,'ASSESSED');this.deps.journal.transition(operationId,'EVIDENCE_READY');this.deps.journal.transition(operationId,'PREPARED');
  return {operationId,proposalDigest:scope.proposalDigest,evidenceDigest:scope.evidenceDigest,capability:this.deps.authority.issue(session,scope),replayed:false};
 }
 private result(operationId:string):CompletionEngineResult {
  const state=this.deps.journal.get(operationId)!.state;
  try{
  // Only completed artifact pairs are results; partial/orphan verification JSON is audit material.
  const prefix=operationId+'-capture-completed-';
  const completed=this.store.names().filter(n=>n.startsWith(prefix)&&/^\d+\.json$/.test(n.slice(prefix.length)))
   .sort((a,b)=>a.length-b.length||a.localeCompare(b)).at(-1);
  const sequence=completed?this.store.read<{sequence:string}>(completed)?.sequence:undefined;
  if(completed&&completed!==`${prefix}${sequence}.json`)throw Error('CORRUPT_CAPTURE_COMPLETION');
  // Compatibility: old-format pairs completed only when their outcome reached the journal.
  const legacy=this.deps.journal.events().filter(e=>e.identity.operationId===operationId&&['VERIFIED','SAVED_WITH_DISCREPANCY','OUTCOME_UNKNOWN'].includes(e.state)).at(-1);
  const name=sequence?`${operationId}-verification-${sequence}.json`:legacy?`${operationId}-verification-${String(legacy.sequence-1).padStart(12,'0')}.json`:undefined;
  const publication=this.store.names().filter(n=>n.startsWith(operationId+'-publication-')).at(-1);
  const status=publication?this.store.read<{cacheState:CompletionPublicationState;projectionState:CompletionPublicationState;notificationState:CompletionNotificationState}>(publication):undefined;
  const remoteOutcome=['VERIFIED','SAVED_WITH_DISCREPANCY','OUTCOME_UNKNOWN'].includes(state);
  return {operationId,state,verification:name?this.store.read<CompletionVerificationResult>(name):undefined,
   cacheState:status?.cacheState??(remoteOutcome&&this.deps.refreshCache?'stale':'not_requested'),
   projectionState:status?.projectionState??(remoteOutcome&&this.deps.refreshProjection?'stale':'not_requested'),
   notificationState:status?.notificationState??(remoteOutcome&&this.deps.notifications?'failed':'not_configured')};
  }catch{
   // The journal outcome is independent of inaccessible local result/publication files.
   return {operationId,state,cacheState:'stale',projectionState:'stale',notificationState:this.deps.notifications?'failed':'not_configured'};
  }
 }
 private async publish(result:CompletionEngineResult):Promise<CompletionEngineResult>{
  let cacheState:CompletionPublicationState=this.deps.refreshCache?'stale':'not_requested';
  let projectionState:CompletionPublicationState=this.deps.refreshProjection?'stale':'not_requested';
  if(this.deps.refreshCache)try{await this.deps.refreshCache(freeze(structuredClone(result)));cacheState='fresh';}catch{/* Remote outcome is immutable, never a retry authorization. */}
  if(cacheState!=='stale'&&this.deps.refreshProjection)try{await this.deps.refreshProjection(freeze({...structuredClone(result),cacheState}));projectionState='fresh';}catch{/* Keep last good projection. */}
  let notificationState:CompletionNotificationState=this.deps.notifications?'failed':'not_configured';
  if(this.deps.notifications&&['VERIFIED','SAVED_WITH_DISCREPANCY','OUTCOME_UNKNOWN'].includes(result.state))try{
   const item=this.deps.notifications.enqueue({operationId:result.operationId,state:result.state as CompletionNotificationOutcome});
   notificationState=item.state;
   if(this.deps.notificationSender){const items=await this.deps.notifications.flush(this.deps.notificationSender);notificationState=items.find(n=>n.id===item.id)?.state??'failed';}
  }catch{/* Outbox failure is not remote failure and cannot authorize re-submission. */}
  const next={...result,cacheState,projectionState,notificationState};
  try{
   const sequence=String(this.store.names().filter(n=>n.startsWith(result.operationId+'-publication-')).length+1).padStart(12,'0');
   this.store.write(`${result.operationId}-publication-${sequence}.json`,{cacheState,projectionState,notificationState});
  }catch{return {...next,cacheState:'stale',projectionState:'stale'};}
  return next;
 }
 private async readSaved(sealed:Readonly<SealedCompletion>,driver:CompletionDriver):Promise<CompletionEngineResult>{
  const operationId=sealed.operationId;
  if(this.deps.journal.get(operationId)!.state!=='VERIFYING')this.deps.journal.transition(operationId,'VERIFYING');
  let raw:unknown=null;
  let verification:CompletionVerificationResult;
  try{
   raw=await driver.captureSaved();
   const mapped=this.deps.mapReadback(raw,sealed);
   const consumed=this.store.read<{at:string}>(`${operationId}-consumed.json`);
   // Select observations only: a mapper cannot override trusted expected/clock/semantics.
   verification=verifyCompletion({schemaVersion:1,now:this.deps.now(),submittedAt:consumed?.at??sealed.preparedAt,maxReadbackAgeMs:this.deps.maxReadbackAgeMs,semanticContract:this.deps.semanticContract,views:mapped.views,attachment:mapped.attachment,expected:{identity:sealed.proposal.identity,targetDate:sealed.proposal.targetDate,finishDate:sealed.proposal.proposedPesFinishDate,attachmentName:sealed.proposal.evidence.fileName,attachmentSha256:sealed.evidence.sha256}});
  }catch{verification={outcome:'OUTCOME_UNKNOWN',reasonCodes:['REQUIRED_VIEW_MISSING'],remoteViews:null,attachmentVerification:'unavailable',retryMutation:false};}
  // Existing names reserve identities even when their contents are partial/corrupt. The
  // coordinator + host single-instance lock serialize allocation; wx remains fail-closed.
  let last=BigInt(this.deps.journal.events().length);
  for(const name of this.store.names()){
   if(!name.startsWith(operationId+'-'))continue;
   const match=/^(?:readback|verification|capture-completed)-(\d+)\.json$/.exec(name.slice(operationId.length+1));
   if(match&&BigInt(match[1])>last)last=BigInt(match[1]);
  }
  const sequence=String(last+1n).padStart(12,'0');
  this.store.write(`${operationId}-readback-${sequence}.json`,{raw});
  this.store.write(`${operationId}-verification-${sequence}.json`,verification);
  this.store.write(`${operationId}-capture-completed-${sequence}.json`,{sequence});
  this.deps.journal.transition(operationId,verification.outcome);
  return this.publish({...this.result(operationId),verification});
 }
 /** Trusted host read-only API; never re-stages, attaches, submits or uploads. */
 async reconcile(operationId:string):Promise<CompletionEngineResult>{
  return this.deps.coordinator.run('reconcile',async()=>{
   const record=this.get(operationId);if(!record)throw Error('UNKNOWN_OPERATION');
   if(record.state==='VERIFIED')return this.publish(this.result(operationId));
   if(!['SUBMIT_INTENT','SUBMITTED','UPLOAD_INTENT','UPLOADED','VERIFYING','OUTCOME_UNKNOWN','SAVED_WITH_DISCREPANCY'].includes(record.state))return this.result(operationId);
   return this.readSaved(record.sealed,this.deps.driverFactory(record.sealed));
  });
 }
 async commit(session:object,input:{operationId:string;capability:string},signal?:AbortSignal):Promise<CompletionEngineResult>{
  return this.deps.coordinator.run('completion',async()=>{
   const record=this.get(input.operationId);if(!record)throw Error('UNKNOWN_OPERATION');const {sealed}=record;
   const identity=this.deps.authority.identity(session);if(identity.principal!==sealed.principal||identity.runId!==sealed.runId)throw Error('AGENT_UNAUTHORIZED');
   if(record.state!=='PREPARED'||record.consumed)return this.result(sealed.operationId);
   const cancelled=()=>{if(!signal?.aborted)return false;this.deps.journal.transition(sealed.operationId,'CANCELLED_BEFORE_SUBMIT');return true;};
   if(cancelled())return this.result(sealed.operationId);
   let intent=false;
   try{
    const events=this.deps.journal.events().filter(e=>e.identity.accountId===sealed.accountId&&e.identity.operationId!==sealed.operationId);
    const latest=new Map(events.map(e=>[e.identity.operationId,e.state]));
    // A historical discrepancy latches the rollout closed; no agent reset path.
    if(events.some(e=>e.state==='SAVED_WITH_DISCREPANCY')||[...latest.values()].some(s=>['SUBMIT_INTENT','SUBMITTED','UPLOAD_INTENT','UPLOADED','VERIFYING','OUTCOME_UNKNOWN'].includes(s)))throw Error('COMPLETION_CIRCUIT_OPEN');
    const checkPolicy=()=>{if(sealed.policyDigest!==digest(JSON.stringify(this.deps.policy())))throw Error('PREPARED_POLICY_CHANGED');};
    checkPolicy();
    if(await this.deps.verifySource?.(sealed)!==true)throw Error('AUTHORITATIVE_SOURCE_UNVERIFIED');
    const driver=this.deps.driverFactory(sealed);const live=await this.deps.preflight(sealed,driver);
    const decision=assessCompletion({schemaVersion:1,now:this.deps.now(),policy:this.deps.policy(),proposal:sealed.proposal,live});
    if(!decision.eligible)throw Error('COMPLETION_POLICY_DENIED:'+decision.reasonCodes.join(','));
    if(cancelled())return this.result(sealed.operationId);
    this.deps.evidence.validate(sealed.evidence,sealed.proposal.identity.listTaskNo);
    await driver.stage();
    if(cancelled())return this.result(sealed.operationId);
    checkPolicy();
    const finalDecision=assessCompletion({schemaVersion:1,now:this.deps.now(),policy:this.deps.policy(),proposal:sealed.proposal,live});
    if(!finalDecision.eligible)throw Error('COMPLETION_POLICY_DENIED:'+finalDecision.reasonCodes.join(','));
    this.deps.journal.transition(sealed.operationId,'PRECHECKED');
    this.deps.authority.consume(session,input.capability,this.scope(sealed),()=>this.store.write(`${sealed.operationId}-consumed.json`,{operationId:sealed.operationId,at:this.deps.now()}));
    this.deps.journal.transition(sealed.operationId,'SUBMIT_INTENT');intent=true;
    await driver.submit();this.deps.journal.transition(sealed.operationId,'SUBMITTED');
    const file={filePath:sealed.evidence.path,fileName:sealed.proposal.evidence.fileName,size:sealed.evidence.byteLength,mime:sealed.evidence.mediaType,sha256:sealed.evidence.sha256};
    this.deps.evidence.validate(sealed.evidence,sealed.proposal.identity.listTaskNo);await driver.attach(file);
    this.deps.journal.transition(sealed.operationId,'UPLOAD_INTENT');await driver.upload();this.deps.journal.transition(sealed.operationId,'UPLOADED');
    return await this.readSaved(sealed,driver);
   }catch(error){
    if(!intent){this.deps.journal.transition(sealed.operationId,'BLOCKED');throw error;}
    // Never retry a mutation. A new driver has no staged/submitted/upload state.
    return this.readSaved(sealed,this.deps.driverFactory(sealed));
   }
  });
 }
}

