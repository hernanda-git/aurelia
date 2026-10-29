import { describe, it, expect } from 'vitest';
import { mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const dialog={url:'https://pes.grcboard.com/Modul/ISO/FormInputTask.aspx',visible:true,uploadEnabled:true,files:[]};
function evidenceFile(){
 const dir=mkdtempSync(join(process.env.TMPDIR || process.env.TEMP || tmpdir(), 'pes-driver-test-'));const bytes=Buffer.from('artificial isolated evidence');
 const filePath=join(dir,'contract.txt');writeFileSync(filePath,bytes);
 return {dir,evidence:{filePath,fileName:'contract.txt',size:bytes.length,mime:'text/plain',sha256:createHash('sha256').update(bytes).digest('hex')}};
}

// Browser transport is the sole mocked boundary; real DOM coverage is in the Electron contract test.
const identity = { listTaskNo:'M03989/Task. IT/1026', detailTaskNo:'M03989/Task.IT/1026', pic:'3220', picName:'MUHAMMAD HERNANDA', sourceUrl:'https://app.asana.com/task/store', taskName:'Artificial Store', goal:'Artificial BE complete Store', target:'23-Okt-2026' };
const row = { cells:['11',identity.listTaskNo,'20-Okt-2026',identity.picName,'BE','ITMSS',identity.taskName,identity.goal,'Lain-Lain','1','T1',identity.target,'Approval','','',''], kelolaId:'MainContent_lst_kelola_10', infoId:'MainContent_lst_info_10' };
const grid = { url:'https://pes.grcboard.com/Modul/ISO/FormInputTask.aspx', headers:['Row','TaskNo','TglInput','Pic','Jabatan','DeptName','TaskName','GoalTask','AsalTask','Bobot','Target','Duedate','Status','TglApproval','TglSelesai','Lampiran'], rows:[row] };
const detail = { url:grid.url, taskNo:identity.detailTaskNo,pic:identity.pic,sourceUrl:identity.sourceUrl,taskName:identity.taskName,goal:identity.goal,dept:'32',preservedFields:'artificial unchanged fields',target:identity.target,finish:'',status:'T1',updateEnabled:true,tables:[],attachments:[] };
async function moduleUnderTest() { return import('../src/main/portal-completion').catch(()=>({} as any)); }
function transport(reads:unknown[]) {
 const calls:{action:string;expected:string}[]=[];
 return { calls, lists:0, async evaluate(_script:string) { if(!reads.length)throw Error('UNEXPECTED_READ'); return reads.shift(); }, async transition(action:string,expected:string){calls.push({action,expected});}, async setFileInput(_path:string){}, async list(){this.lists++;return {raw:'caller fresh fetch'};} };
}
describe('fixed PES completion transport',()=>{
 it('rejects unrelated posted-field drift during staging',async()=>{
  const m=await moduleUnderTest();const t=transport([grid,detail,{...detail,status:'Selesai',finish:identity.target,preservedFields:'changed'}]);
  const d=new m.PortalCompletionDriver(t);await expect(d.stage(identity,identity.target)).rejects.toThrow('PRESERVED_FIELDS_CHANGED');
  await expect(d.submit(identity)).rejects.toThrow('NOT_STAGED');
 });
 it('rejects unrelated posted-field drift after staging before submit',async()=>{
  const m=await moduleUnderTest();const staged={...detail,status:'Selesai',finish:identity.target};
  const t=transport([grid,detail,staged,{...staged,preservedFields:'changed'}]);const d=new m.PortalCompletionDriver(t);
  await d.stage(identity,identity.target);await expect(d.submit(identity)).rejects.toThrow('PRESERVED_FIELDS_CHANGED');
  expect(t.calls.some(c=>c.action.includes("get('lbUpdateTask').click()"))).toBe(false);
 });
 it('verifies an explicitly sealed department value, without substituting expected data',async()=>{
  const m=await moduleUnderTest();const t=transport([grid,{...detail,dept:'33'}]);
  await expect(new m.PortalCompletionDriver(t).inspect({...identity,dept:'32'})).rejects.toThrow('DETAIL_IDENTITY_MISMATCH');
 });
 it('rejects changed detail goal after staging without a submit transition',async()=>{
  const m=await moduleUnderTest();const staged={...detail,status:'Selesai',finish:identity.target};
  const t=transport([grid,detail,staged,{...staged,goal:identity.goal+' changed'}]);const d=new m.PortalCompletionDriver(t);
  await d.stage(identity,identity.target);await expect(d.submit(identity)).rejects.toThrow('DETAIL_IDENTITY_MISMATCH');
  expect(t.calls.some(c=>c.action.includes("get('lbUpdateTask').click()"))).toBe(false);
 });
 it('rejects exact detail goal disagreement at inspect before staging or submit',async()=>{
  const m=await moduleUnderTest();const t=transport([grid,{...detail,goal:identity.goal+' '}]);
  await expect(new m.PortalCompletionDriver(t).inspect(identity)).rejects.toThrow('DETAIL_IDENTITY_MISMATCH');
  expect(t.calls).toHaveLength(1);
 });
 it('cannot restage after an uncertain submit',async()=>{
  const m=await moduleUnderTest();const staged={...detail,status:'Selesai',finish:identity.target};
  const t=transport([grid,detail,staged,staged]);const d=new m.PortalCompletionDriver(t);
  await d.stage(identity,identity.target);t.transition=async()=>{throw Error('UNCERTAIN');};
  await expect(d.submit(identity)).rejects.toThrow('UNCERTAIN');
  await expect(d.stage(identity,identity.target)).rejects.toThrow('SUBMIT_ALREADY_ATTEMPTED');expect(t.lists).toBe(1);
 });
 it('admits at most one concurrent upload call',async()=>{
  const m=await moduleUnderTest();const {dir,evidence}=evidenceFile();
  try{
   const selected={...dialog,files:[{name:evidence.fileName,size:evidence.size,type:evidence.mime}]};
   const staged={...detail,status:'Selesai',finish:identity.target};
   const t=transport([grid,detail,staged,staged,dialog,dialog,selected]);const d=new m.PortalCompletionDriver(t);
   await d.stage(identity,identity.target);await d.submit(identity);await d.attach(identity,evidence);
   let count=0;let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
   t.evaluate=async()=>{count++;const n=count;if(n<=2){if(n===2)release();await gate;return selected;}return {...dialog,visible:false};};
   await Promise.allSettled([d.upload(identity),d.upload(identity)]);
   expect(t.calls.filter(c=>c.action.includes("get('btnAddFile').click()"))).toHaveLength(1);
  }finally{rmSync(dir,{recursive:true,force:true});}
 });
 it('admits at most one concurrent submit call',async()=>{
  const m=await moduleUnderTest();const staged={...detail,status:'Selesai',finish:identity.target};
  const t=transport([grid,detail,staged,staged,staged,dialog,dialog]);const d=new m.PortalCompletionDriver(t);
  await d.stage(identity,identity.target);const results=await Promise.allSettled([d.submit(identity),d.submit(identity)]);
  expect(t.calls.filter(c=>c.action.includes("get('lbUpdateTask').click()"))).toHaveLength(1);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 });
 it('reopens saved detail and independently reads Info/list without masking FIFO discrepancies',async()=>{
  const m=await moduleUnderTest();const savedGrid={...grid,rows:[{...row,cells:row.cells.map((c,i)=>i===12?'Update Task':c)}]};
  const saved={...detail,status:'Selesai',finish:identity.target,updateEnabled:false,tables:[[['Target','Status'],['1','Solved']]]};
  const info={url:grid.url,visible:true,taskNo:identity.listTaskNo,text:'Artificial Info Update Task',tables:[[['1','Update Task']]]};
  const t=transport([savedGrid,saved,savedGrid,info]);const d=new m.PortalCompletionDriver(t);
  expect(d.captureSaved,'missing saved readback').toBeTypeOf('function');const result=await d.captureSaved(identity);
  expect(result.detail.status).toBe('Selesai');expect(result.row.cells[12]).toBe('Update Task');expect(result.info.text).toContain('Update Task');
  expect(result.targetTables).toEqual(saved.tables);expect(result.attachmentVerification).toBe('metadata_only');
  expect(t.lists).toBe(2);expect(t.calls.map(c=>c.action).join('')).not.toContain("get('lbUpdateTask').click()");
 });
 it('attaches verified staged bytes, then consumes Upload exactly once on uncertain failure',async()=>{
  const m=await moduleUnderTest();const {dir,evidence}=evidenceFile();
  try {
   const selected={...dialog,files:[{name:evidence.fileName,size:evidence.size,type:evidence.mime}]};
   const staged={...detail,status:'Selesai',finish:identity.target};
   const t=transport([grid,detail,staged,staged,dialog,dialog,selected,selected]);const d=new m.PortalCompletionDriver(t);
   await d.stage(identity,identity.target);await d.submit(identity);
   expect(d.attach,'missing attach').toBeTypeOf('function');const attached=await d.attach(identity,evidence);
   expect(attached.dialog.files).toEqual(selected.files);
   const original=t.transition;t.transition=async(a,e)=>{await original(a,e);throw Error('UPLOAD_UNCERTAIN');};
   await expect(d.upload(identity)).rejects.toThrow('UPLOAD_UNCERTAIN');
   await expect(d.upload(identity)).rejects.toThrow('UPLOAD_ALREADY_ATTEMPTED');
   expect(t.calls.filter(c=>c.action.includes("get('btnAddFile').click()"))).toHaveLength(1);
  } finally {rmSync(dir,{recursive:true,force:true});}
 });
 it('consumes submit before its one-shot transition, including uncertain failure',async()=>{
  const m=await moduleUnderTest();const staged={...detail,status:'Selesai',finish:identity.target};
  const t=transport([grid,detail,staged,staged]);const d=new m.PortalCompletionDriver(t);
  await d.stage(identity,identity.target);expect(d.submit,'missing submit').toBeTypeOf('function');
  const original=t.transition;t.transition=async(a,e)=>{await original(a,e);throw Error('UNCERTAIN_TIMEOUT');};
  await expect(d.submit(identity)).rejects.toThrow('UNCERTAIN_TIMEOUT');
  await expect(d.submit(identity)).rejects.toThrow('SUBMIT_ALREADY_ATTEMPTED');
  expect(t.calls.filter(c=>c.action.includes("get('lbUpdateTask').click()"))).toHaveLength(1);
 });
 it('rejects disabled Update immediately before submit',async()=>{
  const m=await moduleUnderTest();const staged={...detail,status:'Selesai',finish:identity.target};
  const t=transport([grid,detail,staged,{...staged,updateEnabled:false}]);const d=new m.PortalCompletionDriver(t);
  await d.stage(identity,identity.target);await expect(d.submit(identity)).rejects.toThrow('UPDATE_DISABLED');
  expect(t.calls).toHaveLength(2);
 });
 it('stages only Selesai and explicit target date, with independent readback',async()=>{
  const m=await moduleUnderTest();const staged={...detail,status:'Selesai',finish:identity.target};
  const t=transport([grid,detail,staged]);const d=new m.PortalCompletionDriver(t);
  expect(d.stage,'missing stage').toBeTypeOf('function');const result=await d.stage(identity,identity.target);
  expect(result.detail).toEqual(staged);expect(t.calls).toHaveLength(2);
  expect(t.calls[1].action).toContain("dispatchEvent(new Event('change'");
 });
 it.each([
  ['wrong origin',{...grid,url:'https://evil.invalid/Modul/ISO/FormInputTask.aspx'},detail],
  ['unknown list status',{...grid,rows:[{...row,cells:row.cells.map((c,i)=>i===12?'Unknown':c)}]},detail],
  ['wrong goal',{...grid,rows:[{...row,cells:row.cells.map((c,i)=>i===7?'Other goal':c)}]},detail],
  ['duplicate exact row',{...grid,rows:[row,row]},detail],
  ['wrong detail identity',grid,{...detail,taskNo:identity.listTaskNo}],
  ['wrong source',grid,{...detail,sourceUrl:identity.sourceUrl+'/other'}],
  ['wrong PIC',grid,{...detail,pic:'1'}],
  ['wrong target',grid,{...detail,target:'24-Okt-2026'}],
 ])('rejects unsafe live preflight: %s',async(_name,g,d)=>{
   const m=await moduleUnderTest();const t=transport([g,d]);
   await expect(new m.PortalCompletionDriver(t).inspect(identity)).rejects.toThrow();
 });
 it('inspects literal list/detail identities and resolves Kelola from the actual row',async()=>{
  const m=await moduleUnderTest(); expect(m.PortalCompletionDriver,'missing fixed driver').toBeTypeOf('function');
  const t=transport([grid,detail]);const driver=new m.PortalCompletionDriver(t);
  const result=await driver.inspect(identity);
  expect(result.detail.taskNo).toBe(identity.detailTaskNo);expect(result.row.cells[1]).toBe(identity.listTaskNo);
  expect(t.calls[0].action).toContain('MainContent_lst_kelola_10');expect(t.lists).toBe(1);
 });
});
