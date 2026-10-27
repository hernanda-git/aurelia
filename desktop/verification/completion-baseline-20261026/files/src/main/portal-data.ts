import type { Task } from '../shared/types';

export const GRID_FIELDS = ['Row','TaskNo','TglInput','Pic','Jabatan','DeptName','TaskName','GoalTask','AsalTask','Bobot','Target','Duedate','Status','TglApproval','TglSelesai','Lampiran'] as const;
export interface GridRow { cells: string[]; infoId: string }
export interface GridCapture { headers: string[]; rows: GridRow[]; empty: boolean; pagers: {text:string;href:string;disabled:boolean}[] }
export interface DecodedGrid { rows: {task:Task;infoId:string}[]; sourceRows: string[][]; pagers: GridCapture['pagers'] }
export function decodeGrid(input: unknown): DecodedGrid {
  if(!input || typeof input!=='object')throw new Error('GRID_SCHEMA');
  const g=input as GridCapture;
  if(!Array.isArray(g.headers)||g.headers.length!==16||!GRID_FIELDS.slice(1).every((field,i)=>g.headers[i+1]===field))throw new Error('GRID_SCHEMA');
  if(!Array.isArray(g.rows)||g.rows.length>10000||(!g.rows.length&&!g.empty))throw new Error('GRID_EMPTY_UNCONFIRMED');
  const ids=new Set<string>();
  const rows=g.rows.map(row=>{
    if(!Array.isArray(row.cells)||row.cells.length!==16||!row.cells.every(c=>typeof c==='string'))throw new Error('GRID_ROW_SCHEMA');
    const task=Object.fromEntries(GRID_FIELDS.map((key,i)=>[key,row.cells[i]])) as unknown as Task;
    if(!task.TaskNo||ids.has(task.TaskNo))throw new Error('GRID_DUPLICATE');
    if(task.Pic!=='MUHAMMAD HERNANDA')throw new Error('GRID_WRONG_PIC');
    if(['Approval','Open'].includes(task.Status)&&(!row.infoId||!/^MainContent_lst_info_\d+$/.test(row.infoId)))throw new Error('GRID_INFO_MISSING');
    ids.add(task.TaskNo);task.history={text:''};
    return {task,infoId:row.infoId};
  });
  return {rows,sourceRows:g.rows.map(row=>[...row.cells]),pagers:Array.isArray(g.pagers)?g.pagers:[]};
}
export function validateHistoryIdentity(taskNo:string,text:string):boolean{
  const match=text.match(/(?:^|\n)\s*TaskNo\s*:\s*([^\r\n]+)/);
  return match?.[1].trim()===taskNo;
}
export function safePortalUrl(input:string):boolean{
  try {const u=new URL(input);return u.origin==='https://pes.grcboard.com'&&!u.username&&!u.password;}catch{return false;}
}
export function encodeExportCsv(tasks:Task[]):string{
  const fields=[...GRID_FIELDS,'History'];
  const quote=(value:string)=>{const safe=/^[\s\u0000-\u001f]*[=+\-@]/.test(value)?"'"+value:value;return '"'+safe.replace(/"/g,'""')+'"';};
  return '\ufeff'+[fields.map(quote).join(','),...tasks.map(t=>fields.map(k=>quote(k==='History'?t.history.text:String(t[k as keyof Task]??''))).join(','))].join('\r\n');
}
export function nextPager(pagers:GridCapture['pagers'],current:number):{target:string;argument:string}|null{
  const parsed=pagers.filter(p=>!p.disabled).map(p=>{
    const m=p.href.match(/^javascript:__doPostBack\(['"]([\w$]+)['"],['"](Page\$(?:\d+|Next|Last|Prev|First))['"]\);?$/);
    return m?{target:m[1],argument:m[2],text:p.text}:null;
  });
  if(parsed.some(p=>p?.argument==='Page$Next'))return parsed.find(p=>p?.argument==='Page$Next')!;
  const later=parsed.filter((p):p is NonNullable<typeof p>=>!!p&&/^Page\$\d+$/.test(p.argument)&&Number(p.argument.slice(5))>current).sort((a,b)=>Number(a.argument.slice(5))-Number(b.argument.slice(5)));
  if(later[0])return later[0];
  if(parsed.some(p=>p?.argument==='Page$Last'))throw new Error('PAGINATION_UNSUPPORTED');
  if(pagers.some(p=>!p.disabled&&/next|berikut|›|»/i.test(p.text)&&!/^javascript:__doPostBack\(/.test(p.href)))throw new Error('PAGINATION_UNSUPPORTED');
  if(pagers.length&&parsed.every(p=>p===null))throw new Error('PAGINATION_UNSUPPORTED');
  return null;
}

export const captureGridScript = `(() => {
 const tables=Array.from(document.querySelectorAll('table'));
 const table=tables.find(t=>Array.from(t.querySelectorAll('th')).some(h=>h.textContent.trim()==='TaskNo'));
 if(!table)return null;
 const rows=Array.from(table.rows).filter(r=>Array.from(r.cells).some(c=>c.tagName==='TD')).filter(r=>r.cells.length>=2);
 const headers=Array.from(table.querySelectorAll('th')).map(h=>h.textContent.trim());
 const text=table.textContent||'';
 const links=Array.from(document.querySelectorAll('a')).filter(a=>(a.getAttribute('href')||'').includes('Page$'));
 return {headers,rows:rows.filter(r=>r.cells.length>1).map(r=>({cells:Array.from(r.cells).map(c=>c.innerText.trim()),infoId:r.querySelector('input[id*="_info_"]')?.id||''})),empty:!rows.length&&/no (?:data|records)|tidak ada|data tidak|belum ada/i.test(text),pagers:links.map(a=>({text:a.innerText.trim(),href:a.getAttribute('href')||'',disabled:a.getAttribute('aria-disabled')==='true'||a.classList.contains('disabled')}))};
})()`;
