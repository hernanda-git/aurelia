import { assessCompletion } from '../main/completion-policy';
import { validateSnapshot } from '../shared/domain';

const fields = ['Row', 'TaskNo', 'TglInput', 'Pic', 'Jabatan', 'DeptName', 'TaskName', 'GoalTask', 'AsalTask', 'Bobot', 'Target', 'Duedate', 'Status', 'TglApproval', 'TglSelesai', 'Lampiran'] as const;
const denial = { authorizedToCommit: false as const, reasonCodes: ['AGENT_ENROLLMENT_UNVERIFIED'], mode: 'assessment-only' as const, sourceVerification: 'not_performed' as const };

/** An immutable, explicitly supplied cache generation. No filesystem or portal access. */
export function createAssessmentWorkspace(value: unknown, clock: () => number = Date.now) {
  const snapshot = validateSnapshot(value);
  const records = snapshot.sourceRows
    ? snapshot.sourceRows.map(rawCells => ({ task: Object.fromEntries(fields.map((field, i) => [field, rawCells[i]])) as Record<string, string>, rawCells }))
    : snapshot.tasks.map(task => ({ task: Object.fromEntries(fields.map(field => [field, task[field] ?? ''])) as Record<string, string>, rawCells: undefined }));
  function metadata() {
    const ageMs = clock() - Date.parse(snapshot.retrievedAt);
    return { id: snapshot.id, source: snapshot.source, retrievedAt: snapshot.retrievedAt, ageMs,
      stale: ageMs < 0 || ageMs > 300000, staleAfterMs: 300000, rawRowsAvailable: snapshot.sourceRows !== undefined,
      scopeCoverage: snapshot.sourceRows ? 'all_captured_rows' : 'partial_active_tasks_only',
      totalScanned: snapshot.totalScanned, availableRows: records.length, scope: { ...snapshot.scope },
      trust: 'unverified_local_cache', liveVerified: false };
  }
  return {
    readiness() { return { ...denial, assessmentReady: true, commitReady: false,
      snapshot: metadata(), sourcePath: { option: '--snapshot', required: true, default: null,
        example: '<application-workspace>/snapshots/<generation>/snapshot.json', disclosed: false },
      limitations: ['No enrollment demonstrated', 'No original source evidence verified', 'No live reads, locks, writes, or uploads', 'Eligibility is hypothetical; all supplied facts and approvals are client assertions'] }; },
    list(args: { offset?: number; limit?: number; status?: string }) {
      const matched = records.filter(record => args.status === undefined || record.task.Status === args.status);
      const offset = args.offset ?? 0, limit = args.limit ?? 25;
      const candidates = matched.slice(offset, offset + limit).map(({ task }) => ({ TaskNo: task.TaskNo, TaskName: task.TaskName, Status: task.Status }));
      return { ...denial, snapshot: metadata(), candidates, total: matched.length, offset, limit, hasMore: offset + candidates.length < matched.length };
    },
    get(taskNo: string) {
      const record = records.find(record => record.task.TaskNo === taskNo);
      if (!record) throw new Error('TASK_NOT_IN_SNAPSHOT');
      return { ...denial, snapshot: metadata(), task: { ...record.task }, rawCells: record.rawCells ? [...record.rawCells] : null,
        completionVerification: 'not_performed', historyAvailable: snapshot.tasks.some(task => task.TaskNo === taskNo) };
    },
  };
}

/** Hypothetical deterministic policy evaluation; input claims are never authenticated here. */
export function assessAgentCompletion(input: unknown) {
  const decision = assessCompletion(input);
  return {
    ...decision,
    authorizedToCommit: false as const,
    reasonCodes: [...decision.reasonCodes, 'AGENT_ENROLLMENT_UNVERIFIED'],
    mode: 'assessment-only' as const,
    inputTrust: 'client_assertions' as const,
    sourceVerification: 'not_performed' as const,
    policyDecisionBasis: 'hypothetical_client_assertions' as const,
  };
}
