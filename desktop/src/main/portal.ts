import { BrowserWindow, session } from 'electron';
import { randomUUID } from 'node:crypto';
import type { Scope, Snapshot, SyncState, Task } from '../shared/types';
import { dateWindow } from '../shared/domain';
import { captureGridScript, decodeGrid, nextPager, safePortalUrl, validateHistoryIdentity } from './portal-data';

export const PES_TASK_URL='https://pes.grcboard.com/Modul/ISO/FormInputTask.aspx';
const sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
export class PortalError extends Error { constructor(public code:string){super(code);} }
export class PesPortal {
  private win:BrowserWindow|null=null;
  constructor(private connection:(connected:boolean)=>void){}
  private window():BrowserWindow {
    if(this.win&&!this.win.isDestroyed())return this.win;
    const partition=session.fromPartition('persist:pes-focus-portal');
    partition.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
    partition.on('will-download',event=>event.preventDefault());
    const win=new BrowserWindow({width:1050,height:760,show:false,title:'Masuk ke PES — pes.grcboard.com',autoHideMenuBar:true,webPreferences:{partition:'persist:pes-focus-portal',sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,backgroundThrottling:false,devTools:false}});
    win.setMenu(null);
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.webContents.on('will-navigate',(event,url)=>{if(!safePortalUrl(url))event.preventDefault();});
    win.webContents.on('will-redirect',(event,url)=>{if(!safePortalUrl(url))event.preventDefault();});
    win.webContents.on('did-finish-load',()=>{
      if(safePortalUrl(win.webContents.getURL())&&!/Default\.aspx/i.test(win.webContents.getURL())){
        void win.webContents.executeJavaScript("!!document.getElementById('MainContent_btnList1') || /Home\\.aspx/i.test(location.pathname)").then((ok:boolean)=>{if(ok){this.connection(true);if(win.isVisible())win.hide();}}).catch(()=>{});
      }
    });
    win.on('closed',()=>{if(this.win===win)this.win=null;});
    this.win=win;return win;
  }
  async openConnection():Promise<void>{
    const win=this.window();
    try {await win.loadURL(PES_TASK_URL);}catch{throw new PortalError('CONNECTION_FAILED');}
    if(/Default\.aspx/i.test(win.webContents.getURL())){this.connection(false);win.show();}
    else {this.connection(true);}
  }
  close():void{if(this.win&&!this.win.isDestroyed())this.win.destroy();this.win=null;}
  private check(signal:AbortSignal):void{if(signal.aborted)throw new PortalError('CANCELLED');}
  private async read<T>(code:string,signal:AbortSignal):Promise<T>{
    this.check(signal);const win=this.window();
    if(!safePortalUrl(win.webContents.getURL()))throw new PortalError('ORIGIN_REJECTED');
    if(/Default\.aspx/i.test(win.webContents.getURL())){this.connection(false);win.show();throw new PortalError('LOGIN_REQUIRED');}
    let timer:NodeJS.Timeout|undefined;
    try {return await Promise.race([win.webContents.executeJavaScript(code),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new PortalError('PORTAL_TIMEOUT')),15000);})]);}
    finally {if(timer)clearTimeout(timer);}
  }
  private async wait(expression:string,signal:AbortSignal,timeout=60000):Promise<void>{
    const until=Date.now()+timeout;
    while(Date.now()<until){
      this.check(signal);
      try {if(await this.read<boolean>(expression,signal))return;}catch(error){if(error instanceof PortalError)throw error;}
      await sleep(180);
    }
    throw new PortalError('PORTAL_TIMEOUT');
  }
  private async transition(action:string,expected:string,signal:AbortSignal):Promise<void>{
    const token=randomUUID();
    await this.read(`(() => { const token=${JSON.stringify(token)}; const prm=window.Sys?.WebForms?.PageRequestManager?.getInstance();window.__pfWait={token,done:!prm};if(prm){const done=()=>{if(window.__pfWait?.token===token)window.__pfWait.done=true;prm.remove_endRequest(done);};prm.add_endRequest(done);} ${action};return true;})()`,signal);
    await sleep(200);
    await this.wait(`(() => {const waiting=window.__pfWait;const prm=window.Sys?.WebForms?.PageRequestManager?.getInstance();return (!waiting||waiting.token!==${JSON.stringify(token)}||waiting.done)&&(!prm||!prm.get_isInAsyncPostBack())&&(${expected});})()`,signal);
  }
  async fetch(timezone:string,signal:AbortSignal,progress:(state:SyncState)=>void):Promise<Snapshot>{
    const win=this.window();
    progress({phase:'connecting',message:'Menghubungkan ke PES…'});
    this.check(signal);
    try{await win.loadURL(PES_TASK_URL);}catch{this.check(signal);throw new PortalError('CONNECTION_FAILED');}
    if(/Default\.aspx/i.test(win.webContents.getURL())){this.connection(false);win.show();throw new PortalError('LOGIN_REQUIRED');}
    this.connection(true);
    await this.wait("!!document.getElementById('MainContent_btnList1')",signal);
    if(!await this.read<boolean>("!!document.getElementById('MainContent_ddlDept1')",signal)){
      await this.transition("document.getElementById('MainContent_btnList1').click()","!!document.getElementById('MainContent_ddlDept1')",signal);
    }
    progress({phase:'filtering',message:'Menyiapkan departemen, PIC, dan rentang tanggal…'});
    await this.transition("const e=document.getElementById('MainContent_ddlDept1');e.value='32';e.dispatchEvent(new Event('change',{bubbles:true}))","document.getElementById('MainContent_ddlDept1').value==='32'&&Array.from(document.getElementById('MainContent_ddlPic1').options).some(o=>o.value==='3220')",signal);
    const range=dateWindow(new Date(),timezone);
    const fmt=(iso:string)=>{const [y,m,d]=iso.split('-');return `${d}-${['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][Number(m)-1]}-${y}`;};
    const from=fmt(range.from),to=fmt(range.to);
    await this.read(`(() => {document.getElementById('MainContent_ddlPic1').value='3220';document.getElementById('MainContent_ddlAsal1').value='';document.getElementById('MainContent_ddlStatus1').value='';document.getElementById('MainContent_txtFrom').value=${JSON.stringify(from)};document.getElementById('MainContent_txtTo').value=${JSON.stringify(to)};return true;})()`,signal);
    await this.transition("document.getElementById('MainContent_btnPreview').click()","Array.from(document.querySelectorAll('th')).some(h=>h.textContent.trim()==='TaskNo')",signal);
    const filters=await this.read<string[]>("['MainContent_ddlDept1','MainContent_ddlPic1','MainContent_txtFrom','MainContent_txtTo'].map(id=>document.getElementById(id).value)",signal);
    if(JSON.stringify(filters)!==JSON.stringify(['32','3220',from,to]))throw new PortalError('FILTER_MISMATCH');
    const tasks:Task[]=[];const sourceRows:string[][]=[];const seen=new Set<string>();let scanned=0,page=1;
    for(let iteration=0;iteration<100;iteration++){
      this.check(signal);progress({phase:'reading',message:`Membaca daftar tasks · halaman ${page}`});
      const grid=decodeGrid(await this.read(captureGridScript,signal));
      for(const row of grid.rows){if(seen.has(row.task.TaskNo))throw new PortalError('PAGINATION_DUPLICATE');seen.add(row.task.TaskNo);}
      scanned+=grid.rows.length;sourceRows.push(...grid.sourceRows);
      const selected=grid.rows.filter(r=>['Approval','Open'].includes(r.task.Status));
      for(let index=0;index<selected.length;index++){
        const {task,infoId}=selected[index];
        progress({phase:'details',message:`Membaca rincian tasks · halaman ${page}`,completed:tasks.length,total:tasks.length+selected.length-index});
        const expected=`(() => {const p=document.getElementById('MainContent_PanelModalTarget');return !!p&&getComputedStyle(p).display!=='none'&&p.innerText.includes(${JSON.stringify(task.TaskNo)});})()`;
        await this.transition(`document.getElementById(${JSON.stringify(infoId)}).click()`,expected,signal);
        const history=await this.read<{text:string;tables:string[][][]}>("(() => {const p=document.getElementById('MainContent_PanelModalTarget');return {text:p.innerText,tables:Array.from(p.querySelectorAll('table')).map(t=>Array.from(t.rows).map(r=>Array.from(r.cells).map(c=>c.innerText.trim())))};})()",signal);
        if(!validateHistoryIdentity(task.TaskNo,history.text))throw new PortalError('HISTORY_MISMATCH');
        task.history=history;tasks.push(task);
        await this.transition("document.getElementById('MainContent_btnClose').click()","getComputedStyle(document.getElementById('MainContent_PanelModalTarget')).display==='none'",signal);
      }
      const next=nextPager(grid.pagers,page);
      if(!next){
        this.check(signal);progress({phase:'validating',message:`Memvalidasi ${tasks.length} tasks dari ${scanned} baris…`});
        const scope:Scope={...range,pic:'MUHAMMAD HERNANDA',department:'IT Mitra Seribu Saudara'};
        return {id:randomUUID(),source:'live',retrievedAt:new Date().toISOString(),scope,totalScanned:scanned,tasks,sourceRows};
      }
      if(iteration===99)throw new PortalError('PAGINATION_LIMIT');
      const before=grid.rows[0]?.task.TaskNo;
      await this.transition(`__doPostBack(${JSON.stringify(next.target)},${JSON.stringify(next.argument)})`,`(() => {const g=${captureGridScript};return g&&g.rows[0]?.cells[1]!==${JSON.stringify(before)};})()`,signal);
      page=/^Page\$\d+$/.test(next.argument)?Number(next.argument.slice(5)):page+1;
    }
    throw new PortalError('PAGINATION_LIMIT');
  }
}
