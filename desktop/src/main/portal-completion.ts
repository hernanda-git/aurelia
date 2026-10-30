import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { isAbsolute, basename } from 'node:path';

/** Main-process only. Fixed scripts; never expose this transport to renderer IPC.
 * The owner must hold its portal lock and supply a journal around submit/upload.
 */
export interface CompletionBrowserTransport {
  evaluate(script:string):Promise<unknown>;
  /** Execute action ONCE, then await ASP.NET endRequest/full navigation AND expected.
   * A rejection is uncertain, NOT permission to retry the action. */
  transition(action:string, expected:string):Promise<void>;
  /** Main-process CDP: resolve the visible #MainContent_fuFileName afresh, never fuFileName1. */
  setFileInput(filePath:string):Promise<void>;
  /** Caller reruns its existing read-only all-status fetch; leaves a current list page. */
  list():Promise<unknown>;
  screenshot?():Promise<unknown>;
}
export interface CompletionIdentity {
  listTaskNo:string; detailTaskNo:string; pic:string; picName:string;
  sourceUrl:string; taskName:string; goal:string; target:string;
  /** Optional sealed department ID; observed independently, never inferred from display text. */
  dept?:string;
}
export interface CompletionRow { cells:string[]; kelolaId:string; infoId:string }
export interface CompletionGrid { url:string; headers:string[]; rows:CompletionRow[] }
export interface CompletionDetail {
  url:string; taskNo:string; pic:string; sourceUrl:string; taskName:string;
  target:string; goal:string; dept:string; finish:string; status:string; updateEnabled:boolean;
  /** Exact serialized control state, excluding only intended edits and ASP.NET protocol tokens. */
  preservedFields:string;
  tables:string[][][]; attachments:{text:string;href:string}[];
}
const fields=['Row','TaskNo','TglInput','Pic','Jabatan','DeptName','TaskName','GoalTask','AsalTask','Bobot','Target','Duedate','Status','TglApproval','TglSelesai','Lampiran'];
const q=JSON.stringify;
const domPrelude=`const get=id=>document.getElementById('MainContent_'+id);const visible=e=>!!e&&!!e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none';const text=e=>e?.innerText??e?.textContent??'';const value=id=>get(id)?.value??null;`;
const gridScript=`(() => {${domPrelude}
 const tables=Array.from(document.querySelectorAll('table')).filter(visible);
 const matches=tables.filter(t=>Array.from(t.rows[0]?.cells??[]).some(c=>text(c).trim()==='TaskNo'));
 if(matches.length!==1)throw Error('LIST_UNKNOWN');const table=matches[0];
 return {url:location.href,headers:Array.from(table.rows[0].cells).map(c=>text(c).trim()),rows:Array.from(table.rows).slice(1).filter(r=>r.cells.length===16).map(r=>({cells:Array.from(r.cells).map(c=>text(c)),kelolaId:r.querySelector('[id^="MainContent_lst_kelola_"]')?.id??'',infoId:r.querySelector('[id^="MainContent_lst_info_"]')?.id??''}))};})()`;
