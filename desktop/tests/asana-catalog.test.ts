import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { readAsanaCatalog } from '../src/main/asana-catalog';
const dirs: string[] = [];
export function catalogFixture() {
  const root = process.env.HERMES_TEST_TMPDIR ?? join(process.env.LOCALAPPDATA ?? tmpdir(), 'hermes', 'cache', 'scratch'); fs.mkdirSync(root, { recursive: true });
  const dir = fs.mkdtempSync(join(root, 'asana-catalog-')); dirs.push(dir); const path = join(dir, 'catalog.db'); const db = new DatabaseSync(path);
  db.exec('PRAGMA user_version=2; CREATE TABLE tasks(connector TEXT,id TEXT,raw_json TEXT,last_seen_at TEXT,deleted INTEGER); CREATE TABLE projects(connector TEXT,id TEXT,workspace TEXT,raw_json TEXT); CREATE TABLE sync_runs(connector TEXT,status TEXT,finished_at TEXT);');
  db.prepare('INSERT INTO projects VALUES(?,?,?,?)').run('asana','1208922858503175','1206737432461724','{}');
  const raw = { gid:'100', name:'FE example', completed:false, notes:'OWNED', memberships:[{project:{gid:'1208922858503175',name:'MSS'},section:null}], custom_fields:[{gid:'1208878911420813',name:'IT PIC',enum_value:{gid:'1214725811552235',name:'HERNANDA MSS'}},{gid:'1208415672865789',name:'Status',enum_value:{gid:'22',name:'Raw '},enum_options:[{gid:'21',name:'Empty',enabled:false},{gid:'22',name:'Raw ',enabled:true}]}] };
  db.prepare('INSERT INTO tasks VALUES(?,?,?,?,?)').run('asana','100',JSON.stringify(raw),'2026-10-21T00:00:00Z',0); db.close(); return {path, raw};
}
afterEach(() => { for(const d of dirs.splice(0)) fs.rmSync(d,{recursive:true,force:true}); });
describe('read-only schema 2 personal catalog', () => {
  it.skipIf(!process.env.ASANA_CATALOG_PROBE)('explicit opt-in real cached catalog probe (no network)', () => {
    const path = process.env.ASANA_CATALOG_PROBE!; const hash=()=>createHash('sha256').update(fs.readFileSync(path)).digest('hex'); const before = hash();
    const snapshot = readAsanaCatalog(path);
    console.log(JSON.stringify({ runtime: process.version, owned: snapshot.tasks.length, complete: snapshot.tasks.filter(t => t.completed).length, incomplete: snapshot.tasks.filter(t => !t.completed).length, placeholders: snapshot.tasks.filter(t => t.anomalies.includes('untitled')).length, sourceUpdatedAt: snapshot.sourceUpdatedAt, statusOptions: snapshot.statusOptions }));
    expect(hash()).toBe(before);
  });
  it('reads only owned rows, metadata order/raw labels and source row freshness without changing bytes', () => {
    const {path,raw} = catalogFixture(); const db = new DatabaseSync(path); db.prepare('INSERT INTO tasks VALUES(?,?,?,?,?)').run('asana','200',JSON.stringify({...raw,gid:'200',notes:'FOREIGN',custom_fields:[{gid:'1208878911420813',enum_value:{gid:'999'}}]}),'2026-10-22T00:00:00Z',0); db.close();
    const bytes = fs.readFileSync(path); const result = readAsanaCatalog(path,'2026-10-26T00:00:00Z');
    expect(result.tasks.map(t=>t.gid)).toEqual(['100']); expect(result.tasks[0].lastSeenAt).toBe('2026-10-21T00:00:00Z'); expect(result.statusOptions.map(o=>o.name)).toEqual(['Empty','Raw ']); expect(result.source).toBe('catalog'); expect(result.coverage).toBe('catalog_only'); expect(JSON.stringify(result)).not.toContain('FOREIGN'); expect(fs.readFileSync(path)).toEqual(bytes);
  });
  it('sanitizes missing DB errors and never creates the file', () => { const {path}=catalogFixture(); const absent=join(path,'secret-token.db'); expect(()=>readAsanaCatalog(absent)).toThrow('Asana catalog could not be read.'); expect(fs.existsSync(absent)).toBe(false); });
  it.each(['malformed','duplicate','schema','numeric','ambiguous'])('fails publication closed for %s',kind=>{
    const {path,raw}=catalogFixture(); const db=new DatabaseSync(path);
    if(kind==='malformed') db.exec("UPDATE tasks SET raw_json='{private-secret'");
    if(kind==='duplicate') db.exec('INSERT INTO tasks SELECT * FROM tasks');
    if(kind==='schema') db.exec('PRAGMA user_version=3');
    if(kind==='numeric') db.prepare('UPDATE tasks SET raw_json=?').run(JSON.stringify({...raw,gid:100}));
    if(kind==='ambiguous') db.prepare('UPDATE tasks SET raw_json=?').run(JSON.stringify({...raw,custom_fields:[...raw.custom_fields,raw.custom_fields[0]]}));
    db.close(); expect(()=>readAsanaCatalog(path)).toThrow('Asana catalog could not be read.');
  });
});
