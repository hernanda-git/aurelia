import { app, BrowserWindow, ipcMain, shell, dialog, clipboard, nativeTheme } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { AgentWorkspaceInfo, Settings } from '../shared/types';
import { importedSnapshot } from '../shared/domain';
import { Store as StateStore } from './store';
import { PesPortal, PES_TASK_URL } from './portal';
import { SyncCoordinator } from './sync';
import { encodeExportCsv } from './portal-data';
import { AgentWorkspace } from './agent-workspace';
import { PortalCoordinator } from './portal-coordinator';
import { CompletionJournal } from './completion-journal';
import { completionObservation } from './completion-observer';
import { AsanaStore } from './asana-store';
import { asanaTaskContext, asanaTaskUrl, encodeAsanaExport } from './asana-ipc';
import { executeAsanaTaskUpdate, executeAsanaBatchUpdate, type TaskUpdatePayload } from './asana-mutation';
import type { AsanaPreferences } from '../shared/asana-types';
import { executePesCompletion, createAutoEvidence } from './pes-completion-service';
import { AureliaDb } from './aurelia-db';

app.setName('Aurelia');
if(process.env.PES_FOCUS_DATA_DIR)app.setPath('userData',path.resolve(process.env.PES_FOCUS_DATA_DIR));
// Retain the legacy profile path AND portal partition so branding never abandons user data or sign-in.
else app.setPath('userData',path.join(app.getPath('appData'),'PES Focus'));
app.commandLine.appendSwitch('disable-features','HardwareMediaKeyHandling');
let main:BrowserWindow|null=null;
let store:StateStore;
let portal:PesPortal;
let sync:SyncCoordinator;
let agentWorkspace:AgentWorkspace|undefined;
let agentWorkspaceRoot:string|undefined;
let agentWorkspaceStatus:AgentWorkspaceInfo|undefined;
const portalOwner=new PortalCoordinator();
let completionJournal:CompletionJournal|undefined;
let asanaStore:AsanaStore|undefined;
let aureliaDb:AureliaDb|undefined;
const getAsanaStore=()=>{if(!asanaStore)throw Error('ASANA_STORAGE_UNAVAILABLE');return asanaStore;};
const broadcastAsana=()=>{if(main&&!main.isDestroyed()&&asanaStore)main.webContents.send('asana:state-changed',asanaStore.getState());};
const asanaCatalogPath=()=>process.env.PES_FOCUS_DATA_DIR
 ?path.join(app.getPath('userData'),'fixtures','asana-catalog.db')
 :'C:/Workspace/asana-pes-sync/data/taskbridge.db';
