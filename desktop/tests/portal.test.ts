import { describe, it, expect } from 'vitest';
import { decodeGrid, validateHistoryIdentity, safePortalUrl, encodeExportCsv, nextPager } from '../src/main/portal-data';

const headers=['','TaskNo','TglInput','Pic','Jabatan','DeptName','TaskName','GoalTask','AsalTask','Bobot','Target','Duedate','Status','TglApproval','TglSelesai','Lampiran'];
const cells=['1','M03938/Task. IT/1026','14-Okt-2026','MUHAMMAD HERNANDA','Programmer Back End','ITMSS','Original title','Original goal','Lain-Lain','4','T1','30-Okt-2026','Approval','15-Okt-2026','',''];
const grid=(rows=[{cells,infoId:'MainContent_lst_info_0'}])=>({headers,rows,empty:false,pagers:[]});
describe('portal schema and completeness boundary',()=>{
  it('maps all own cells preserving exact task identity and source text',()=>{const result=decodeGrid(grid());expect(result.rows[0].task.TaskNo).toBe(cells[1]);expect(result.rows[0].task.TaskName).toBe('Original title');expect(result.rows[0].infoId).toBe('MainContent_lst_info_0');});
  it('retains source rows for every status as independent exact cell arrays',()=>{
    const solved=cells.map((value,index)=>index===1?'M-SOLVED/Task. IT/1026':index===12?'Solved':value);
    const input=grid([{cells:[...cells],infoId:'MainContent_lst_info_0'},{cells:solved,infoId:''}]);
    const result=decodeGrid(input);
    expect(result.sourceRows).toEqual([cells,solved]);
    input.rows[0].cells[6]='Changed after decoding';
    expect(result.sourceRows[0][6]).toBe('Original title');
  });
  it('rejects schema drift',()=>expect(()=>decodeGrid({...grid(),headers:headers.map(h=>h==='TaskNo'?'Ticket':h)})).toThrow());
  it('rejects duplicate task identities rather than silently deduplicating',()=>expect(()=>decodeGrid(grid([{cells,infoId:'a'},{cells,infoId:'b'}]))).toThrow());
  it('rejects wrong PIC',()=>expect(()=>decodeGrid(grid([{cells:cells.map((v,i)=>i===3?'OTHER PIC':v),infoId:'x'}]))).toThrow());
  it('rejects malformed row widths',()=>expect(()=>decodeGrid(grid([{cells:cells.slice(0,15),infoId:'x'}]))).toThrow());
  it('accepts explicit valid empty grid, not unexplained missing rows',()=>{expect(decodeGrid({...grid([]),empty:true}).rows).toHaveLength(0);expect(()=>decodeGrid(grid([]))).toThrow();});
  it('requires info control for selected status but not Solved',()=>{expect(()=>decodeGrid(grid([{cells,infoId:''}]))).toThrow();expect(decodeGrid(grid([{cells:cells.map((v,i)=>i===12?'Solved':v),infoId:''}])).rows).toHaveLength(1);});
});
describe('pagination completeness',()=>{
 const link=(text:string,arg:string)=>({text,href:`javascript:__doPostBack('ctl00$MainContent$grid','${arg}')`,disabled:false});
 it('chooses a verified Next action without evaluating arbitrary href',()=>expect(nextPager([link('Next','Page$Next')],1)).toMatchObject({argument:'Page$Next'}));
 it('chooses the lowest subsequent numeric page',()=>expect(nextPager([link('1','Page$1'),link('3','Page$3'),link('2','Page$2')],1)).toMatchObject({argument:'Page$2'}));
 it('does not silently stop when Last proves an unhandled forward range',()=>expect(()=>nextPager([link('Last','Page$Last')],1)).toThrow('PAGINATION_UNSUPPORTED'));
 it('rejects an unrecognized active pager',()=>expect(()=>nextPager([{text:'Next',href:'javascript:evil()',disabled:false}],1)).toThrow('PAGINATION_UNSUPPORTED'));
});

describe('history and URL boundaries',()=>{
  it('matches full exact task number, not substring or another task',()=>{expect(validateHistoryIdentity(cells[1],`TaskNo\t: ${cells[1]}\nGoalTask: x`)).toBe(true);expect(validateHistoryIdentity(cells[1],`TaskNo: ${cells[1]}X\n`)).toBe(false);expect(validateHistoryIdentity(cells[1],`TaskNo: M999/Task. IT/1026\n${cells[1]}`)).toBe(false);});
  it('allows only HTTPS PES origin for portal navigation',()=>{expect(safePortalUrl('https://pes.grcboard.com/Default.aspx')).toBe(true);for(const u of ['http://pes.grcboard.com/','https://pes.grcboard.com.attacker.test/','javascript:alert(1)','https://other.test/','https://u:p@pes.grcboard.com/'])expect(safePortalUrl(u)).toBe(false);});
  it('exports quoted multiline records with formula-prefix protection',()=>{const csv=encodeExportCsv([{...Object.fromEntries(headers.map((k,i)=>[k,cells[i]])),TaskName:' =HYPERLINK("evil")',history:{text:'line 1\nline 2'}}] as any);expect(csv).toContain("' =HYPERLINK");expect(csv).toContain('line 1\nline 2');expect(csv.charCodeAt(0)).toBe(0xfeff);});
});
