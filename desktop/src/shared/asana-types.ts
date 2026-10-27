export type AsanaOption = { gid: string | null; name: string | null };
export type AsanaMembership = { projectGid: string; projectName: string; sectionGid: string | null; sectionName: string | null };
export type AsanaTask = {
  gid: string; name: string; notes: string; goal: string; role: string; completed: boolean;
  ownership: { fieldGid: string; optionGid: string; projectGid: string };
  status: AsanaOption; progress: AsanaOption; dueOn: string | null; dueAt: string | null; itStartDate: string | null; itEndDate: string | null;
  modifiedAt: string | null; lastSeenAt: string | null; url: string; parent: { gid: string; name: string | null } | null;
  memberships: AsanaMembership[]; fields: { gid: string; name: string; displayValue: string | null }[]; anomalies: string[];
};
export type AsanaSnapshot = { id: string; source: 'catalog'; retrievedAt: string; sourceUpdatedAt: string | null; tasks: AsanaTask[]; statusOptions: { gid: string; name: string; enabled: boolean }[]; coverage: 'catalog_only' };
export type AsanaPreferences = { pinned: string[]; focusGid: string | null; savedViews: { name: string; query: string; status: string; completion: string; progress: string; role: string; sort: string }[] };
export type AsanaState = { snapshot: AsanaSnapshot | null; phase: 'idle' | 'loading' | 'ready' | 'failed'; lastAttemptAt: string | null; lastError: string | null; preferences: AsanaPreferences };
export type AsanaAPI = { getState(): Promise<AsanaState>; reloadCatalog(): Promise<void>; cancelReload(): Promise<void>; setPreferences(patch: Partial<AsanaPreferences>): Promise<void>; openTask(gid: string): Promise<void>; copyTask(gid: string): Promise<void>; exportTasks(format: 'json' | 'csv', gids: string[]): Promise<boolean>; onState(listener: (state: AsanaState) => void): () => void };
