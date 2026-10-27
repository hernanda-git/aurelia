import { describe,it,expect,vi } from 'vitest';
import { SyncCoordinator } from '../src/main/sync';
const snapshot={id:'live-1',source:'live',retrievedAt:'2026-10-26T00:00:00Z',scope:{from:'2026-09-01',to:'2026-11-30',pic:'3220',department:'32'},totalScanned:0,tasks:[]};
function harness(fetch:any){const state:any={settings:{timezone:'Asia/Jakarta'},lastAttemptAt:null};const store:any={getState:()=>state,appendEvent:vi.fn(),setLastAttempt:vi.fn(),setSync:vi.fn(),commitSnapshot:vi.fn()};const coordinator=new SyncCoordinator(store,{fetch},()=>{});return {store,coordinator};}
describe('sync transaction boundary',()=>{
 it('releases the single-flight guard after an initial persistence failure and permits retry',async()=>{
  const fetch=vi.fn().mockResolvedValue(snapshot);const {store,coordinator}=harness(fetch);
  store.setLastAttempt.mockImplementationOnce(()=>{throw new Error('transient storage failure')});
  await coordinator.sync();expect(coordinator.busy).toBe(false);expect(fetch).not.toHaveBeenCalled();
  await coordinator.sync();expect(fetch).toHaveBeenCalledTimes(1);expect(store.setSync.mock.calls.at(-1)?.[0].phase).toBe('success');
 });
 it('publishes only a completely returned snapshot',async()=>{const {store,coordinator}=harness(vi.fn().mockResolvedValue(snapshot));await coordinator.sync();expect(store.commitSnapshot).toHaveBeenCalledExactlyOnceWith(snapshot);expect(store.setSync.mock.calls.at(-1)?.[0].phase).toBe('success');});
 it('does not replace the good snapshot when a fetch fails and never forwards raw errors',async()=>{const {store,coordinator}=harness(vi.fn().mockRejectedValue(new Error('password=SECRET auth raw response')));await coordinator.sync();expect(store.commitSnapshot).not.toHaveBeenCalled();expect(JSON.stringify(store.appendEvent.mock.calls)).not.toContain('SECRET');expect(store.setSync.mock.calls.at(-1)?.[0].phase).toBe('failed');});
 it('coalesces overlapping requests into one fetch',async()=>{let finish:any;const fetch=vi.fn(()=>new Promise(r=>finish=r));const {coordinator}=harness(fetch);const first=coordinator.sync();const second=coordinator.sync();expect(second).toBe(first);expect(fetch).toHaveBeenCalledTimes(1);finish(snapshot);await first;});
 it('never commits after cooperative cancellation even if fetch returns a result',async()=>{let finish:any;const {store,coordinator}=harness(()=>new Promise(r=>finish=r));const pending=coordinator.sync();coordinator.cancel();finish(snapshot);await pending;expect(store.commitSnapshot).not.toHaveBeenCalled();expect(store.setSync.mock.calls.at(-1)?.[0].phase).toBe('cancelled');});
 it('handles a storage failure as failed publication',async()=>{const {store,coordinator}=harness(vi.fn().mockResolvedValue(snapshot));store.commitSnapshot.mockImplementation(()=>{throw new Error('private disk path')});await coordinator.sync();expect(store.setSync.mock.calls.at(-1)?.[0].phase).toBe('failed');expect(JSON.stringify(store.appendEvent.mock.calls)).not.toContain('private disk path');});
});