// Independently observed live control ID: MainContent_TxtGoal (case preserved).
const goalPrelude=`const exactControlValue=(id,tag)=>{const nodes=document.querySelectorAll('[id="'+id+'"]');if(nodes.length!==1||nodes[0].tagName!==tag||!visible(nodes[0])||typeof nodes[0].value!=='string')throw Error('DETAIL_CONTROL_UNKNOWN');return nodes[0].value;};const goalValue=()=>exactControlValue('MainContent_TxtGoal','INPUT');`;
// Conservative DOM fingerprint: preserve even disabled/hidden business controls and
// control metadata. Only status/date are intended edits; protocol tokens may rotate
// across ASP.NET postbacks. This is not a claim of backend/postback compatibility.
const preservedPrelude=`const preservedFields=()=>JSON.stringify(Array.from(document.querySelectorAll('input,select,textarea')).filter(e=>!['MainContent_ddlStatus','MainContent_txtTglSelesai'].includes(e.id)&&!['button','submit','reset','image','file'].includes(e.type)&&!/^__(?:VIEWSTATE(?:[0-9]+|FIELDCOUNT|GENERATOR)?|EVENTVALIDATION|EVENTTARGET|EVENTARGUMENT|LASTFOCUS)$/.test(e.id)&&!/^__(?:VIEWSTATE(?:[0-9]+|FIELDCOUNT|GENERATOR)?|EVENTVALIDATION|EVENTTARGET|EVENTARGUMENT|LASTFOCUS)$/.test(e.name)).map(e=>({id:e.id,name:e.name,tag:e.tagName,type:e.type,value:e.value,checked:e.checked??null,disabled:e.disabled,readOnly:e.readOnly??null,selected:e.tagName==='SELECT'?Array.from(e.selectedOptions).map(o=>o.value):null})));`;
const detailScript=`(() => {${domPrelude}${goalPrelude}${preservedPrelude}
 const update=get('lbUpdateTask');return {url:location.href,taskNo:value('txtTaskNo'),pic:value('ddlPIC'),sourceUrl:value('txtLain'),taskName:value('txtKeterangan'),goal:goalValue(),preservedFields:preservedFields(),dept:exactControlValue('MainContent_ddlDept','SELECT'),target:value('txtTglTarget'),finish:value('txtTglSelesai'),status:value('ddlStatus'),updateEnabled:visible(update)&&!update.disabled&&update.getAttribute('aria-disabled')!=='true'&&!update.classList.contains('aspNetDisabled'),tables:Array.from(document.querySelectorAll('table')).filter(visible).map(t=>Array.from(t.rows).map(r=>Array.from(r.cells).map(text))),attachments:Array.from(document.querySelectorAll('a[id*="download"]')).filter(visible).map(a=>({text:text(a),href:a.getAttribute('href')??''}))};})()`;
function assertOrigin(url:string):void {
  const u=new URL(url);if(u.origin!=='https://pes.grcboard.com'||u.username||u.password||u.pathname!=='/Modul/ISO/FormInputTask.aspx')throw Error('ORIGIN_REJECTED');
}
function assertIdentity(i:CompletionIdentity):void {
  if(!i||Object.values(i).some(v=>typeof v!=='string'||!v||/[\r\n\u0000]/.test(v)))throw Error('IDENTITY_REQUIRED');
}
function assertDetail(d:CompletionDetail,i:CompletionIdentity):void {
  assertOrigin(d.url);
  if(typeof d.preservedFields!=='string'||!d.preservedFields)throw Error('PRESERVED_FIELDS_UNKNOWN');
  if(d.taskNo!==i.detailTaskNo||d.pic!==i.pic||d.sourceUrl!==i.sourceUrl||d.taskName!==i.taskName||d.goal!==i.goal||d.target!==i.target||(i.dept!==undefined&&d.dept!==i.dept))throw Error('DETAIL_IDENTITY_MISMATCH');
}
function assertRow(g:CompletionGrid,i:CompletionIdentity):CompletionRow {
  assertOrigin(g.url);
  if(!Array.isArray(g.headers)||JSON.stringify(g.headers.slice(1))!==JSON.stringify(fields.slice(1)))throw Error('LIST_UNKNOWN');
  const rows=g.rows.filter(r=>r.cells[1]===i.listTaskNo);
  if(rows.length!==1)throw Error('LIST_IDENTITY_MISMATCH');const row=rows[0];
  if(row.cells.length!==16||row.cells[3]!==i.picName||row.cells[6]!==i.taskName||row.cells[7]!==i.goal||row.cells[11]!==i.target||!/^MainContent_lst_kelola_\d+$/.test(row.kelolaId)||!/^MainContent_lst_info_\d+$/.test(row.infoId))throw Error('LIST_IDENTITY_MISMATCH');
  if(!['Approval','Open','Solved','Update Task'].includes(row.cells[12]))throw Error('LIST_STATE_UNKNOWN');
  return row;
}
function guard(i:CompletionIdentity,preserved:string):string {
 return `${domPrelude}${goalPrelude}${preservedPrelude}
 if(location.origin!=='https://pes.grcboard.com'||location.pathname!=='/Modul/ISO/FormInputTask.aspx')throw Error('ORIGIN_REJECTED');
 if(value('txtTaskNo')!==${q(i.detailTaskNo)}||value('ddlPIC')!==${q(i.pic)}||value('txtLain')!==${q(i.sourceUrl)}||value('txtKeterangan')!==${q(i.taskName)}||goalValue()!==${q(i.goal)}||${i.dept===undefined?'false':`exactControlValue('MainContent_ddlDept','SELECT')!==${q(i.dept)}`}||value('txtTglTarget')!==${q(i.target)})throw Error('DETAIL_IDENTITY_MISMATCH');
 if(preservedFields()!==${q(preserved)})throw Error('PRESERVED_FIELDS_CHANGED');`;
}
export interface CompletionDialog { url:string; visible:boolean; uploadEnabled:boolean; files:{name:string;size:number;type:string}[] }
const dialogScript=`(() => {${domPrelude}const input=get('fuFileName'),button=get('btnAddFile');return {url:location.href,visible:visible(input)&&input.type==='file',uploadEnabled:visible(button)&&!button.disabled&&button.getAttribute('aria-disabled')!=='true'&&!button.classList.contains('aspNetDisabled'),files:Array.from(input?.files??[]).map(f=>({name:f.name,size:f.size,type:f.type}))};})()`;
const dialogExpected=`(() => {${domPrelude}return visible(get('fuFileName'))&&get('fuFileName').type==='file'&&visible(get('btnAddFile'));})()`;
function assertDialog(d:CompletionDialog):void { assertOrigin(d.url);if(!d.visible||!d.uploadEnabled)throw Error('UPLOAD_DIALOG_NOT_READY'); }
/** Path ownership/root policy belongs to the sealed evidence stager. This driver rechecks
 * local bytes but cannot attest remote bytes: saved attachment assurance is metadata_only. */
