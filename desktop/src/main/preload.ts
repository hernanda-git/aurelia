import { contextBridge, ipcRenderer } from 'electron';
import type { AppState, DesktopAPI } from '../shared/types';
import type { AsanaAPI, AsanaState } from '../shared/asana-types';
const api:DesktopAPI={
 getState:()=>ipcRenderer.invoke('pes:state'),sync:()=>ipcRenderer.invoke('pes:sync'),cancelSync:()=>ipcRenderer.invoke('pes:cancel'),openConnection:()=>ipcRenderer.invoke('pes:connection'),
 togglePin:id=>ipcRenderer.invoke('pes:pin',id),setFocus:id=>ipcRenderer.invoke('pes:focus',id),updateSettings:settings=>ipcRenderer.invoke('pes:settings',settings),clearActivity:()=>ipcRenderer.invoke('pes:clear-activity'),
 exportTasks:(format,id)=>ipcRenderer.invoke('pes:export-tasks',format,id),exportActivity:()=>ipcRenderer.invoke('pes:export-activity'),copyText:text=>ipcRenderer.invoke('pes:copy',text),openPes:()=>ipcRenderer.invoke('pes:open-portal'),window:action=>ipcRenderer.invoke('pes:window',action),
 openAgentWorkspace:taskId=>ipcRenderer.invoke('pes:agent-workspace',taskId),copyTaskContext:taskId=>ipcRenderer.invoke('pes:agent-context',taskId),
 onState:listener=>{const handler=(_event:unknown,state:AppState)=>listener(state);ipcRenderer.on('pes:state-changed',handler);return()=>ipcRenderer.removeListener('pes:state-changed',handler);}
};
contextBridge.exposeInMainWorld('pes',api);
const asana:AsanaAPI={
 getState:()=>ipcRenderer.invoke('asana:state'),
 reloadCatalog:()=>ipcRenderer.invoke('asana:reload-catalog'),
 cancelReload:()=>ipcRenderer.invoke('asana:cancel'),
 setPreferences:patch=>ipcRenderer.invoke('asana:preferences',patch),
 openTask:gid=>ipcRenderer.invoke('asana:open',gid),
 copyTask:gid=>ipcRenderer.invoke('asana:copy',gid),
 exportTasks:(format,gids)=>ipcRenderer.invoke('asana:export',format,gids),
 onState:listener=>{const handler=(_event:unknown,state:AsanaState)=>listener(state);ipcRenderer.on('asana:state-changed',handler);return()=>ipcRenderer.removeListener('asana:state-changed',handler);}
};
contextBridge.exposeInMainWorld('asana',asana);
