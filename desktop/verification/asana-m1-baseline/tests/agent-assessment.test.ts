import { describe, expect, it } from 'vitest';
import { assessAgentCompletion, createAssessmentWorkspace } from '../src/agent/assessment';
import { assessCompletion } from '../src/main/completion-policy';
import type { CompletionAssessmentInput } from '../src/shared/completion-types';

function claimedEligible(): CompletionAssessmentInput {
  const now = '2026-10-26T06:00:00Z';
  const identity = { listTaskNo: 'TASK-1', detailTaskNo: 'TASK-1', pic: '3220', department: '32', originUrl: 'https://example.invalid/task/1' };
  const date = { iso: '2026-10-23', raw: '23-Okt-2026' };
  const provenance = { kind: 'task_system' as const, uri: identity.originUrl, taskUrl: identity.originUrl, revision: '1', capturedAt: now };
  return { schemaVersion: 1, now,
    policy: { revision: 'completion-policy-v1', approvedBy: 'claimed approval', approvedAt: now, enabled: true, finishDatePolicy: 'target_date', timezone: 'Asia/Jakarta', maxLiveAgeMs: 60000, maxPreflightAgeMs: 10000, maxSourceAgeMs: 60000, maxEvidenceAgeMs: 60000, maxAttachmentBytes: 5000, allowedMimeTypes: ['image/png'], taskRules: [{ taskType: 'backend', goalScope: 'be_development', requiredChecks: ['tests'], minAuthoritativeSources: 1, allowedSourceKinds: ['task_system'], allowReadyForQa: true }] },
    proposal: { proposalId: '1', policyRevision: 'completion-policy-v1', identity, taskType: 'backend', goalScope: 'be_development', rawGoal: 'BE done', sourceTaskUrl: identity.originUrl, targetDate: date, proposedPesFinishDate: date, observedCompletedAt: now, association: { identity, verifiedAt: now, provenance }, sourceFacts: [{ sourceTaskUrl: identity.originUrl, goalScope: 'be_development', checks: ['tests'], state: 'completed', observedAt: now, provenance }], evidence: { identity, fileName: 'e.png', mimeType: 'image/png', byteLength: 10, sha256: 'a'.repeat(64), capturedAt: now, provenance, kind: 'original_screenshot', secretsReviewed: true } },
    live: { identity, taskType: 'backend', goalScope: 'be_development', rawGoal: 'BE done', sourceTaskUrl: identity.originUrl, targetDate: date, listStatus: 'Open', detailStatus: 'Open', updateEnabled: true, capturedAt: now, preflightAt: now, underLock: true, priorAttempt: 'none', unresolvedDiscrepancy: false } };
}


describe('read-only completion assessment', () => {
  it('exposes every raw status including Update Task without claiming live verification', () => {
    const snapshot = { id: 'isolated', source: 'imported', retrievedAt: '2026-10-20T06:00:00Z', scope: { from: '2026-10-01', to: '2026-10-31', pic: 'MUHAMMAD HERNANDA', department: 'IT' }, totalScanned: 1, tasks: [], sourceRows: [['1', 'TASK-UPDATE', '', 'MUHAMMAD HERNANDA', '', 'IT', 'Task', 'Goal', '', '', '', '', 'Update Task', '', '', '']] };
    const original = JSON.stringify(snapshot);
    const workspace = createAssessmentWorkspace(snapshot, () => Date.parse('2026-10-26T06:00:00Z'));
    const listed = workspace.list({});
    expect(listed.total).toBe(1);
    expect(listed.candidates[0].Status).toBe('Update Task');
    expect(workspace.get('TASK-UPDATE').rawCells).toEqual(snapshot.sourceRows[0]);
    expect(workspace.readiness()).toMatchObject({ mode: 'assessment-only', authorizedToCommit: false, sourceVerification: 'not_performed', snapshot: { source: 'imported', stale: true, scopeCoverage: 'all_captured_rows', rawRowsAvailable: true } });
    expect(JSON.stringify(snapshot)).toBe(original);
  });
  it('separates hypothetical eligibility from authorization even with claimed authoritative facts', () => {
    const input = claimedEligible();
    expect(assessCompletion(input).eligible).toBe(true);
    expect(assessAgentCompletion(input)).toMatchObject({ eligible: true, authorizedToCommit: false, sourceVerification: 'not_performed', inputTrust: 'client_assertions', reasonCodes: ['AGENT_ENROLLMENT_UNVERIFIED'] });
  });
  it('keeps authorization denied even when an assessment is invalid', () => {
    const result = assessAgentCompletion({});
    expect(result.eligible).toBe(false);
    expect(result.authorizedToCommit).toBe(false);
    expect(result.reasonCodes).toContain('AGENT_ENROLLMENT_UNVERIFIED');
    expect(result.reasonCodes).toContain('INVALID_INPUT');
    expect(result.sourceVerification).toBe('not_performed');
    expect(result.inputTrust).toBe('client_assertions');
  });
});
