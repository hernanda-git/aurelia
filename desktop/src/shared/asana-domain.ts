import { z } from 'zod';
import type { AsanaTask, AsanaSnapshot, AsanaPreferences } from './asana-types';
export const ASANA_SCOPE = Object.freeze({ workspace: '1206737432461724', project: '1208922858503175', ownerField: '1208878911420813', ownerOption: '1214725811552235', statusField: '1208415672865789', progressField: '1208878509891762' });
const gid = z.string().regex(/^[0-9]{1,30}$/);
const text = z.string().max(200000);
const label = z.string().max(2000);
export function civilDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`); return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
const civil = z.string().refine(civilDate);
const instant = z.string().max(100).refine(v => /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(v) && civilDate(v.slice(0, 10)) && Number.isFinite(Date.parse(v)));
const option = z.object({ gid: gid.nullable(), name: label.nullable() }).strict();
const membership = z.object({ projectGid: gid, projectName: label, sectionGid: gid.nullable(), sectionName: label.nullable() }).strict();
const taskSchema = z.object({ gid, name: label, notes: text, goal: text, role: label, completed: z.boolean(), ownership: z.object({ fieldGid: z.literal(ASANA_SCOPE.ownerField), optionGid: z.literal(ASANA_SCOPE.ownerOption), projectGid: z.literal(ASANA_SCOPE.project) }).strict(), status: option, progress: option, dueOn: civil.nullable(), dueAt: instant.nullable(), itStartDate: civil.nullable(), itEndDate: civil.nullable(), modifiedAt: instant.nullable(), lastSeenAt: instant.nullable(), url: z.string().max(2000), parent: z.object({ gid, name: label.nullable() }).strict().nullable(), memberships: z.array(membership).max(100), fields: z.array(z.object({ gid, name: label, displayValue: text.nullable() }).strict()).max(300), anomalies: z.array(label).max(100) }).strict().refine(t => t.memberships.some(m => m.projectGid === ASANA_SCOPE.project) && t.url === asanaTaskUrl(t.gid));
export function asanaTaskUrl(id: string): string { return `https://app.asana.com/0/${ASANA_SCOPE.project}/${gid.parse(id)}`; }
export function validateAsanaSnapshot(value: unknown): AsanaSnapshot {
  try {
    const result = z.object({ id: z.string().min(1).max(100), source: z.literal('catalog'), retrievedAt: instant, sourceUpdatedAt: instant.nullable(), tasks: z.array(taskSchema).max(10000), statusOptions: z.array(z.object({ gid, name: label, enabled: z.boolean() }).strict()).max(500), coverage: z.literal('catalog_only') }).strict().parse(value);
    if (new Set(result.tasks.map(t => t.gid)).size !== result.tasks.length || new Set(result.statusOptions.map(o => o.gid)).size !== result.statusOptions.length) throw new Error();
    return result;
  } catch { throw new Error('Invalid personal Asana snapshot.'); }
}
export function validateAsanaPreferences(value: unknown): AsanaPreferences {
  try { const p = z.object({ pinned: z.array(gid).max(1000), focusGid: gid.nullable(), savedViews: z.array(z.object({ name: z.string().min(1).max(100), query: z.string().max(2000), status: label, completion: z.enum(['all', 'complete', 'completed', 'incomplete']), progress: label, role: label, sort: z.enum(['name', 'due', 'updated', 'modified', 'status', 'gid']) }).strict()).max(50) }).strict().parse(value);
    if (new Set(p.pinned).size !== p.pinned.length || new Set(p.savedViews.map(v => v.name)).size !== p.savedViews.length) throw new Error(); return p;
  } catch { throw new Error('Invalid Asana preferences.'); }
}
function record(value: unknown): any { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value; }
export function normalizeAsanaTask(value: unknown, lastSeenAt: string | null = null): AsanaTask | null {
  try {
    const raw = record(value);
    if (!Array.isArray(raw.custom_fields) || !Array.isArray(raw.memberships)) throw new Error();
    const owners = raw.custom_fields.filter((f: any) => record(f).gid === ASANA_SCOPE.ownerField);
    if (owners.length > 1) throw new Error();
    if (!owners.length || owners[0].enum_value?.gid !== ASANA_SCOPE.ownerOption) return null;
    if (raw.workspace != null && record(raw.workspace).gid !== ASANA_SCOPE.workspace) throw new Error();
    const memberships = raw.memberships.map((m: any) => ({ projectGid: gid.parse(record(record(m).project).gid), projectName: label.parse(m.project.name ?? ''), sectionGid: m.section == null ? null : gid.parse(record(m.section).gid), sectionName: m.section == null ? null : label.nullable().parse(m.section.name ?? null) }));
    if (!memberships.some((m: any) => m.projectGid === ASANA_SCOPE.project)) return null;
    const fields = raw.custom_fields.map((f: any) => ({ gid: gid.parse(record(f).gid), name: label.parse(f.name ?? ''), displayValue: text.nullable().parse(f.display_value ?? f.enum_value?.name ?? f.text_value ?? null) }));
    if (new Set(fields.map((f: any) => f.gid)).size !== fields.length) throw new Error();
    const field = (id: string) => raw.custom_fields.find((f: any) => f.gid === id);
    const opt = (id: string) => { const f = field(id); return f?.enum_value == null ? { gid: null, name: null } : { gid: f.enum_value.gid, name: f.enum_value.name ?? null }; };
    const parseDate = (id: string, name: string): string | null => {
      const f = (raw.custom_fields as Record<string, unknown>[]).find(cf => cf.gid === id || cf.name === name);
      if (!f) return null;
      const rawDate = f.display_value ?? (typeof f.date_value === 'object' && f.date_value !== null ? (f.date_value as Record<string, unknown>).date : f.date_value) ?? f.text_value;
      if (typeof rawDate !== 'string') return null;
      const m = /^(\d{4}-\d{2}-\d{2})/.exec(rawDate);
      return m && civilDate(m[1]) ? m[1] : null;
    };
    const name = label.parse(raw.name); const id = gid.parse(raw.gid);
    const result = taskSchema.parse({ gid: id, name, notes: raw.notes ?? '', goal: field('1210770007256855')?.display_value ?? field('1210770007256855')?.text_value ?? '', role: /^(BE|FE|QA|SA)\b/i.exec(name)?.[1].toUpperCase() ?? '', completed: raw.completed, ownership: { fieldGid: ASANA_SCOPE.ownerField, optionGid: ASANA_SCOPE.ownerOption, projectGid: ASANA_SCOPE.project }, status: opt(ASANA_SCOPE.statusField), progress: opt(ASANA_SCOPE.progressField), dueOn: raw.due_on ?? null, dueAt: raw.due_at ?? null, itStartDate: parseDate('1208878900985995', 'IT Start Date'), itEndDate: parseDate('1208878923161869', 'IT End Date'), modifiedAt: raw.modified_at ?? null, lastSeenAt, url: asanaTaskUrl(id), parent: raw.parent == null ? null : { gid: raw.parent.gid, name: raw.parent.name ?? null }, memberships, fields, anomalies: !name.trim() || name === id ? ['untitled'] : [] });
    return result;
  } catch { throw new Error('Invalid owned Asana task.'); }
}