export interface CompletionStagedFile { filePath:string;fileName:string;size:number;mime:string;sha256:string }
async function verifyFile(f:CompletionStagedFile):Promise<void> {
 if(!isAbsolute(f.filePath)||basename(f.filePath)!==f.fileName||!Number.isSafeInteger(f.size)||f.size<=0||!f.mime||!/^\w{64}$/.test(f.sha256))throw Error('STAGED_FILE_INVALID');
 const stat=await lstat(f.filePath);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size!==f.size)throw Error('STAGED_FILE_INVALID');
 const bytes=await readFile(f.filePath);
 if(bytes.length!==f.size||createHash('sha256').update(bytes).digest('hex')!==f.sha256)throw Error('STAGED_FILE_CHANGED');
}
function assertSelected(d:CompletionDialog,f:CompletionStagedFile):void {
 assertDialog(d);if(d.files.length!==1||d.files[0].name!==f.fileName||d.files[0].size!==f.size||d.files[0].type!==f.mime)throw Error('SELECTED_FILE_MISMATCH');
}
export interface CompletionInfo { url:string;visible:boolean;taskNo:string|null;text:string;tables:string[][][] }
const infoScript=`(() => {${domPrelude}const p=get('PanelModalTarget'),raw=text(p);return {url:location.href,visible:visible(p),taskNo:raw.match(/(?:^|\\n)TaskNo[ \\t]*:[ \\t]*([^\\r\\n]*)/)?.[1]??null,text:raw,tables:Array.from(p?.querySelectorAll('table')??[]).map(t=>Array.from(t.rows).map(r=>Array.from(r.cells).map(text)))};})()`;
export class PortalCompletionDriver {
  private attached?:CompletionStagedFile;
  private uploadAttempted=false;
  private submitAttempted=false;
  private submitted=false;
  private staged?:{identity:CompletionIdentity;finish:string;preservedFields:string};
  constructor(private readonly transport:CompletionBrowserTransport){}
  async stage(identity:CompletionIdentity, finishDate:string){
    if(this.submitAttempted)throw Error('SUBMIT_ALREADY_ATTEMPTED');
    this.staged=undefined;
    if(!finishDate)throw Error('FINISH_DATE_REQUIRED');
    const before=await this.inspect(identity);
    if(!['Approval','Open'].includes(before.row.cells[12])||!['T1','Approval','Open'].includes(before.detail.status)||!before.detail.updateEnabled||before.detail.finish!=='')throw Error('TASK_NOT_WRITABLE');
    const base=guard(identity,before.detail.preservedFields);
    await this.transport.transition(`(() => {${base}const s=get('ddlStatus');if(!Array.from(s.options).some(o=>o.value==='Selesai'))throw Error('STATUS_UNAVAILABLE');s.value='Selesai';s.dispatchEvent(new Event('change',{bubbles:true}));})()`,"document.getElementById('MainContent_ddlStatus')?.value==='Selesai'");
    // Setting the date is local DOM staging, not an ASP.NET postback. Do not wait for
    // a nonexistent endRequest; read the entire form back in the same scoped script.
    const detail=await this.transport.evaluate(`(() => {${base}if(value('ddlStatus')!=='Selesai')throw Error('STAGE_MISMATCH');get('txtTglSelesai').value=${q(finishDate)};get('txtTglSelesai').dispatchEvent(new Event('input',{bubbles:true}));return ${detailScript};})()`) as CompletionDetail;assertDetail(detail,identity);
    if(detail.status!=='Selesai'||detail.finish!==finishDate||!detail.updateEnabled)throw Error('STAGE_MISMATCH');
    if(detail.preservedFields!==before.detail.preservedFields)throw Error('PRESERVED_FIELDS_CHANGED');
    this.staged={identity:{...identity},finish:finishDate,preservedFields:detail.preservedFields};return {before,detail};
  }
  /** Durable submit intent belongs immediately outside this method. No automatic retries. */
  async submit(identity:CompletionIdentity){
    if(this.submitAttempted)throw Error('SUBMIT_ALREADY_ATTEMPTED');
    if(!this.staged||q(this.staged.identity)!==q(identity))throw Error('NOT_STAGED');
    const detail=await this.transport.evaluate(detailScript) as CompletionDetail;assertDetail(detail,identity);
    if(detail.preservedFields!==this.staged.preservedFields)throw Error('PRESERVED_FIELDS_CHANGED');
    if(!detail.updateEnabled)throw Error('UPDATE_DISABLED');
    if(detail.status!=='Selesai'||detail.finish!==this.staged.finish)throw Error('STAGE_MISMATCH');
    // Recheck after the await: concurrent callers must not each pass the first guard.
    if(this.submitAttempted)throw Error('SUBMIT_ALREADY_ATTEMPTED');
    this.submitAttempted=true;
    await this.transport.transition(`(() => {${guard(identity,this.staged.preservedFields)}const b=get('lbUpdateTask');if(!visible(b)||b.disabled||b.getAttribute('aria-disabled')==='true'||b.classList.contains('aspNetDisabled'))throw Error('UPDATE_DISABLED');if(value('ddlStatus')!=='Selesai'||value('txtTglSelesai')!==${q(this.staged.finish)})throw Error('STAGE_MISMATCH');get('lbUpdateTask').click();})()`,dialogExpected);
    const dialog=await this.transport.evaluate(dialogScript) as CompletionDialog;assertDialog(dialog);
    this.submitted=true;return {detail,dialog};
  }
  private requireSubmitted(identity:CompletionIdentity):void {
    if(!this.submitted||!this.staged||q(this.staged.identity)!==q(identity))throw Error('NOT_SUBMITTED');
  }
  async attach(identity:CompletionIdentity,evidence:CompletionStagedFile){
    this.requireSubmitted(identity);if(this.uploadAttempted)throw Error('UPLOAD_ALREADY_ATTEMPTED');
    this.attached=undefined;await verifyFile(evidence);
    const before=await this.transport.evaluate(dialogScript) as CompletionDialog;assertDialog(before);
    await this.transport.setFileInput(evidence.filePath);
    const dialog=await this.transport.evaluate(dialogScript) as CompletionDialog;assertSelected(dialog,evidence);
    this.attached={...evidence};return {before,dialog,localSha256:evidence.sha256};
  }
  /** Durable upload intent belongs immediately outside this method. */
  async upload(identity:CompletionIdentity){
    if(this.uploadAttempted)throw Error('UPLOAD_ALREADY_ATTEMPTED');this.requireSubmitted(identity);
    const f=this.attached;if(!f)throw Error('NOT_ATTACHED');await verifyFile(f);
    const before=await this.transport.evaluate(dialogScript) as CompletionDialog;assertSelected(before,f);
    if(this.uploadAttempted)throw Error('UPLOAD_ALREADY_ATTEMPTED');
    this.uploadAttempted=true;
    await this.transport.transition(`(() => {${domPrelude}if(location.origin!=='https://pes.grcboard.com'||location.pathname!=='/Modul/ISO/FormInputTask.aspx')throw Error('ORIGIN_REJECTED');const input=get('fuFileName'),b=get('btnAddFile'),files=input?.files;if(!visible(input)||input.type!=='file'||!visible(b)||b.disabled||b.getAttribute('aria-disabled')==='true'||b.classList.contains('aspNetDisabled'))throw Error('UPLOAD_DIALOG_NOT_READY');if(files?.length!==1||files[0].name!==${q(f.fileName)}||files[0].size!==${f.size}||files[0].type!==${q(f.mime)})throw Error('SELECTED_FILE_MISMATCH');get('btnAddFile').click();})()`,`(() => {${domPrelude}return !visible(get('fuFileName'));})()`);
    const after=await this.transport.evaluate(dialogScript) as CompletionDialog;assertOrigin(after.url);
    if(after.visible)throw Error('UPLOAD_OUTCOME_UNKNOWN');return {before,after,attachmentVerification:'metadata_only' as const};
  }
  /** Read-only reconciliation is available on a fresh driver after an uncertain attempt. */
  async captureSaved(identity:CompletionIdentity){
    const saved=await this.inspect(identity);
    const detailScreenshot=await this.transport.screenshot?.();
    const list=await this.transport.list();const grid=await this.transport.evaluate(gridScript) as CompletionGrid;const row=assertRow(grid,identity);
    await this.transport.transition(`document.getElementById(${q(row.infoId)}).click()`,`(() => {${domPrelude}return visible(get('PanelModalTarget'));})()`);
    const info=await this.transport.evaluate(infoScript) as CompletionInfo;assertOrigin(info.url);
    if(!info.visible||info.taskNo!==identity.listTaskNo)throw Error('INFO_IDENTITY_MISMATCH');
    const infoScreenshot=await this.transport.screenshot?.();
    await this.transport.transition("document.getElementById('MainContent_btnClose').click()",`(() => {${domPrelude}return !visible(get('PanelModalTarget'));})()`);
    return {detail:saved.detail,targetTables:saved.detail.tables,attachments:{detail:saved.detail.attachments,listCell:row.cells[15]},list,grid,row,info,detailScreenshot,infoScreenshot,attachmentVerification:'metadata_only' as const};
  }
  async inspect(identity:CompletionIdentity){
    assertIdentity(identity);
    const list=await this.transport.list();
    const grid=await this.transport.evaluate(gridScript) as CompletionGrid;
    const row=assertRow(grid,identity);
    await this.transport.transition(`document.getElementById(${q(row.kelolaId)}).click()`,`document.getElementById('MainContent_txtTaskNo')?.value===${q(identity.detailTaskNo)}`);
    const detail=await this.transport.evaluate(detailScript) as CompletionDetail;
    assertDetail(detail,identity);
    return {list,grid,row,detail};
  }
}
