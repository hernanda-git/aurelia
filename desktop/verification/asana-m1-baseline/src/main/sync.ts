import { randomUUID } from 'node:crypto';
import type { Activity, AppState, Snapshot, SyncState } from '../shared/types';
interface Store {
 getState():AppState; appendEvent(event:Omit<Activity,'id'|'at'>):unknown;
 setSync(sync:SyncState):unknown; setLastAttempt(at:string,error?:string|null):unknown;
 commitSnapshot(snapshot:Snapshot):unknown;
}
interface Source { fetch(timezone:string,signal:AbortSignal,progress:(state:SyncState)=>void):Promise<Snapshot> }
export function publicSyncError(error:unknown):string {
 const code=typeof error==='object'&&error!==null&&'code' in error?String(error.code):'';
 const labels:Record<string,string>={LOGIN_REQUIRED:'Masuk ke PES melalui jendela koneksi, lalu sinkronkan kembali.',CONNECTION_FAILED:'PES tidak dapat dihubungi. Periksa koneksi internet Anda.',PORTAL_TIMEOUT:'PES belum merespons. Data terakhir tetap tersedia.',GRID_SCHEMA:'Struktur daftar PES berubah. Sinkronisasi dihentikan agar data tidak keliru.',GRID_EMPTY_UNCONFIRMED:'Daftar kosong belum dapat dikonfirmasi. Data terakhir tidak diubah.',GRID_WRONG_PIC:'PIC pada hasil tidak cocok. Data terakhir tidak diubah.',FILTER_MISMATCH:'Filter PES tidak sesuai. Data terakhir tidak diubah.',HISTORY_MISMATCH:'Identitas rincian tasks tidak cocok. Data terakhir tidak diubah.',PAGINATION_DUPLICATE:'Halaman PES berulang. Data parsial tidak disimpan.',PAGINATION_LIMIT:'Batas halaman tercapai. Data parsial tidak disimpan.',PAGINATION_UNSUPPORTED:'Navigasi halaman PES belum didukung. Data parsial tidak disimpan.'};
 return labels[code]||'Sinkronisasi belum berhasil. Data terakhir tetap tersedia; coba lagi atau periksa koneksi PES.';
}
export class SyncCoordinator {
 private running:Promise<void>|null=null;
 private controller:AbortController|null=null;
 constructor(private store:Store,private source:Source,private changed:()=>void){}
 sync():Promise<void>{
  if(this.running)return this.running;
  this.controller=new AbortController();const signal=this.controller.signal;
  let resolve!:()=>void;let reject!:(reason:unknown)=>void;
  const pending=new Promise<void>((done,failed)=>{resolve=done;reject=failed;});
  // Publish the guard before execute(): its early storage-error path can finish
  // synchronously before the first await. Never overwrite finally's cleanup.
  this.running=pending;
  void this.execute(signal).then(resolve,reject);
  return pending;
 }
 cancel():void {this.controller?.abort();}
 get busy():boolean{return this.running!==null;}
 private async execute(signal:AbortSignal):Promise<void>{
  const runId=randomUUID(),attemptAt=new Date().toISOString(),started=Date.now();
  try{
   this.store.setLastAttempt(attemptAt,null);
   this.store.appendEvent({level:'info',category:'sync',runId,message:'Sinkronisasi dimulai',stage:'connecting'});
   this.changed();
   const result=await this.source.fetch(this.store.getState().settings.timezone,signal,state=>{
    this.store.setSync({...state,runId});
    this.store.appendEvent({level:'info',category:'sync',runId,stage:state.phase,message:state.message});
    this.changed();
   });
   if(signal.aborted)throw new Error('CANCELLED');
   this.store.setSync({phase:'saving',message:'Menyimpan snapshot yang telah tervalidasi…',runId});this.changed();
   this.store.commitSnapshot(result);
   this.store.setSync({phase:'success',message:`${result.tasks.length} tasks aktif diperbarui · ${result.totalScanned} baris diperiksa`,runId,completed:result.tasks.length,total:result.tasks.length});
   this.store.appendEvent({level:'success',category:'sync',runId,stage:'success',message:`${result.tasks.length} tasks aktif tersimpan; ${result.totalScanned} baris diperiksa`,durationMs:Date.now()-started});
  }catch(error){
   const cancelled=signal.aborted;
   const message=cancelled?'Sinkronisasi dibatalkan. Data terakhir tetap tersedia.':publicSyncError(error);
   this.store.setLastAttempt(attemptAt,cancelled?null:message);
   this.store.setSync({phase:cancelled?'cancelled':'failed',message,runId});
   this.store.appendEvent({level:cancelled?'warning':'error',category:'sync',runId,stage:cancelled?'cancelled':'failed',message,durationMs:Date.now()-started});
  }finally{this.running=null;this.controller=null;this.changed();}
 }
}
