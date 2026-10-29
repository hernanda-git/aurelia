import type { AsanaTask, AsanaOption, AsanaSnapshot } from '../../shared/asana-types';
export type Query = {query:string;status:string;progress:string;completion:string;role:string;due:string;section:string;sort:string;page:number;pageSize:number};
export const defaultQuery:Query={query:'',status:'all',progress:'all',completion:'all',role:'all',due:'all',section:'all',sort:'modified',page:1,pageSize:50};
export const rawOption=(option:AsanaOption)=>option.name ?? (option.gid ? `Unknown (${option.gid})` : 'Unset');
export const isUntitledTask = (task: AsanaTask): boolean =>
  !task.name.trim() ||
  (Array.isArray(task.anomalies) && task.anomalies.includes('untitled')) ||
  task.name.trim().toLowerCase() === 'untitled task' ||
  task.name.trim().toLowerCase() === 'untitled' ||
  task.name.trim().toLowerCase() === 'tanpa judul' ||
  (task.name === task.gid && /^\d{10,}$/.test(task.gid));
export const taskTitle=(task:AsanaTask)=>!task.name.trim() ? 'Untitled task' : task.name;
function statusRank(key:string,label:string):number {
 const k=key.toLowerCase().trim(), l=label.toLowerCase().trim();
 if(k==='unset'||l==='unset') return 1;
 if(l.includes('in-progress')||l.includes('in progress')) return 2;
 if(l.includes('ready to qa')) return 3;
 if(l.includes('user/po')||l.includes('user / po')) return 4;
 return 100;
}
export function statusGroups(tasks:AsanaTask[], options:AsanaSnapshot['statusOptions']=[]) {
 const groups=new Map(options.map(o=>[o.gid,{key:o.gid,label:o.name,count:0}]));
 for(const t of uniqueTasks(tasks)){
  if(isUntitledTask(t)) continue;
  const key=t.status.gid ?? 'unset';const group=groups.get(key) ?? {key,label:rawOption(t.status),count:0}; group.count++;groups.set(key,group);
 }
 return [...groups.values()].sort((a,b)=>{
  const rA=statusRank(a.key,a.label),rB=statusRank(b.key,b.label);
  return rA!==rB ? rA-rB : a.label.localeCompare(b.label);
 });
}
export const uniqueTasks=(tasks:AsanaTask[])=>[...new Map(tasks.map(t=>[t.gid,t])).values()];
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
export function civilDay(date:Date, timezone:string):string {
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 return ['year','month','day'].map(key=>parts.find(p=>p.type===key)!.value).join('-');
}
export function civilDue(task:AsanaTask,timezone:string):string|null {
 if(task.dueAt){const date=new Date(task.dueAt); if(Number.isFinite(date.getTime()))return civilDay(date,timezone);}
 if(task.dueOn && /^\d{4}-\d{2}-\d{2}$/.test(task.dueOn)){const date=new Date(`${task.dueOn}T00:00:00Z`);if(Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===task.dueOn)return task.dueOn;}
 return null;
}
export function queryTasks(tasks:AsanaTask[], q:Query, timezone='UTC', today=civilDay(new Date(),timezone)) {
 const unique=uniqueTasks(tasks).filter(t=>!isUntitledTask(t)), search=q.query.trim().toLocaleLowerCase(), now=Date.now();
 const overdue=(task:AsanaTask)=>!task.completed&&(task.dueAt&&Number.isFinite(Date.parse(task.dueAt))?Date.parse(task.dueAt)<now:!!civilDue(task,timezone)&&civilDue(task,timezone)!<today);
 const matching=unique.filter(t=>(q.status==='all'||(t.status.gid??'unset')===q.status)&&(q.progress==='all'||(t.progress.gid??'unset')===q.progress)&&(q.completion==='all'||t.completed===(q.completion==='completed'))&&(q.role==='all'||t.role===q.role)&&(q.section==='all'||(q.section==='unset'?!t.memberships.some(m=>m.sectionGid):t.memberships.some(m=>m.sectionGid===q.section)))&& (q.due==='all'||(q.due==='none'?!civilDue(t,timezone):q.due==='overdue'?overdue(t):q.due==='today'?civilDue(t,timezone)===today:!!civilDue(t,timezone)&&civilDue(t,timezone)!>today))&&(!search||[t.gid,t.name,t.notes,t.goal,...t.fields.map(f=>f.displayValue??'')].some(s=>s.toLocaleLowerCase().includes(search))));
 matching.sort((a,b)=>{
  const dateKey=(t:AsanaTask)=>t.modifiedAt||(t.dueAt?t.dueAt:t.dueOn?`${t.dueOn}T00:00:00Z`:'')||t.lastSeenAt||'';
  if(q.sort==='modified'){return -1*cmp(dateKey(a),dateKey(b))||cmp(a.gid,b.gid);}
  const key=(t:AsanaTask)=>q.sort==='due'?civilDue(t,timezone)??'9999-99-99':q.sort==='gid'?t.gid:taskTitle(t).toLocaleLowerCase();
  return cmp(key(a),key(b))||cmp(a.gid,b.gid);
 });
 const size=Math.max(1,q.pageSize), pages=Math.max(1,Math.ceil(matching.length/size)),page=Math.max(1,Math.min(q.page,pages));
 return {total:unique.length,matching:matching.length,tasks:matching.slice((page-1)*size,page*size),allMatching:matching,page,pages};
}
