import type { AsanaState, AsanaTask } from '../shared/asana-types';
const PROJECT='1208922858503175';
const PIC_FIELD='1208878911420813';
const PIC_OPTION='1214725811552235';
const gid=(value:unknown):value is string=>typeof value==='string'&&/^\d{1,32}$/.test(value);
function owned(task:AsanaTask):boolean{
 return !!task&&gid(task.gid)&&task.ownership?.fieldGid===PIC_FIELD&&task.ownership?.optionGid===PIC_OPTION&&task.ownership?.projectGid===PROJECT
  &&Array.isArray(task.memberships)&&task.memberships.some(m=>m.projectGid===PROJECT);
}
export function requireOwnedAsanaTask(state:AsanaState,value:unknown):AsanaTask{
 if(!gid(value)||!state.snapshot)throw Error('ASANA_TASK_UNAVAILABLE');
 const matches=state.snapshot.tasks.filter(t=>t.gid===value);
 if(matches.length!==1||!owned(matches[0]))throw Error('ASANA_TASK_UNAVAILABLE');
 return matches[0];
}
export function validateAsanaSelection(state:AsanaState,values:unknown):AsanaTask[]{
 if(!Array.isArray(values)||values.length===0||values.length>10000||new Set(values).size!==values.length)throw Error('ASANA_SELECTION_INVALID');
 return values.map(value=>requireOwnedAsanaTask(state,value));
}
export function asanaTaskUrl(state:AsanaState,value:unknown):string{
 const task=requireOwnedAsanaTask(state,value);
 return `https://app.asana.com/1/1206737432461724/project/${PROJECT}/task/${task.gid}`;
}
export function asanaTaskContext(state:AsanaState,value:unknown):string{
 const task=requireOwnedAsanaTask(state,value);
 return [`# ${task.name||'Tanpa judul'}`,`GID: ${task.gid}`,`IT PIC: HERNANDA MSS`,`Source: catalog-only, not a live Asana observation`,`Captured: ${state.snapshot!.retrievedAt}`,`Task last seen: ${task.lastSeenAt??'unavailable'}`,`Status: ${task.status.name??'(unset)'}`,`Task Progress: ${task.progress.name??'(unset)'}`,`Asana completed: ${task.completed}`,`Due date: ${task.dueAt??task.dueOn??'(unset)'}`,`IT Start Date: ${task.itStartDate??'(unset)'}`,`IT End Date: ${task.itEndDate??'(unset)'}`,`Link: ${asanaTaskUrl(state,value)}`,'',task.goal,task.notes].join('\n');
}
function exportTask(t:AsanaTask){
 return {gid:t.gid,name:t.name,notes:t.notes,goal:t.goal,role:t.role,completed:t.completed,status:{gid:t.status.gid,name:t.status.name},progress:{gid:t.progress.gid,name:t.progress.name},dueOn:t.dueOn,dueAt:t.dueAt,itStartDate:t.itStartDate,itEndDate:t.itEndDate,modifiedAt:t.modifiedAt,lastSeenAt:t.lastSeenAt,url:`https://app.asana.com/1/1206737432461724/project/${PROJECT}/task/${t.gid}`,parent:t.parent?{gid:t.parent.gid,name:t.parent.name}:null,memberships:t.memberships.map(m=>({projectGid:m.projectGid,projectName:m.projectName,sectionGid:m.sectionGid,sectionName:m.sectionName})),fields:t.fields.map(f=>({gid:f.gid,name:f.name,displayValue:f.displayValue})),anomalies:[...t.anomalies],ownership:{...t.ownership}};
}
export function encodeAsanaExport(state:AsanaState,format:unknown,values:unknown):string{
 if(format!=='json'&&format!=='csv')throw Error('ASANA_EXPORT_FORMAT');
 const tasks=validateAsanaSelection(state,values);
 if(format==='json')return JSON.stringify({schemaVersion:1,provider:'asana',owner:'HERNANDA MSS',source:'catalog',coverage:'catalog_only',snapshotId:state.snapshot!.id,capturedAt:state.snapshot!.retrievedAt,queryTotalOwned:new Set(state.snapshot!.tasks.filter(owned).map(t=>t.gid)).size,selectionCount:tasks.length,tasks:tasks.map(exportTask)},null,2);
 const cell=(value:unknown)=>{let s=value==null?'':String(value);if(/^[\s]*[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
 const rows:unknown[][]=[['GID','Name','Status','Task Progress','Completed','Due date','Due at','IT Start Date','IT End Date','Role','Last seen','Source']];
 for(const task of tasks)rows.push([task.gid,task.name,task.status.name,task.progress.name,task.completed,task.dueOn,task.dueAt,task.itStartDate,task.itEndDate,task.role,task.lastSeenAt,'catalog_only']);
 return rows.map(row=>row.map(cell).join(',')).join('\r\n');
}
