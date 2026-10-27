/** One Electron main-process owner for ALL navigation in the shared portal.
 * Jobs run FIFO. No task may recursively acquire its own coordinator lease.
 * Does not claim to exclude actors operating the official site elsewhere.
 */
export class PortalCoordinator {
 private tail:Promise<void>=Promise.resolve();
 private pending=0;
 private closed=false;
 get busy():boolean{return this.pending>0;}
 close():void{this.closed=true;}
 async drain():Promise<void>{await this.tail;}
 run<T>(_kind:'sync'|'connection'|'completion'|'reconcile',job:()=>Promise<T>,signal?:AbortSignal):Promise<T>{
  if(this.closed)return Promise.reject(new Error('PORTAL_CLOSED'));
  this.pending++;
  const result=this.tail.then(()=>{if(this.closed)throw new Error('PORTAL_CLOSED');if(signal?.aborted)throw new Error('CANCELLED');return job();});
  this.tail=result.then(()=>undefined,()=>undefined);
  return result.finally(()=>{this.pending--;});
 }
}
