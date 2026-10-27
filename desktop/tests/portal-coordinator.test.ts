import { describe, it, expect } from 'vitest';
import { PortalCoordinator } from '../src/main/portal-coordinator';

describe('exclusive portal owner',()=>{
 it('queues a read sync behind an evidence upload without entering its document',async()=>{
  const owner=new PortalCoordinator();const events:string[]=[];
  let finish!:()=>void;
  const upload=owner.run('completion',async()=>{events.push('upload-start');await new Promise<void>(r=>{finish=r;});events.push('upload-end');});
  const read=owner.run('sync',async()=>{events.push('sync');return 32;});
  await Promise.resolve();expect(events).toEqual(['upload-start']);expect(owner.busy).toBe(true);
  finish();await upload;expect(await read).toBe(32);expect(events).toEqual(['upload-start','upload-end','sync']);expect(owner.busy).toBe(false);
 });
 it('cancels a queued job without interrupting the current owner',async()=>{
  const owner=new PortalCoordinator();let release!:()=>void;let entered=false;
  const active=owner.run('completion',()=>new Promise<void>(r=>{release=r;}));
  const controller=new AbortController();
  const queued=owner.run('sync',async()=>{entered=true;},controller.signal);
  const rejected=expect(queued).rejects.toThrow('CANCELLED');controller.abort();
  await Promise.resolve();release();await active;await rejected;expect(entered).toBe(false);
 });
 it('rejects queued and new jobs on shutdown without interrupting the active upload',async()=>{
  const owner=new PortalCoordinator();let release!:()=>void;let entered=false;
  const active=owner.run('completion',()=>new Promise<void>(r=>{release=r;}));await Promise.resolve();
  const queued=owner.run('sync',async()=>{entered=true;});const rejected=expect(queued).rejects.toThrow('PORTAL_CLOSED');
  owner.close();await expect(owner.run('sync',async()=>1)).rejects.toThrow('PORTAL_CLOSED');
  release();await active;await rejected;expect(entered).toBe(false);expect(owner.busy).toBe(false);
 });
});
