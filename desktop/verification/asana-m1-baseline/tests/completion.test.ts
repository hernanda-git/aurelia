import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('node:fs', async importOriginal => {
 const actual = await importOriginal<typeof import('node:fs')>();
 return {...actual, openSync:vi.fn(actual.openSync), writeFileSync:vi.fn(actual.writeFileSync), fsyncSync:vi.fn(actual.fsyncSync)};
});
import * as fs from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { PNG } from 'pngjs';
import { createHash } from 'node:crypto';
import { CompletionEngine, CompletionRecordStore, type CompletionEngineDependencies } from '../src/main/completion';
import { CompletionNotificationOutbox } from '../src/main/completion-notifications';
import { AgentCapabilityAuthority } from '../src/main/agent-capability';
import { CompletionJournal } from '../src/main/completion-journal';
import { CompletionEvidenceStore } from '../src/main/completion-evidence';
import { PortalCoordinator } from '../src/main/portal-coordinator';
import type { CompletionProposal, CompletionPolicy, CompletionLivePreflight, CompletionVerificationInput } from '../src/shared/completion-types';

const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(fn => fn()); });
/** FIXTURE ONLY: synthetic enrolled principal/source verifier, not real enrollment evidence. */
export async function fixture() {
 const root = mkdtempSync(join(tmpdir(), 'completion-engine-fixture-'));
 cleanup.push(() => rmSync(root, {recursive:true,force:true}));
 const now = '2026-10-26T06:00:00.000Z';
 const identity = {listTaskNo:'Fixture/Task. IT/1026',detailTaskNo:'Fixture/Task.IT/1026',pic:'3220',department:'32',originUrl:'https://example.test/task/fixture'};
 const date = {iso:'2026-10-23',raw:'23-Okt-2026'};
 const provenance = {kind:'task_system' as const,uri:identity.originUrl,taskUrl:identity.originUrl,revision:'fixture-r1',capturedAt:now};
 const image=new PNG({width:1,height:1});image.data=Buffer.from([24,120,64,255]);
 const bytes=PNG.sync.write(image); // Actual readable fixture PNG, not fabricated screenshot evidence.
 const proposal: CompletionProposal = {proposalId:'fixture-proposal',policyRevision:'completion-policy-v1',identity,taskType:'backend',goalScope:'be_development',rawGoal:'fixture implementation',sourceTaskUrl:identity.originUrl,targetDate:date,proposedPesFinishDate:date,observedCompletedAt:now,association:{identity,verifiedAt:now,provenance},sourceFacts:[{sourceTaskUrl:identity.originUrl,goalScope:'be_development',checks:['tests'],state:'completed',observedAt:now,provenance}],evidence:{identity,fileName:'fixture.png',mimeType:'image/png',byteLength:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),capturedAt:now,provenance,kind:'original_screenshot',secretsReviewed:true}};
 const policy: CompletionPolicy = {revision:'completion-policy-v1',approvedBy:'FIXTURE ONLY',approvedAt:now,enabled:true,finishDatePolicy:'target_date',timezone:'Asia/Jakarta',maxLiveAgeMs:60000,maxPreflightAgeMs:10000,maxSourceAgeMs:60000,maxEvidenceAgeMs:60000,maxAttachmentBytes:50000,allowedMimeTypes:['image/png'],taskRules:[{taskType:'backend',goalScope:'be_development',requiredChecks:['tests'],minAuthoritativeSources:1,allowedSourceKinds:['task_system'],allowReadyForQa:false}]};
 const live: CompletionLivePreflight = {identity,taskType:proposal.taskType,goalScope:proposal.goalScope,rawGoal:proposal.rawGoal,sourceTaskUrl:identity.originUrl,targetDate:date,listStatus:'Open',detailStatus:'Open',updateEnabled:true,capturedAt:now,preflightAt:now,underLock:true,priorAttempt:'none',unresolvedDiscrepancy:false};
 const authority = new AgentCapabilityAuthority(async()=>({principal:'FIXTURE ONLY',runId:'fixture-run',expiresAt:Date.parse(now)+60000}),()=>Date.parse(now));
 const session = await authority.enroll('FIXTURE ONLY');
 const journal = new CompletionJournal(join(root,'journal')); cleanup.push(()=>journal.close());
 const calls: string[] = [];
 const observed: Pick<CompletionVerificationInput,'views'|'attachment'> = {views:{}};
 for(const key of ['list','detail','targetTable','info'] as const) observed.views[key] = {taskNo:key==='detail'||key==='targetTable'?identity.detailTaskNo:identity.listTaskNo,pic:'3220',department:'32',originUrl:identity.originUrl,status:key==='detail'?'Selesai':'Solved',targetDate:date,finishDate:date,capturedAt:now,independentlyReopened:true};
 const deps: CompletionEngineDependencies = {root:join(root,'engine'),accountId:'fixture-account',authority,journal,evidence:new CompletionEvidenceStore(join(root,'evidence')),coordinator:new PortalCoordinator(),policy:()=>policy,now:()=>now,verifySource:async()=>true,preflight:async()=>{calls.push('preflight');return structuredClone(live);},driverFactory:sealed=>({stage:async()=>{calls.push('stage');},submit:async()=>{calls.push('submit');},attach:async file=>{calls.push('attach');expect(basename(file.filePath)).toBe(sealed.proposal.evidence.fileName);},upload:async()=>{calls.push('upload');},captureSaved:async()=>{calls.push('capture');return 'raw-fixture';}}),mapReadback:(_raw,sealed)=>({...observed,attachment:{identity,fileName:sealed.proposal.evidence.fileName,capturedAt:now,independentlyReopened:true,verification:'metadata_only'}}),semanticContract:{revision:'pes-selesai-solved-v1',approvedBy:'FIXTURE ONLY'},maxReadbackAgeMs:60000};
 return {root,now,proposal,bytes,policy,live,authority,session,journal,calls,observed,deps,engine:new CompletionEngine(deps)};
}

