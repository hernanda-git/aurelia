import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CompletionRecordStore } from '../src/main/completion';
import { CompletionNotificationOutbox } from '../src/main/completion-notifications';
const roots:string[]=[];
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});
function store(){const root=mkdtempSync(join(tmpdir(),'completion-outbox-'));roots.push(root);return new CompletionRecordStore(root);}
describe('durable immutable completion notification outbox',()=>{
 it.each([undefined,null,123] as const)('rejects non-string operation identifiers: %s',value=>{
  const records=store();const box=new CompletionNotificationOutbox(records);
  expect(()=>box.enqueue({operationId:value as unknown as string,state:'VERIFIED'})).toThrow('INVALID_NOTIFICATION');expect(records.names()).toHaveLength(0);
 });
 it('rejects a malformed durable acknowledgement instead of reporting sent',()=>{
  const records=store();const box=new CompletionNotificationOutbox(records);const item=box.enqueue({operationId:'op-fixture',state:'VERIFIED'});
  records.write(`notification-${item.id}-ack.json`,{id:item.id,acknowledged:false});
  expect(()=>new CompletionNotificationOutbox(records).list()).toThrow('CORRUPT_NOTIFICATION_ACK');
 });
 it('only a matching sender acknowledgement marks sent and restart retries pending only',async()=>{
  const records=store();const box=new CompletionNotificationOutbox(records);const item=box.enqueue({operationId:'op-fixture',state:'OUTCOME_UNKNOWN'});
  await box.flush(async()=>{throw Error('transport unavailable');});expect(box.list()[0].state).toBe('pending');
  await box.flush(async()=>({id:'wrong',acknowledged:true}));expect(box.list()[0].state).toBe('pending');
  await box.flush(async()=>({id:item.id,acknowledged:false}));expect(box.list()[0].state).toBe('pending');
  const restarted=new CompletionNotificationOutbox(records);let sends=0;
  await Promise.all([restarted.flush(async n=>{sends++;return {id:n.id,acknowledged:true};}),restarted.flush(async n=>{sends++;return {id:n.id,acknowledged:true};})]);
  expect(sends).toBe(1);expect(new CompletionNotificationOutbox(records).list()[0].state).toBe('sent');
  expect(records.names()).toHaveLength(2);
 });
 it('deduplicates sanitized outcomes across restart without caller paths',()=>{
  const records=store();const box=new CompletionNotificationOutbox(records);
  const input={operationId:'op-fixture',state:'VERIFIED' as const};
  const queued=box.enqueue(input);expect(queued.state).toBe('pending');
  expect(new CompletionNotificationOutbox(records).enqueue(input)).toEqual(queued);
  expect(records.names()).toHaveLength(1);
  expect(()=>box.enqueue({...input,path:'C:/profile/secret'} as typeof input)).toThrow('UNTRUSTED_NOTIFICATION_FIELDS');
  expect(()=>box.enqueue({...input,operationId:'../secret'})).toThrow('INVALID_NOTIFICATION');
  expect(new CompletionNotificationOutbox(records).list()).toEqual([queued]);
 });
});
