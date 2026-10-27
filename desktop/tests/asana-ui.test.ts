import { describe, expect, it, vi } from 'vitest';
import { queryTasks, statusGroups, taskTitle, rawOption, defaultQuery, civilDue } from '../src/renderer/asana/view-model';
import type { AsanaTask } from '../src/shared/asana-types';
export const task = (gid:string, patch:Partial<AsanaTask>={}):AsanaTask => ({gid,name:`Task ${gid}`,notes:'',goal:'',role:'BE',completed:false,status:{gid:'s',name:'Ready to QA'},progress:{gid:'p',name:'Done '},dueOn:null,dueAt:null,itStartDate:null,itEndDate:null,modifiedAt:null,lastSeenAt:null,url:'',parent:null,memberships:[],fields:[],anomalies:[],ownership:{fieldGid:'1208878911420813',optionGid:'1214725811552235',projectGid:'1208922858503175'},...patch});
describe('Asana local catalog view model',()=>{
 it('keeps status, progress and native completion independent and raw strings intact',()=>{
  const tasks=[task('1'),task('2',{completed:true}),task('3',{status:{gid:'other',name:'Other'},progress:{gid:'x',name:'In Progress'}})];
  expect(queryTasks(tasks,{...defaultQuery,status:'s',completion:'incomplete',progress:'p'}).matching).toBe(1);
  expect(rawOption(tasks[0].progress)).toBe('Done ');
  expect(taskTitle(task('4',{name:''}))).toBe('Untitled task');
  expect(taskTitle(task('5',{name:'5'}))).toBe('5');
  expect(taskTitle(task('6',{name:'  '}))).toBe('Untitled task');
 });
 it('deduplicates by gid before grouping and counts, retains unknown and unset, and pages beyond 100',()=>{
  const tasks=Array.from({length:121},(_,i)=>task(String(i).padStart(3,'0')));
  tasks.push(task('000'),task('u',{status:{gid:null,name:null}}),task('x',{status:{gid:'unknown',name:null}}));
  const view=queryTasks(tasks,{...defaultQuery,page:3});
  expect([view.total,view.matching,view.tasks.length,view.pages]).toEqual([123,123,23,3]);
  expect(statusGroups(tasks).reduce((n,g)=>n+g.count,0)).toBe(123);
  expect(statusGroups(tasks).find(g=>g.key==='unset')?.count).toBe(1);
  expect(statusGroups(tasks).find(g=>g.key==='unknown')?.label).toBe('Unknown (unknown)');
  expect(queryTasks(tasks,{...defaultQuery,page:99}).page).toBe(3);
 });
 it('searches text and GIDs, intersects role and section and sorts ties deterministically',()=>{
  const tasks=[task('b',{name:'Same',notes:'Needle'}),task('a',{name:'Same',notes:'Needle',memberships:[{projectGid:'proj',projectName:'P',sectionGid:'sec',sectionName:'S'}]}),task('c',{name:'Same',role:'FE'})];
  expect(queryTasks(tasks,{...defaultQuery,query:'needle'}).tasks.map(t=>t.gid)).toEqual(['a','b']);
  expect(queryTasks(tasks,{...defaultQuery,query:'a',role:'BE',section:'sec'}).matching).toBe(1);
  expect(queryTasks(tasks,{...defaultQuery,query:'c'}).tasks.map(t=>t.gid)).toEqual(['c']);
 });
 it('preserves civil due dates and interprets dueAt in the display timezone; overdue excludes completed',()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-25T19:00:00Z'));
  try {
  const tasks=[task('a',{dueOn:'2026-10-25'}),task('b',{dueAt:'2026-10-25T20:00:00Z'}),task('c',{dueOn:'2026-10-24',completed:true}),task('d',{dueOn:'not-date'})];
  expect(civilDue(tasks[0],'America/Los_Angeles')).toBe('2026-10-25');
  expect(civilDue(tasks[1],'Asia/Jakarta')).toBe('2026-10-26');
  expect(civilDue(tasks[3],'UTC')).toBe(null);
  expect(queryTasks(tasks,{...defaultQuery,due:'overdue'},'Asia/Jakarta','2026-10-26').tasks.map(t=>t.gid)).toEqual(['a']);
  expect(queryTasks(tasks,{...defaultQuery,due:'today'},'Asia/Jakarta','2026-10-26').tasks.map(t=>t.gid)).toEqual(['b']);
  expect(queryTasks(tasks,{...defaultQuery,sort:'due'},'Asia/Jakarta','2026-10-26').tasks.map(t=>t.gid)).toEqual(['c','a','b','d']);
  } finally {vi.useRealTimers();}
 });
 it('marks elapsed same-day timestamps overdue without expiring future timestamps or today civil dates',()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-26T10:00:00Z'));
  try {
   const tasks=[task('past',{dueAt:'2026-10-26T09:59:59Z'}),task('future',{dueAt:'2026-10-26T10:00:01Z'}),task('today',{dueOn:'2026-10-26'}),task('done',{dueAt:'2026-10-26T09:00:00Z',completed:true})];
   for(const zone of ['UTC','Asia/Jakarta','America/Los_Angeles'])expect(queryTasks(tasks,{...defaultQuery,due:'overdue'},zone).tasks.map(t=>t.gid)).toEqual(['past']);
  } finally {vi.useRealTimers();}
 });
 it('renders cache-only navigation, filters, counts, task titles and honest unavailable detail copy',async()=>{
  const {createElement}=await import('react');const {renderToStaticMarkup}=await import('react-dom/server');
  const {AsanaPanel,AsanaNav}=await import('../src/renderer/asana/AsanaPanel');
  const state={snapshot:{id:'synthetic',source:'catalog' as const,retrievedAt:'2026-10-26T00:00:00Z',sourceUpdatedAt:null,tasks:[task('1')],statusOptions:[],coverage:'catalog_only' as const},phase:'ready' as const,lastAttemptAt:null,lastError:null,preferences:{pinned:[],focusGid:null,savedViews:[]}};
  const nav=renderToStaticMarkup(createElement(AsanaNav,{state,selectedStatus:'all',onSelect:()=>{}}));
  expect(nav).toContain('HERNANDA MSS');expect(nav).toContain('asana-nav-all');expect(nav).toContain('asana-status-s');
  const html=renderToStaticMarkup(createElement(AsanaPanel,{state,status:'all',onStatus:()=>{},timezone:'UTC',onNotify:()=>{}}));
  for(const id of ['asana-search','asana-list','asana-row-1','asana-title-1','asana-count','asana-reload','asana-export','asana-progress','asana-completion','asana-role','asana-due','asana-section','asana-sort','asana-next','asana-board-toggle'])expect(html).toContain(`data-testid="${id}"`);
  expect(html).toContain('Reload local catalog');expect(html).toContain('Total 1');expect(html).toContain('Matching 1');expect(html).toContain('Showing 1');
  expect(html).not.toContain('Sync live');expect(html).toContain('Select a task');
  expect(html).toContain('<h1>Asana Tasks</h1>');
  // The host <main> already uses asana-main; inner scroll/layout must not match it.
  expect(html).toContain('<div class="asana-content">');
  expect(html).not.toContain('class="asana-main"');
 });
});