describe('internal completion orchestration — fixture only',()=>{
 it.each(['raw-created','raw-partial-write','raw-fsynced','verification-created','completion-marker-partial','completion-marker-fsynced','before-outcome'] as const)('FINAL-RECOVERY-001: fresh engine + journal recover read-only after %s',async boundary=>{
  const f=await fixture();const p=await f.engine.prepare(f.session,{proposal:f.proposal,bytes:f.bytes});
  const actual=await vi.importActual<typeof import('node:fs')>('node:fs');
  const realOpen=actual.openSync,realWrite=actual.writeFileSync,realSync=actual.fsyncSync;
  const descriptors=new Map<number,string>();let injected=0;
  const failure=()=>{injected++;throw Object.assign(Error('injected artifact crash boundary'),{code:'EIO'});};
  const open=vi.spyOn(fs,'openSync').mockImplementation((...args)=>{
   if(boundary==='before-outcome'&&args[1]==='wx'&&String(args[0]).startsWith(f.journal.root)&&f.journal.get(p.operationId)?.state==='VERIFYING')failure();
   const fd=realOpen(...args);if(args[1]==='wx')descriptors.set(fd,String(args[0]));else descriptors.delete(fd);return fd;
  });
  const write=vi.spyOn(fs,'writeFileSync').mockImplementation((...args)=>{
   const path=typeof args[0]==='number'?descriptors.get(args[0])??'':'';
   if(path.includes('-readback-')&&['raw-created','raw-partial-write'].includes(boundary)){
    if(boundary==='raw-partial-write')realWrite(args[0],'{"raw":');
    failure();
   }
   if(path.includes('-verification-')&&boundary==='verification-created')failure();
   if(path.includes('-capture-completed-')&&boundary==='completion-marker-partial'){realWrite(args[0],'{"sequence":');failure();}
   return realWrite(...args);
  });
  const sync=vi.spyOn(fs,'fsyncSync').mockImplementation(fd=>{
   realSync(fd);
   if((descriptors.get(fd)?.includes('-readback-')&&boundary==='raw-fsynced')||(descriptors.get(fd)?.includes('-capture-completed-')&&boundary==='completion-marker-fsynced'))failure();
  });
  try{
   await expect(f.engine.commit(f.session,{operationId:p.operationId,capability:p.capability!})).rejects.toThrow();
   expect(injected).toBeGreaterThan(0);expect(f.journal.get(p.operationId)?.state).toBe('VERIFYING');
  }finally{open.mockRestore();write.mockRestore();sync.mockRestore();}
  await expect(f.engine.reconcile(p.operationId)).rejects.toThrow(boundary==='before-outcome'?'Journal failed closed':'COMPLETION_STORAGE_FAILED_CLOSED');
  const rawFiles=fs.readdirSync(f.deps.root).filter(n=>n.includes('-readback-'));
  expect(rawFiles.length).toBeGreaterThan(0);
  const rawBytes=fs.readFileSync(join(f.deps.root,rawFiles[0]),'utf8');
  if(boundary==='raw-created')expect(rawBytes).toBe('');
  if(boundary==='raw-partial-write')expect(rawBytes).toBe('{"raw":');
  if(boundary==='raw-fsynced')expect(rawBytes).toBe('{"raw":"raw-fixture"}\n');
  // A prior corrupt orphan (including one sorting last) must survive, not become the result.
  fs.writeFileSync(join(f.deps.root,`${p.operationId}-verification-000000000100.json`),'{corrupt');
  fs.writeFileSync(join(f.deps.root,`${p.operationId}-verification-zzzz.json`),'{orphan');
  const preserved=new Map(fs.readdirSync(f.deps.root).map(name=>[name,fs.readFileSync(join(f.deps.root,name))]));
  f.journal.close();const journal=new CompletionJournal(f.journal.root);cleanup.push(()=>journal.close());
  expect(journal.recoveryMode(p.operationId)).toBe('RECONCILE_ONLY');
  const restart=new CompletionEngine({...f.deps,journal,coordinator:new PortalCoordinator()});
  const recovered=await restart.reconcile(p.operationId);
  expect(recovered.state).toBe('VERIFIED');expect(recovered.verification?.outcome).toBe('VERIFIED');
  for(let n=0;n<2;n++)expect((await restart.reconcile(p.operationId)).verification?.outcome).toBe('VERIFIED');
  expect((await restart.commit(f.session,{operationId:p.operationId,capability:p.capability!})).verification?.outcome).toBe('VERIFIED');
  for(const [name,bytes] of preserved)expect(fs.readFileSync(join(f.deps.root,name))).toEqual(bytes);
  expect(journal.events().filter(e=>e.state==='SUBMIT_INTENT')).toHaveLength(1);
  expect(journal.events().filter(e=>e.state==='UPLOAD_INTENT')).toHaveLength(1);
  expect(f.calls.filter(c=>c==='submit')).toHaveLength(1);expect(f.calls.filter(c=>c==='upload')).toHaveLength(1);
 });
 it('FINAL-RECOVERY-001: selects latest completed verification across ordered outcome changes, not later orphan JSON',async()=>{
  const f=await fixture();const p=await f.engine.prepare(f.session,{proposal:f.proposal,bytes:f.bytes});
  const info=f.observed.views.info!;delete f.observed.views.info;
  expect((await f.engine.commit(f.session,{operationId:p.operationId,capability:p.capability!})).state).toBe('OUTCOME_UNKNOWN');
  f.observed.views.info=info;f.observed.views.list!.status='Open';
  expect((await f.engine.reconcile(p.operationId)).state).toBe('SAVED_WITH_DISCREPANCY');
  let restart=new CompletionEngine(f.deps);
  expect((await restart.commit(f.session,{operationId:p.operationId,capability:p.capability!})).verification?.outcome).toBe('SAVED_WITH_DISCREPANCY');
  f.observed.views.list!.status='Solved';
  expect((await restart.reconcile(p.operationId)).state).toBe('VERIFIED');
  const orphan=`${p.operationId}-verification-999999999999.json`;
  fs.writeFileSync(join(f.deps.root,orphan),'{broken');
  f.journal.close();const journal=new CompletionJournal(f.journal.root);cleanup.push(()=>journal.close());
  restart=new CompletionEngine({...f.deps,journal,coordinator:new PortalCoordinator()});
  for(let n=0;n<2;n++)expect((await restart.reconcile(p.operationId)).verification?.outcome).toBe('VERIFIED');
  expect(fs.readFileSync(join(f.deps.root,orphan),'utf8')).toBe('{broken');
  expect(journal.events().slice(-5).map(e=>e.state)).toEqual(['OUTCOME_UNKNOWN','VERIFYING','SAVED_WITH_DISCREPANCY','VERIFYING','VERIFIED']);
  expect(f.calls.filter(c=>c==='capture')).toHaveLength(3);
  expect(f.calls.filter(c=>c==='submit')).toHaveLength(1);expect(f.calls.filter(c=>c==='upload')).toHaveLength(1);
 });
 it('preserves durable verification when result/publication directory enumeration fails',async()=>{
  const f=await fixture();f.deps.refreshCache=async()=>{};
  const p=await f.engine.prepare(f.session,{proposal:f.proposal,bytes:f.bytes});
  const original=CompletionRecordStore.prototype.names;
  CompletionRecordStore.prototype.names=function(){if(f.journal.get(p.operationId)?.state==='VERIFIED')throw Error('fixture names failure');return original.call(this);};
  try{
   const result=await f.engine.commit(f.session,{operationId:p.operationId,capability:p.capability!});
   expect(result.state).toBe('VERIFIED');expect(result.cacheState).toBe('stale');
   expect(f.journal.get(p.operationId)?.state).toBe('VERIFIED');
   const replay=await f.engine.commit(f.session,{operationId:p.operationId,capability:p.capability!});
   expect(replay.state).toBe('VERIFIED');expect(replay.cacheState).toBe('stale');
   expect(f.calls.filter(c=>c==='submit')).toHaveLength(1);expect(f.calls.filter(c=>c==='capture')).toHaveLength(1);
  }finally{CompletionRecordStore.prototype.names=original;}
 });
 it.each(['missing','false','throwing'] as const)('host source verifier defaults closed: %s',async mode=>{
  const f=await fixture();const p=await f.engine.prepare(f.session,{proposal:f.proposal,bytes:f.bytes});
  if(mode==='missing')delete f.deps.verifySource;
  if(mode==='false')f.deps.verifySource=async()=>false;
  if(mode==='throwing')f.deps.verifySource=async()=>{throw Error('source read unavailable');};
  await expect(f.engine.commit(f.session,{operationId:p.operationId,capability:p.capability!})).rejects.toThrow();
  expect(f.calls).toEqual([]);expect(f.engine.get(p.operationId)?.consumed).toBe(false);
 });
 it('rechecks host clock freshness immediately after staging',async()=>{
  const f=await fixture();const p=await f.engine.prepare(f.session,{proposal:f.proposal,bytes:f.bytes});
  const original=f.deps.driverFactory;f.deps.driverFactory=s=>{const d=original(s);d.stage=async()=>{f.deps.now=()=> '2026-10-26T07:00:00.000Z';};return d;};
  await expect(f.engine.commit(f.session,{operationId:p.operationId,capability:p.capability!})).rejects.toThrow('COMPLETION_POLICY_DENIED');
  expect(f.calls).not.toContain('submit');expect(f.engine.get(p.operationId)?.consumed).toBe(false);
 });
 it.each(['sender','enqueue'] as const)('notification %s failure cannot resubmit and read-only recovery delivers once',async boundary=>{
  const f=await fixture();const records=new CompletionRecordStore(join(f.root,'notifications'));let fail=true;let sends=0;
  f.deps.notifications=new CompletionNotificationOutbox(records);
  if(boundary==='enqueue')f.deps.notifications.enqueue=()=>{throw Error('fixture outbox unavailable');};
  f.deps.notificationSender=async n=>{sends++;if(fail)throw Error('fixture transport unavailable');return {id:n.id,acknowledged:true};};
  const p=await f.engine.prepare(f.session,{proposal:f.proposal,bytes:f.bytes});
  const r=await f.engine.commit(f.session,{operationId:p.operationId,capability:p.capability!});
  expect(r.state).toBe('VERIFIED');expect(r.notificationState).toBe(boundary==='sender'?'pending':'failed');
  f.deps.notifications=new CompletionNotificationOutbox(records);const restart=new CompletionEngine(f.deps);
  expect((await restart.commit(f.session,{operationId:p.operationId,capability:p.capability!})).notificationState).toBe(r.notificationState);
  fail=false;expect((await restart.reconcile(p.operationId)).notificationState).toBe('sent');
  const sent=sends;expect((await restart.reconcile(p.operationId)).notificationState).toBe('sent');expect(sends).toBe(sent);
  expect(f.calls.filter(c=>c==='submit')).toHaveLength(1);expect(f.calls.filter(c=>c==='upload')).toHaveLength(1);expect(records.names()).toHaveLength(2);
 });
 it.each(['SAVED_WITH_DISCREPANCY','OUTCOME_UNKNOWN'] as const)('stops subsequent operations after %s across restart',async outcome=>{
  const f=await fixture();const first=await f.engine.prepare(f.session,{proposal:f.proposal,bytes:f.bytes});
  const secondProposal=structuredClone(f.proposal);secondProposal.identity.listTaskNo='Second/Task. IT/1026';secondProposal.identity.detailTaskNo='Second/Task.IT/1026';secondProposal.evidence.identity=secondProposal.identity;secondProposal.association.identity=secondProposal.identity;
  const second=await f.engine.prepare(f.session,{proposal:secondProposal,bytes:f.bytes});
  if(outcome==='OUTCOME_UNKNOWN')delete f.observed.views.info;else f.observed.views.list!.status='Update Task';
  expect((await f.engine.commit(f.session,{operationId:first.operationId,capability:first.capability!})).state).toBe(outcome);
  const restart=new CompletionEngine(f.deps);f.live.identity=secondProposal.identity;
  await expect(restart.commit(f.session,{operationId:second.operationId,capability:second.capability!})).rejects.toThrow('COMPLETION_CIRCUIT_OPEN');
  expect(f.calls.filter(c=>c==='submit')).toHaveLength(1);expect(restart.get(second.operationId)?.consumed).toBe(false);
 });
 it.each(['cache','projection'] as const)('keeps verified remote outcome when %s refresh fails and recovers read-only',async failure=>{
  const f=await fixture();let fail=true;const refreshed:string[]=[];
  f.deps.refreshCache=async()=>{refreshed.push('cache');if(fail&&failure==='cache')throw Error('fixture cache failure');};
  f.deps.refreshProjection=async()=>{refreshed.push('projection');if(fail&&failure==='projection')throw Error('fixture projection failure');};
  const p=await f.engine.prepare(f.session,{proposal:f.proposal,bytes:f.bytes});
  const r=await f.engine.commit(f.session,{operationId:p.operationId,capability:p.capability!});
  expect(r.state).toBe('VERIFIED');expect(r.cacheState).toBe(failure==='cache'?'stale':'fresh');expect(r.projectionState).toBe('stale');
  const restarted=new CompletionEngine(f.deps);expect((await restarted.commit(f.session,{operationId:p.operationId,capability:p.capability!})).projectionState).toBe('stale');
  fail=false;const recovered=await restarted.reconcile(p.operationId);expect(recovered.cacheState).toBe('fresh');expect(recovered.projectionState).toBe('fresh');
  expect(f.calls.filter(c=>c==='submit')).toHaveLength(1);expect(f.calls.filter(c=>c==='upload')).toHaveLength(1);
  expect(refreshed.at(-1)).toBe('projection');
 });
 it.each(['after prepare','during stage'] as const)('rejects same-revision policy changes %s',async boundary=>{
  const f=await fixture();const p=await f.engine.prepare(f.session,{proposal:f.proposal,bytes:f.bytes});
  const change=()=>{f.policy.maxSourceAgeMs+=1;};
  if(boundary==='after prepare')change();else{const factory=f.deps.driverFactory;f.deps.driverFactory=s=>{const d=factory(s);d.stage=async()=>{change();};return d;};}
  await expect(f.engine.commit(f.session,{operationId:p.operationId,capability:p.capability!})).rejects.toThrow('PREPARED_POLICY_CHANGED');
  expect(f.calls).not.toContain('submit');expect(f.engine.get(p.operationId)?.consumed).toBe(false);
 });
 it.each(['queued','preflight','stage'] as const)('cancels before submission at %s',async boundary=>{
  const f=await fixture();const p=await f.engine.prepare(f.session,{proposal:f.proposal,bytes:f.bytes});const abort=new AbortController();
  if(boundary==='queued')abort.abort();
  if(boundary==='preflight'){const original=f.deps.preflight;f.deps.preflight=async(...args)=>{const live=await original(...args);abort.abort();return live;};}
  if(boundary==='stage'){const original=f.deps.driverFactory;f.deps.driverFactory=s=>{const d=original(s);d.stage=async()=>{f.calls.push('stage');abort.abort();};return d;};}
  const r=await f.engine.commit(f.session,{operationId:p.operationId,capability:p.capability!},abort.signal);
  expect(r.state).toBe('CANCELLED_BEFORE_SUBMIT');expect(f.engine.get(p.operationId)?.consumed).toBe(false);expect(f.calls).not.toContain('submit');
 });
 it.each(['missing source verifier','false source verifier','client policy','client clock','client live','client source verification'] as const)('denies untrusted authority: %s',async kind=>{
  const f=await fixture();
  if(kind==='missing source verifier')delete f.deps.verifySource;
  if(kind==='false source verifier')f.deps.verifySource=async()=>false;
  if(kind==='client policy')f.policy.enabled=false;
  if(kind==='client clock')f.deps.now=()=> '2026-10-27T06:00:00.000Z';
  if(kind==='client live')f.live.underLock=false;
  const request={proposal:f.proposal,bytes:f.bytes,...(kind.startsWith('client')?{[kind.slice(7)]:true}:{})};
  await expect((async()=>{const p=await f.engine.prepare(f.session,request);await f.engine.commit(f.session,{operationId:p.operationId,capability:p.capability!});})()).rejects.toThrow();
  expect(f.calls).not.toContain('submit');
 });
 it('deduplicates concurrent commits and changed-evidence preparation across restart',async()=>{
  const f=await fixture();const p=await f.engine.prepare(f.session,{proposal:f.proposal,bytes:f.bytes});
  const results=await Promise.all([f.engine.commit(f.session,{operationId:p.operationId,capability:p.capability!}),f.engine.commit(f.session,{operationId:p.operationId,capability:p.capability!})]);
  expect(results.map(r=>r.state)).toEqual(['VERIFIED','VERIFIED']);
  f.proposal.evidence.sha256='b'.repeat(64);
  const replay=await new CompletionEngine(f.deps).prepare(f.session,{proposal:f.proposal,bytes:Buffer.from([1])});
  expect(replay.operationId).toBe(p.operationId);expect(replay.capability).toBeUndefined();expect(replay.replayed).toBe(true);
  expect(f.calls.filter(c=>c==='submit')).toHaveLength(1);expect(f.calls.filter(c=>c==='upload')).toHaveLength(1);
  expect(results[1].verification?.outcome).toBe('VERIFIED');
 });
 it('seals bytes/proposal, consumes capability, orders actual journal transitions and verifies saved raw views',async()=>{
  const f=await fixture(); const p=await f.engine.prepare(f.session,{proposal:f.proposal,bytes:f.bytes});
  f.proposal.rawGoal='changed after prepare';
  const result=await f.engine.commit(f.session,{operationId:p.operationId,capability:p.capability!});
  expect(result.state).toBe('VERIFIED'); expect(result.verification?.attachmentVerification).toBe('metadata_only');
  expect(f.calls).toEqual(['preflight','stage','submit','attach','upload','capture']);
  expect(f.journal.events().map(e=>e.state)).toEqual(['DISCOVERED','ASSESSED','EVIDENCE_READY','PREPARED','PRECHECKED','SUBMIT_INTENT','SUBMITTED','UPLOAD_INTENT','UPLOADED','VERIFYING','VERIFIED']);
  expect(f.engine.get(p.operationId)?.sealed.proposal.rawGoal).toBe('fixture implementation');
  expect(f.engine.get(p.operationId)?.consumed).toBe(true);
 });
});
