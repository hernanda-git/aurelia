import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const read=(file:string)=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
describe('Asana provider wiring regressions',()=>{
 it('exposes a separate finite read-only API, not generic IPC or remote mutations',()=>{const source=read('src/main/preload.ts');expect(source).toContain("exposeInMainWorld('asana'");for(const channel of ['asana:state','asana:reload-catalog','asana:preferences','asana:export'])expect(source).toContain(channel);expect(source).not.toMatch(/asana:(?:complete|update|upload|comment|apply)/);});
 it('registers guarded independent catalog handlers and never a completion executor',()=>{const source=read('src/main/main.ts');expect(source).toContain("register('asana:state'");expect(source).toContain("register('asana:reload-catalog'");expect(source).toContain('AsanaStore');expect(source).not.toContain('new CompletionEngine');expect(source).not.toContain('new PortalCompletionDriver');});
 it('does not capture every Ctrl+R in main to force PES sync',()=>{expect(read('src/main/main.ts')).not.toMatch(/before-input-event[^\n]+sync\.sync/);});
 it('has separate provider route, nav and task panel',()=>{const source=read('src/renderer/App.tsx');expect(source).toContain("'asana'");expect(source).toContain('AsanaNav');expect(source).toContain('AsanaPanel');expect(source).toContain('asana-search');});
});