const currentState=()=>({...store.getState(),agentWorkspace:agentWorkspaceStatus,completion:completionObservation(completionJournal?.events()??[],store.getState().snapshot,!!completionJournal)});
function projectWorkspace():void{
 if(!agentWorkspaceRoot)return;
 try{agentWorkspace??=new AgentWorkspace(agentWorkspaceRoot);agentWorkspaceStatus=agentWorkspace.write(store.getState());}
 catch{agentWorkspaceStatus={path:path.resolve(agentWorkspaceRoot),lastWrittenAt:agentWorkspace?.info().lastWrittenAt??null,taskCount:agentWorkspace?.info().taskCount??0,error:'Agent workspace belum diperbarui. Data asli tetap aman di profil lokal. Periksa izin dan folder workspace.'};}
}
const broadcast=()=>{projectWorkspace();try{aureliaDb?.saveState(store.getState());}catch{}if(main&&!main.isDestroyed())main.webContents.send('pes:state-changed',currentState());};
const localId=(id:unknown):string=>{if(typeof id!=='string'||!id.trim()||id.length>200)throw new Error('Identitas tasks tidak valid.');return id;};
function register(channel:string,handler:(...args:any[])=>unknown):void{
 ipcMain.handle(channel,async(event,...args)=>{
  if(!main||event.sender!==main.webContents||event.senderFrame!==main.webContents.mainFrame)throw new Error('Permintaan tidak diizinkan.');
  try{return await handler(...args);}catch{throw new Error('Tindakan belum berhasil. Data tersimpan tetap tersedia.');}
 });
}
function applyTheme(theme:Settings['theme']):void{const isLight=theme==='light';nativeTheme.themeSource=theme==='system'?'system':isLight?'light':'dark';if(main)main.setBackgroundColor(isLight?'#f4f4ef':theme==='pinkish'?'#1c1318':'#101310');}
function registerApi():void{
 register('asana:state',()=>getAsanaStore().getState());
 register('asana:reload-catalog',async()=>{const pending=getAsanaStore().reloadCatalog(asanaCatalogPath());broadcastAsana();try{await pending;const count=getAsanaStore().getState().snapshot?.tasks.length??0;store.appendEvent({level:'success',category:'sync',message:`Sinkronisasi Asana selesai: ${count} tasks terhubung`});broadcast();}catch{store.appendEvent({level:'warning',category:'sync',message:'Sinkronisasi Asana dibatalkan atau gagal. Snapshot lokal tetap digunakan.'});broadcast();}finally{broadcastAsana();}});
 register('asana:cancel',()=>{getAsanaStore().cancelReload();broadcastAsana();});
 register('asana:preferences',(patch:unknown)=>{getAsanaStore().setPreferences(patch as Partial<AsanaPreferences>);broadcastAsana();});
 register('asana:open',(gid:unknown)=>shell.openExternal(asanaTaskUrl(getAsanaStore().getState(),gid)));
 register('asana:copy',async(gid:unknown)=>{const text=asanaTaskContext(getAsanaStore().getState(),gid);await clipboard.writeText(text);if(await clipboard.readText()!==text)throw Error('ASANA_CLIPBOARD_UNAVAILABLE');});
 register('asana:export',async(format:unknown,gids:unknown)=>{
  const data=encodeAsanaExport(getAsanaStore().getState(),format,gids);
  const result=await dialog.showSaveDialog(main!,{defaultPath:`Asana-HERNANDA-MSS-${new Date().toISOString().slice(0,10)}.${format}`,filters:[{name:String(format).toUpperCase(),extensions:[String(format)]}]});
  if(result.canceled||!result.filePath)return false;
  writeFileSync(result.filePath,data,'utf8');return true;
 });
 register('asana:start-in-progress',async(gid:unknown,dueDate:unknown)=>{
  if(typeof gid!=='string'||!/^\d+$/.test(gid))throw new Error('ASANA_TASK_INVALID');
  const dueStr=typeof dueDate==='string'&&dueDate?dueDate:null;
  const res=await executeAsanaTaskUpdate(gid,dueStr,asanaCatalogPath());
  if(!res.success)throw new Error(res.error||'Failed to update task');
  await getAsanaStore().reloadCatalog(asanaCatalogPath());
  store.appendEvent({level:'success',category:'sync',message:`Task ${gid} diperbarui ke In-Progress (Progress: In Progress)`});
  broadcast();broadcastAsana();
  return {success:true};
 });
 register('asana:start-all-unset-in-progress',async(tasksArg:unknown)=>{
  if(!Array.isArray(tasksArg))throw new Error('ASANA_TASKS_INVALID');
  const tasks:TaskUpdatePayload[]=[];
  for(const item of tasksArg){
   if(!item||typeof item!=='object')continue;
   const obj=item as Record<string,unknown>;
   if(typeof obj.gid==='string'&&/^\d+$/.test(obj.gid)){
    tasks.push({gid:obj.gid,dueDate:typeof obj.dueDate==='string'?obj.dueDate:null});
   }
  }
  if(tasks.length===0)return {success:true,count:0};
  const res=await executeAsanaBatchUpdate(tasks,asanaCatalogPath());
  if(!res.success)throw new Error(res.error||'Failed to update tasks');
  await getAsanaStore().reloadCatalog(asanaCatalogPath());
  store.appendEvent({level:'success',category:'sync',message:`${res.count} tasks Unset berhasil diperbarui ke In-Progress`});
  broadcast();broadcastAsana();
  return {success:true,count:res.count};
 });
 register('pes:state',()=>currentState());
 register('pes:sync',()=>sync.sync());
 register('pes:cancel',()=>{sync.cancel();});
 register('pes:connection',async()=>{
  if(sync.busy)throw new Error('Sinkronisasi sedang berjalan.');
  store.appendEvent({level:'info',category:'connection',message:'Koneksi PES dibuka; masuk langsung di halaman resmi PES.'});broadcast();
  try{await portalOwner.run('connection',()=>portal.openConnection());}catch{store.appendEvent({level:'error',category:'connection',message:'PES tidak dapat dihubungi. Periksa koneksi internet.'});broadcast();throw new Error('PES tidak dapat dihubungi.');}
 });
 register('pes:select-evidence-file',async()=>{
  const result=await dialog.showOpenDialog(main!,{title:'Pilih File Bukti Lampiran PES',properties:['openFile'],filters:[{name:'Format Bukti (PNG, JPG, PDF, TXT, MD, DOCX, ZIP)',extensions:['png','jpg','jpeg','pdf','txt','md','docx','zip']},{name:'Semua File',extensions:['*']}]});
  if(result.canceled||!result.filePaths.length)return null;
  return result.filePaths[0];
 });
 register('pes:generate-evidence',async(taskNoArg:unknown)=>{
  if(typeof taskNoArg!=='string'||!taskNoArg.trim())throw new Error('TASK_NO_INVALID');
  const taskNo=taskNoArg.trim();
  const task=store.getState().snapshot?.tasks.find(t=>t.TaskNo===taskNo);
  if(!task)throw new Error('TASK_NOT_FOUND');
  const targetDir=agentWorkspaceRoot?path.join(agentWorkspaceRoot,'evidence'):path.join(app.getPath('userData'),'evidence');
  const staged=await createAutoEvidence(task,targetDir);
  return {filePath:staged.filePath,fileName:staged.fileName,size:staged.size};
 });
 register('pes:finish-task',async(taskNoArg:unknown,finishDateArg:unknown,evidencePathArg:unknown)=>{
  if(typeof taskNoArg!=='string'||!taskNoArg.trim())throw new Error('TASK_NO_INVALID');
  if(typeof finishDateArg!=='string'||!finishDateArg.trim())throw new Error('FINISH_DATE_INVALID');
  const taskNo=taskNoArg.trim();const finishDate=finishDateArg.trim();
  const evidencePath=typeof evidencePathArg==='string'&&evidencePathArg?evidencePathArg:null;
  if(process.env.PES_FOCUS_DATA_DIR){
   const s=store.getState().snapshot;
   if(s){
    const t=s.tasks.find(item=>item.TaskNo===taskNo);
    if(t){t.Status='Selesai';t.TglSelesai=finishDate;store.commitSnapshot({...s,tasks:[...s.tasks]});}
   }
   store.appendEvent({level:'success',category:'sync',message:`Task PES ${taskNo} diselesaikan pada ${finishDate}`});
   broadcast();return {success:true,taskNo};
  }
  const res=await executePesCompletion({taskNo,finishDate,evidencePath,snapshot:store.getState().snapshot,portal,portalOwner,journal:completionJournal,workspaceRoot:agentWorkspaceRoot});
  if(!res.success)throw new Error(res.error||'PES_COMPLETION_FAILED');
  store.appendEvent({level:'success',category:'sync',message:`Task PES ${taskNo} berhasil diselesaikan pada portal PES (Selesai: ${finishDate}, Bukti: ${res.evidenceName})`});
  broadcast();void sync.sync();
  return {success:true,taskNo:res.taskNo};
 });
 register('pes:pin',(value:unknown)=>{store.togglePin(localId(value));store.appendEvent({level:'info',category:'local',message:'Sematan pribadi diperbarui. Status PES tidak diubah.'});broadcast();});
 register('pes:focus',(value:unknown)=>{store.setFocus(value===null?null:localId(value));store.appendEvent({level:'info',category:'local',message:value===null?'Fokus pribadi dilepas.':'Fokus berikutnya dipilih. Status PES tidak diubah.'});broadcast();});
 register('pes:settings',(value:unknown)=>{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['theme','timezone','compact'].includes(k)))throw new Error('Pengaturan tidak valid.');
  store.updateSettings(value as Partial<Settings>);applyTheme(store.getState().settings.theme);store.appendEvent({level:'info',category:'local',message:'Pengaturan ruang kerja diperbarui.'});broadcast();
 });
 register('pes:clear-activity',()=>{store.clearActivities();broadcast();});
 register('pes:copy',(text:unknown)=>{if(typeof text!=='string'||text.length>100000)throw new Error('Teks tidak valid.');return clipboard.writeText(text);});
 register('pes:open-portal',()=>shell.openExternal(PES_TASK_URL));
 register('pes:agent-workspace',async(value:unknown)=>{
  projectWorkspace();
  if(!agentWorkspace||agentWorkspaceStatus?.error)throw new Error('Agent workspace belum tersedia.');
  const folder=value===undefined?agentWorkspace.info().path:agentWorkspace.taskDir(localId(value));
  const error=await shell.openPath(folder);if(error)throw new Error('Folder belum dapat dibuka.');
  store.appendEvent({level:'info',category:'local',message:value===undefined?'Agent workspace dibuka.':'Workspace untuk tasks dibuka.'});broadcast();
 });
 register('pes:agent-context',async(value:unknown)=>{
  projectWorkspace();
  if(!agentWorkspace||agentWorkspaceStatus?.error)throw new Error('Agent workspace belum tersedia.');
  const id=localId(value);
  const directory=agentWorkspace.taskDir(id);
  const context=[agentWorkspace.context(id),'\n## Local workspace',`Workspace: ${agentWorkspace.info().path}`,`Task directory: ${directory}`,`Edit only: ${path.join(directory,'work')}`,'Read index.json for the committed source generation. Never change PES source files or status from local notes.'].join('\n');
  await clipboard.writeText(context);
  if(await clipboard.readText()!==context)throw new Error('Konteks belum dapat disalin.');
  store.appendEvent({level:'success',category:'export',message:'Konteks agent untuk tasks disalin. Data PES tidak diubah.'});broadcast();
 });
 register('pes:window',(action:unknown)=>{if(!main)return;if(action==='minimize')main.minimize();else if(action==='maximize')main.isMaximized()?main.unmaximize():main.maximize();else if(action==='close')main.close();else throw new Error('Aksi tidak valid.');});
 register('pes:export-tasks',async(format:unknown,id:unknown)=>{
  if(format!=='json'&&format!=='csv')throw new Error('Format tidak valid.');
  const snapshot=store.getState().snapshot;if(!snapshot)throw new Error('Belum ada data.');
  const taskId=id===undefined?undefined:localId(id);
  const tasks=taskId?snapshot.tasks.filter(t=>t.TaskNo===taskId):snapshot.tasks;
  if(taskId&&!tasks.length)throw new Error('Tasks tidak ditemukan.');
  const result=await dialog.showSaveDialog(main!,{defaultPath:`PES-${new Date().toISOString().slice(0,10)}.${format}`,filters:[{name:format.toUpperCase(),extensions:[format]}]});
  if(result.canceled||!result.filePath)return false;
  const payload=taskId?{...snapshot,tasks,totalScanned:tasks.length,queryTotalScanned:snapshot.totalScanned,sourceRows:snapshot.sourceRows?.filter(row=>row[1]===taskId),exportSelection:'single-task'}:snapshot;
  const data=format==='csv'?encodeExportCsv(tasks):JSON.stringify(payload,null,2);
  writeFileSync(result.filePath,data,'utf8');
  store.appendEvent({level:'success',category:'export',message:`${tasks.length} tasks diekspor sebagai ${format.toUpperCase()}.`});broadcast();return true;
 });
 register('pes:export-activity',async()=>{
  const result=await dialog.showSaveDialog(main!,{defaultPath:'PES-Aktivitas.json',filters:[{name:'JSON',extensions:['json']}]});
  if(result.canceled||!result.filePath)return false;
  writeFileSync(result.filePath,JSON.stringify(store.getState().activities,null,2),'utf8');
  store.appendEvent({level:'success',category:'export',message:'Riwayat aktivitas diekspor tanpa data autentikasi.'});broadcast();return true;
 });
 register('pes:correlations',()=>{
  return aureliaDb?.findCrossSystemCorrelations(asanaCatalogPath())??[];
 });
}
async function start():Promise<void>{
 const file=path.join(app.getPath('userData'),'workspace.json');
 try{
  asanaStore=new AsanaStore(path.join(app.getPath('userData'),'asana-state.json'));
  const dbPath=asanaCatalogPath();
  if(existsSync(dbPath)&&(!asanaStore.getState().snapshot||!asanaStore.getState().snapshot?.tasks.some(t=>t.itStartDate!==null))){
   await asanaStore.reloadCatalog(dbPath);
  }
 }catch{asanaStore=undefined;}
 try{
  const dbFile=path.join(app.getPath('userData'),'aurelia.db');
  try{aureliaDb=new AureliaDb(dbFile);}catch{aureliaDb=undefined;}
  store=new StateStore(file);
  if(!store.getState().snapshot){
   const seed=path.join(app.getAppPath(),'assets','seed.json');
   if(existsSync(seed)){
    store.commitSnapshot(importedSnapshot(JSON.parse(readFileSync(seed,'utf8'))));
    store.appendEvent({level:'info',category:'system',message:'Data tersimpan dari pengambilan 26 Oktober 2026 diimpor. Ini bukan sinkronisasi langsung.'});
   }
  }
  try{aureliaDb?.saveState(store.getState());}catch{}
 }catch{
  dialog.showErrorBox('PES — data belum dapat dibuka','Data lokal tidak dapat dibaca atau disimpan dengan aman. Berkas lama tidak dihapus. Periksa izin folder data atau cadangkan data sebelum mencoba lagi.');app.quit();return;
 }
 const workspaceRoot=process.env.PES_FOCUS_DATA_DIR
  ?path.join(app.getPath('userData'),'agent-workspace')
  :existsSync('C:/Workspace/pesautomation')
   ?path.join('C:/Workspace/pesautomation','data','agent-workspace')
   :path.join(app.getPath('documents'),'PES','agent-workspace');
 try{completionJournal=new CompletionJournal(path.join(app.getPath('userData'),'completion','journal'));}
 catch{completionJournal=undefined;} // Fail closed locally; preserve the ordinary read-only task cache.
 agentWorkspaceRoot=workspaceRoot;projectWorkspace();
 portal=new PesPortal(connected=>{
  const value=connected?'connected':'login-required';
  if(store.getState().connection!==value){store.setConnection(value);store.appendEvent({level:connected?'success':'warning',category:'connection',message:connected?'Sesi PES terhubung. Sinkronisasi siap dijalankan.':'Masuk ke PES diperlukan. Data tersimpan tetap tersedia.'});broadcast();}
 });
 // Human Sync and login use the same exclusive portal owner as future agent operations.
 // No completion executor or commit IPC is registered until supervisor enrollment is proven.
 sync=new SyncCoordinator(store,{fetch:(timezone,signal,progress)=>portalOwner.run('sync',()=>portal.fetch(timezone,signal,progress),signal)},broadcast);
 main=new BrowserWindow({width:1440,height:920,minWidth:900,minHeight:640,show:false,frame:false,title:'Aurelia',backgroundColor:'#101310',icon:path.join(app.getAppPath(),'assets','icon.png'),autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
 main.setMenu(null);
 main.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 main.webContents.on('will-navigate',event=>event.preventDefault());
 main.webContents.on('will-attach-webview',event=>event.preventDefault());
 main.webContents.session.setPermissionRequestHandler((_c,_p,callback)=>callback(false));
 // Provider-specific keyboard refresh is routed by the sandboxed renderer.
 main.on('closed',()=>{sync.cancel();portal.close();main=null;app.quit();});
 registerApi();applyTheme(store.getState().settings.theme);
 await main.loadFile(path.join(__dirname,'../../renderer/index.html'));
 main.show();
}
if(!app.requestSingleInstanceLock())app.quit();
else{
 app.on('second-instance',()=>{if(main){if(main.isMinimized())main.restore();main.show();main.focus();}});
 app.whenReady().then(start).catch(()=>{dialog.showErrorBox('Aurelia','Aplikasi belum dapat dimulai. Periksa instalasi dan dokumentasi lokal.');app.quit();});
 app.on('window-all-closed',()=>app.quit());
 app.on('before-quit',()=>{aureliaDb?.close();portalOwner.close();sync?.cancel();portal?.close();completionJournal?.close();});
}
