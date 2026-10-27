export interface TaskHistory { text: string; tables?: string[][][] }
export interface Task {
  Row?: string; TaskNo: string; TglInput: string; Pic: string; Jabatan: string;
  DeptName: string; TaskName: string; GoalTask: string; AsalTask: string;
  Bobot: string; Target: string; Duedate: string; Status: string;
  TglApproval: string; TglSelesai: string; Lampiran: string; history: TaskHistory;
}
export interface Scope { from: string; to: string; pic: string; department: string }
export interface SnapshotDiff { added: number; changed: number; outOfScope: number; scopeChanged: boolean }
export interface Snapshot {
  id: string; source: 'live' | 'imported'; retrievedAt: string;
  scope: Scope; totalScanned: number; tasks: Task[]; diff?: SnapshotDiff;
  /** All captured grid rows, including non-active statuses; absent in legacy snapshots. */
  sourceRows?: string[][];
}
export interface Settings { theme: 'dark' | 'light' | 'system'; timezone: string; compact: boolean }
export interface TaskPreference { pinned: boolean }
export type ActivityLevel = 'info' | 'success' | 'warning' | 'error';
export interface Activity {
  id: string; at: string; level: ActivityLevel;
  category: 'sync' | 'connection' | 'local' | 'export' | 'system';
  message: string; runId?: string; stage?: string; detail?: string; durationMs?: number;
}
export type SyncPhase = 'idle' | 'connecting' | 'authenticating' | 'filtering' | 'reading' | 'details' | 'validating' | 'saving' | 'success' | 'cancelled' | 'failed';
export interface SyncState { phase: SyncPhase; message: string; runId?: string; completed?: number; total?: number }
export interface AgentWorkspaceInfo { path: string; lastWrittenAt: string | null; error: string | null; taskCount: number }
export interface AppState {
  schemaVersion: 1; snapshot: Snapshot | null; preferences: Record<string, TaskPreference>;
  focusTaskId: string | null; settings: Settings; activities: Activity[];
  lastAttemptAt: string | null; lastError: string | null;
  connection: 'unknown' | 'connected' | 'login-required'; sync: SyncState;
  /** Derived projection status; authoritative state remains in the existing user profile. */
  /** Derived read-only completion observations; never grants mutation authority. */
  completion?: import('./completion-observation').CompletionObservation;
  agentWorkspace?: AgentWorkspaceInfo;
}
export interface DesktopAPI {
  getState(): Promise<AppState>; sync(): Promise<void>; cancelSync(): Promise<void>;
  openConnection(): Promise<void>; togglePin(id: string): Promise<void>;
  setFocus(id: string | null): Promise<void>; updateSettings(settings: Partial<Settings>): Promise<void>;
  clearActivity(): Promise<void>; exportTasks(format: 'json' | 'csv', id?: string): Promise<boolean>;
  exportActivity(): Promise<boolean>; copyText(text: string): Promise<void>; openPes(): Promise<void>;
  openAgentWorkspace(taskId?: string): Promise<void>; copyTaskContext(taskId: string): Promise<void>;
  window(action: 'minimize' | 'maximize' | 'close'): Promise<void>;
  onState(listener: (state: AppState) => void): () => void;
}
declare global { interface Window { pes: DesktopAPI } }
