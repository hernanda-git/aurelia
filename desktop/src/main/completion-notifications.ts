import { createHash } from 'node:crypto';
import { CompletionRecordStore } from './completion';
export type CompletionNotificationOutcome='VERIFIED'|'SAVED_WITH_DISCREPANCY'|'OUTCOME_UNKNOWN';
export interface CompletionNotification {id:string;operationId:string;outcome:CompletionNotificationOutcome;state:'pending'|'sent'}
const outcomes:CompletionNotificationOutcome[]=['VERIFIED','SAVED_WITH_DISCREPANCY','OUTCOME_UNKNOWN'];
/** Host-owned store only. Callers supply no paths, destination, free text or secrets.
 * Immutable enqueue + separate immutable sender-ack receipt. Process-crash durability
 * follows CompletionRecordStore; no power-loss/same-user-tamper guarantee on Windows.
 */
export type CompletionNotificationSender=(notification:Readonly<CompletionNotification>)=>Promise<{id:string;acknowledged:boolean}>;
export class CompletionNotificationOutbox {
 private tail:Promise<unknown>=Promise.resolve();
 constructor(private readonly store:CompletionRecordStore){}
 /** At-least-once after a crash between send and durable ack. Sender must dedupe id.
  * Transport errors leave pending. No timer, retry loop, connector or mutation here. */
 flush(sender:CompletionNotificationSender):Promise<CompletionNotification[]> {
  const work=this.tail.then(async()=>{
   for(const item of this.list().filter(n=>n.state==='pending')){
    let ack;try{ack=await sender(Object.freeze({...item}));}catch{continue;}
    if(ack?.id===item.id&&ack.acknowledged===true)this.store.write(`notification-${item.id}-ack.json`,{id:item.id,acknowledged:true});
   }
   return this.list();
  });
  this.tail=work.catch(()=>undefined);return work;
 }
 enqueue(input:{operationId:string;state:CompletionNotificationOutcome}):CompletionNotification {
  if(!input||Object.keys(input).some(k=>!['operationId','state'].includes(k)))throw Error('UNTRUSTED_NOTIFICATION_FIELDS');
  if(typeof input.operationId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(input.operationId)||!outcomes.includes(input.state))throw Error('INVALID_NOTIFICATION');
  const id=createHash('sha256').update(JSON.stringify([input.operationId,input.state])).digest('hex');
  const name=`notification-${id}.json`;
  const record={id,operationId:input.operationId,outcome:input.state};
  const existing=this.store.read<typeof record>(name);
  if(existing&&JSON.stringify(existing)!==JSON.stringify(record))throw Error('CORRUPT_NOTIFICATION');
  if(!existing)this.store.write(name,record);
  const ack=this.store.read(`notification-${id}-ack.json`);
  if(ack!==undefined&&JSON.stringify(ack)!==JSON.stringify({id,acknowledged:true}))throw Error('CORRUPT_NOTIFICATION_ACK');
  return {...record,state:ack?'sent':'pending'};
 }
 list():CompletionNotification[]{
  return this.store.names().filter(n=>/^notification-[a-f0-9]{64}\.json$/.test(n)).map(n=>{
   const item=this.store.read<Omit<CompletionNotification,'state'>>(n)!;
   const result=this.enqueue({operationId:item.operationId,state:item.outcome});
   if(n!==`notification-${result.id}.json`)throw Error('CORRUPT_NOTIFICATION');return result;
  });
 }
}
