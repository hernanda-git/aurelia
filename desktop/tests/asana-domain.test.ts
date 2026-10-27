import { describe, expect, it } from 'vitest';
import { normalizeAsanaTask, ASANA_SCOPE, validateAsanaSnapshot } from '../src/shared/asana-domain';
export function rawTask(gid = '100') { return { gid, name: 'FE owned', notes: 'private owned notes', completed: true, assignee: null, workspace: { gid: '1206737432461724' }, memberships: [{ project: { gid: '999', name: 'Other' }, section: null }, { project: { gid: '1208922858503175', name: 'MSS' }, section: { gid: '45', name: 'Sprint' } }], custom_fields: [{ gid: '1208878911420813', name: 'IT PIC', enum_value: { gid: '1214725811552235', name: 'HERNANDA MSS' } }, { gid: '1208415672865789', name: 'Status', enum_value: { gid: '22', name: 'Ready to QA' } }, { gid: '1208878509891762', name: 'Task Progress', enum_value: { gid: '23', name: 'Done ' } }], due_on: '2026-10-26', parent: { gid: '78', name: 'Parent', notes: 'FOREIGN NOTES' } }; }
describe('exact personal raw ownership', () => {
  it('owns null-assignee FE without interpreting status, completion, progress, dates or first membership', () => {
    const task = normalizeAsanaTask(rawTask(), '2026-10-25T00:00:00Z')!;
    expect(task.ownership).toEqual({ fieldGid: ASANA_SCOPE.ownerField, optionGid: ASANA_SCOPE.ownerOption, projectGid: ASANA_SCOPE.project });
    expect(task.memberships).toHaveLength(2); expect(task.status.name).toBe('Ready to QA'); expect(task.progress.name).toBe('Done '); expect(task.completed).toBe(true); expect(task.dueOn).toBe('2026-10-26'); expect(task.lastSeenAt).toBe('2026-10-25T00:00:00Z');
    expect(task.parent).toEqual({ gid: '78', name: 'Parent' }); expect(JSON.stringify(task)).not.toContain('FOREIGN NOTES');
  });
  it('never infers ownership from BE name or shared assignee and rejects missing PIC', () => {
    const raw = rawTask(); raw.name = 'BE shared'; raw.custom_fields[0].enum_value.gid = '555'; expect(normalizeAsanaTask(raw)).toBeNull(); raw.custom_fields.shift(); expect(normalizeAsanaTask(raw)).toBeNull();
  });
  it('fails closed for ambiguous owner, numeric GID, malformed owned fields and wrong workspace', () => {
    const ambiguous = rawTask(); ambiguous.custom_fields.push(ambiguous.custom_fields[0]); expect(() => normalizeAsanaTask(ambiguous)).toThrow();
    for (const patch of [{ gid: 100 }, { completed: 'false' }, { memberships: 'wrong' }, { workspace: { gid: '1' } }, { due_on: '2026-02-30' }]) expect(() => normalizeAsanaTask({ ...rawTask(), ...patch })).toThrow();
  });
  it('retains owned unnamed records and never accepts forged persisted ownership or duplicate GIDs', () => {
    const task = normalizeAsanaTask({ ...rawTask(), name: '' })!; expect(task.anomalies).toContain('untitled');
    const snapshot = { id: 'snapshot', source: 'catalog', retrievedAt: '2026-10-26T00:00:00Z', sourceUpdatedAt: null, tasks: [task], statusOptions: [], coverage: 'catalog_only' };
    expect(validateAsanaSnapshot(snapshot).tasks).toHaveLength(1);
    expect(() => validateAsanaSnapshot({ ...snapshot, tasks: [task, task] })).toThrow();
    expect(() => validateAsanaSnapshot({ ...snapshot, tasks: [{ ...task, ownership: { ...task.ownership, optionGid: '999' } }] })).toThrow();
  });
});
