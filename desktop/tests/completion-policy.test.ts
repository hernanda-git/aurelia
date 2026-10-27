import { describe, it, expect } from 'vitest';
import { assessCompletion, isCompletionAssessmentInput } from '../src/main/completion-policy';
import type { CompletionAssessmentInput } from '../src/shared/completion-types';

function valid(): CompletionAssessmentInput {
  const now = '2026-10-26T13:00:00+07:00';
  const identity = { listTaskNo: 'M04001/Task. IT/1026', detailTaskNo: 'M04001/Task.IT/1026', pic: '3220', department: '32', originUrl: 'https://app.asana.com/task/123' };
  const date = { iso: '2026-10-23', raw: '23-Okt-2026' };
  const provenance = { kind: 'task_system' as const, uri: 'https://app.asana.com/task/123', taskUrl: identity.originUrl, revision: 'revision-1', capturedAt: now };
  return {
    schemaVersion: 1, now,
    policy: { revision: 'completion-policy-v1', approvedBy: 'standing-user-authorization', approvedAt: '2026-10-25T13:00:00+07:00', enabled: true,
      finishDatePolicy: 'target_date', timezone: 'Asia/Jakarta', maxLiveAgeMs: 60000, maxPreflightAgeMs: 10000,
      maxSourceAgeMs: 3600000, maxEvidenceAgeMs: 3600000, maxAttachmentBytes: 5000000, allowedMimeTypes: ['image/png'],
      taskRules: [{ taskType: 'backend', goalScope: 'be_development', requiredChecks: ['implementation', 'tests'], minAuthoritativeSources: 1, allowedSourceKinds: ['task_system', 'execution_report'], allowReadyForQa: true }] },
    proposal: { proposalId: 'proposal-1', policyRevision: 'completion-policy-v1', identity, taskType: 'backend', goalScope: 'be_development', rawGoal: 'BE completed inventory',
      sourceTaskUrl: identity.originUrl, targetDate: date, proposedPesFinishDate: date, observedCompletedAt: '2026-10-23T10:00:00+07:00',
      association: { identity: { ...identity }, verifiedAt: now, provenance },
      sourceFacts: [{ sourceTaskUrl: identity.originUrl, goalScope: 'be_development', checks: ['implementation', 'tests'], state: 'completed', observedAt: now, provenance }],
      evidence: { identity: { ...identity }, fileName: 'inventory.png', mimeType: 'image/png', byteLength: 1024, sha256: 'a'.repeat(64), capturedAt: now, provenance, kind: 'original_screenshot', secretsReviewed: true } },
    live: { identity: { ...identity }, taskType: 'backend', goalScope: 'be_development', rawGoal: 'BE completed inventory', sourceTaskUrl: identity.originUrl,
      targetDate: date, listStatus: 'Open', detailStatus: 'Open', updateEnabled: true, capturedAt: now, preflightAt: now, underLock: true, priorAttempt: 'none', unresolvedDiscrepancy: false },
  };
}

describe('deterministic completion eligibility (not mutation authorization)', () => {
  it('accepts only the observed approved T1 detail mapping without changing raw statuses', () => {
    const input=valid();input.live.listStatus='Approval';input.live.detailStatus='T1';
    Object.assign(input.live,{targetStatus:'Approved'});
    expect(assessCompletion(input).eligible).toBe(true);
    Object.assign(input.live,{targetStatus:'Update Task'});
    expect(assessCompletion(input).eligible).toBe(false);
  });
  it.each([
    ['sparse required acceptance checks', () => { const i = valid(); i.policy.taskRules[0].requiredChecks = new Array<string>(1); return i; }],
    ['sparse fact checks', () => { const i = valid(); i.proposal.sourceFacts[0].checks = new Array<string>(1); return i; }],
    ['sparse source facts', () => { const i = valid(); i.proposal.sourceFacts = new Array(1); return i; }],
    ['sparse policy rules', () => { const i = valid(); i.policy.taskRules = new Array(1); return i; }],
    ['null', () => null], ['array', () => []], ['missing input', () => ({})],
    ['bad schema', () => ({ ...valid(), schemaVersion: 2 })],
    ['invalid civil day', () => { const i = valid(); i.proposal.targetDate = { iso: '2026-02-30', raw: '30-Feb-2026' }; return i; }],
    ['raw date disagrees with ISO', () => { const i = valid(); i.proposal.proposedPesFinishDate = { iso: '2026-10-23', raw: '24-Okt-2026' }; return i; }],
    ['rolled-over timestamp hour', () => ({ ...valid(), now: '2026-10-26T24:00:00Z' })],
    ['nonpositive TTL', () => { const i = valid(); i.policy.maxLiveAgeMs = 0; return i; }],
    ['invalid timezone', () => { const i = valid(); i.policy.timezone = 'Mars/Olympus'; return i; }],
    ['missing policy approver', () => { const i = valid(); i.policy.approvedBy = ''; return i; }],
    ['missing source revision', () => { const i = valid(); i.proposal.sourceFacts[0].provenance = { ...i.proposal.sourceFacts[0].provenance, revision: '' }; return i; }],
    ['invalid evidence hash', () => { const i = valid(); i.proposal.evidence.sha256 = 'not-a-hash'; return i; }],
    ['boolean string', () => { const i = valid(); Object.assign(i.live, { updateEnabled: 'true' }); return i; }],
    ['coercible provenance enum', () => { const i = valid(); Object.assign(i.proposal.evidence.provenance, { kind: { toString: () => 'task_system' } }); return i; }],
    ['coercible priorAttempt enum', () => { const i = valid(); Object.assign(i.live, { priorAttempt: { toString: () => 'none' } }); return i; }],
  ] as const)('runtime-validates every boundary: %s', (_name, make) => {
    const input = make(); expect(isCompletionAssessmentInput(input)).toBe(false);
    expect(assessCompletion(input)).toEqual({ eligible: false, reasonCodes: ['INVALID_INPUT'], proposedPesFinishDate: null });
  });
  it.each([
    ['unapproved date policy', 'DATE_POLICY_NOT_APPROVED', (i: CompletionAssessmentInput) => { i.policy.finishDatePolicy = 'actual_date'; }],
    ['future target-date finish', 'FUTURE_FINISH_DATE', (i: CompletionAssessmentInput) => { const d = { iso: '2026-10-27', raw: '27-Okt-2026' }; i.proposal.targetDate = i.proposal.proposedPesFinishDate = i.live.targetDate = d; }],
    ['target changed in preflight', 'TARGET_DATE_CHANGED', (i: CompletionAssessmentInput) => { i.live.targetDate = { iso: '2026-10-24', raw: '24-Okt-2026' }; }],
    ['finish not target date', 'FINISH_DATE_MISMATCH', (i: CompletionAssessmentInput) => { i.proposal.proposedPesFinishDate = { iso: '2026-10-24', raw: '24-Okt-2026' }; }],
    ['future claimed completion instant', 'COMPLETION_TIME_INVALID', (i: CompletionAssessmentInput) => { i.proposal.observedCompletedAt = '2026-10-27T00:00:00Z'; }],
    ['unrelated attachment identity', 'EVIDENCE_INVALID', (i: CompletionAssessmentInput) => { i.proposal.evidence.identity.detailTaskNo += ' '; }],
    ['unrelated attachment provenance', 'EVIDENCE_INVALID', (i: CompletionAssessmentInput) => { i.proposal.evidence.provenance = { ...i.proposal.evidence.provenance, taskUrl: 'other-task' }; }],
    ['oversized attachment', 'EVIDENCE_INVALID', (i: CompletionAssessmentInput) => { i.proposal.evidence.byteLength = i.policy.maxAttachmentBytes + 1; }],
    ['disallowed MIME', 'EVIDENCE_INVALID', (i: CompletionAssessmentInput) => { i.proposal.evidence.mimeType = 'text/html'; }],
    ['unreviewed secrets', 'EVIDENCE_INVALID', (i: CompletionAssessmentInput) => { i.proposal.evidence.secretsReviewed = false; }],
    ['assistant provenance attachment', 'EVIDENCE_INVALID', (i: CompletionAssessmentInput) => { i.proposal.evidence.provenance = { ...i.proposal.evidence.provenance, kind: 'assistant_summary' }; }],
  ] as const)('requires authorized dates and task-specific evidence: %s', (_name, reason, mutate) => {
    const input = valid(); mutate(input); const result = assessCompletion(input);
    expect(result.eligible).toBe(false); expect(result.reasonCodes).toContain(reason);
  });
  it('uses configured local civil day rather than UTC day for the future-date gate', () => {
    const input = valid(); input.now = '2026-10-26T18:01:00Z';
    input.live.capturedAt = input.live.preflightAt = input.now;
    input.proposal.association!.verifiedAt = input.now;
    input.proposal.association!.provenance.capturedAt = input.now;
    input.proposal.sourceFacts[0].observedAt = input.now;
    input.proposal.evidence.capturedAt = input.now;
    const date = { iso: '2026-10-27', raw: '27-Okt-2026' };
    input.proposal.targetDate = input.proposal.proposedPesFinishDate = input.live.targetDate = date;
    expect(assessCompletion(input).eligible).toBe(true);
  });
  it.each([
    ['old live', 'STALE_LIVE', (i: CompletionAssessmentInput) => { i.live.capturedAt = '2026-10-26T12:58:00+07:00'; }],
    ['future live', 'STALE_LIVE', (i: CompletionAssessmentInput) => { i.live.capturedAt = '2026-10-26T13:01:00+07:00'; }],
    ['old preflight', 'STALE_PREFLIGHT', (i: CompletionAssessmentInput) => { i.live.preflightAt = '2026-10-26T12:59:00+07:00'; }],
    ['preflight outside lock', 'STALE_PREFLIGHT', (i: CompletionAssessmentInput) => { i.live.underLock = false; }],
    ['old source observation', 'STALE_SOURCE_FACTS', (i: CompletionAssessmentInput) => { i.proposal.sourceFacts[0].observedAt = '2026-10-25T13:00:00+07:00'; }],
    ['old primary provenance', 'STALE_SOURCE_FACTS', (i: CompletionAssessmentInput) => { i.proposal.sourceFacts[0].provenance = { ...i.proposal.sourceFacts[0].provenance, capturedAt: '2026-10-25T13:00:00+07:00' }; }],
    ['old association', 'ORIGIN_MAPPING_MISSING', (i: CompletionAssessmentInput) => { i.proposal.association!.verifiedAt = '2026-10-25T13:00:00+07:00'; }],
    ['old evidence', 'STALE_EVIDENCE', (i: CompletionAssessmentInput) => { i.proposal.evidence.capturedAt = '2026-10-25T13:00:00+07:00'; }],
    ['future evidence', 'STALE_EVIDENCE', (i: CompletionAssessmentInput) => { i.proposal.evidence.capturedAt = '2026-10-27T13:00:00+07:00'; }],
    ['unknown live status', 'UNKNOWN_STATUS', (i: CompletionAssessmentInput) => { i.live.listStatus = 'mystery'; }],
    ['intermediate Update Task', 'NOT_WRITABLE', (i: CompletionAssessmentInput) => { i.live.listStatus = 'Update Task'; }],
    ['already completed', 'ALREADY_COMPLETE', (i: CompletionAssessmentInput) => { i.live.detailStatus = 'Selesai'; }],
    ['disabled update', 'NOT_WRITABLE', (i: CompletionAssessmentInput) => { i.live.updateEnabled = false; }],
    ['uncertain prior attempt', 'PRIOR_ATTEMPT_REQUIRES_RECONCILIATION', (i: CompletionAssessmentInput) => { i.live.priorAttempt = 'uncertain'; }],
    ['unresolved discrepancy', 'UNRESOLVED_DISCREPANCY', (i: CompletionAssessmentInput) => { i.live.unresolvedDiscrepancy = true; }],
    ['list/detail conflict', 'UNRESOLVED_DISCREPANCY', (i: CompletionAssessmentInput) => { i.live.detailStatus = 'Approval'; }],
  ] as const)('requires fresh writable consistent preflight: %s', (_name, reason, mutate) => {
    const input = valid(); mutate(input); const result = assessCompletion(input);
    expect(result.eligible).toBe(false); expect(result.reasonCodes).toContain(reason);
  });
  it.each([
    ['overdue-only with no facts', 'AUTHORITATIVE_PROOF_MISSING', (i: CompletionAssessmentInput) => { i.proposal.sourceFacts = []; }],
    ['assistant summary only', 'AUTHORITATIVE_PROOF_MISSING', (i: CompletionAssessmentInput) => { i.proposal.sourceFacts[0].provenance = { ...i.proposal.sourceFacts[0].provenance, kind: 'assistant_summary' }; }],
    ['user confirmation only', 'AUTHORITATIVE_PROOF_MISSING', (i: CompletionAssessmentInput) => { i.proposal.sourceFacts[0].provenance = { ...i.proposal.sourceFacts[0].provenance, kind: 'user_confirmation' }; }],
    ['wrong task provenance', 'AUTHORITATIVE_PROOF_MISSING', (i: CompletionAssessmentInput) => { i.proposal.sourceFacts[0].provenance = { ...i.proposal.sourceFacts[0].provenance, taskUrl: 'https://app.asana.com/task/other' }; }],
    ['wrong goal fact', 'AUTHORITATIVE_PROOF_MISSING', (i: CompletionAssessmentInput) => { i.proposal.sourceFacts[0].goalScope = 'deployment'; }],
    ['acceptance tests absent', 'ACCEPTANCE_PROOF_MISSING', (i: CompletionAssessmentInput) => { i.proposal.sourceFacts[0].checks = ['implementation']; }],
    ['source called Done without explicit supported state', 'AUTHORITATIVE_PROOF_MISSING', (i: CompletionAssessmentInput) => { i.proposal.sourceFacts[0].state = 'Done'; }],
    ['Ready-for-QA for deployment', 'AUTHORITATIVE_PROOF_MISSING', (i: CompletionAssessmentInput) => { i.proposal.goalScope = i.live.goalScope = i.policy.taskRules[0].goalScope = i.proposal.sourceFacts[0].goalScope = 'deployment'; i.proposal.sourceFacts[0].state = 'ready_for_qa'; }],
    ['unconfigured task type', 'GOAL_SCOPE_MISMATCH', (i: CompletionAssessmentInput) => { i.proposal.taskType = i.live.taskType = 'unknown-task-type'; }],
    ['duplicate source does not corroborate', 'AUTHORITATIVE_PROOF_MISSING', (i: CompletionAssessmentInput) => { i.policy.taskRules[0].minAuthoritativeSources = 2; i.proposal.sourceFacts.push(structuredClone(i.proposal.sourceFacts[0])); }],
  ] as const)('requires goal-specific authoritative proof: %s', (_name, reason, mutate) => {
    const input = valid(); mutate(input); const result = assessCompletion(input);
    expect(result.eligible).toBe(false); expect(result.reasonCodes).toContain(reason);
  });
  it('allows Ready-for-QA only for explicitly configured BE development scope', () => {
    const input = valid(); input.proposal.sourceFacts[0].state = 'ready_for_qa';
    expect(assessCompletion(input).eligible).toBe(true);
  });
  it.each([
    ['unsupported revision', 'UNSUPPORTED_POLICY_REVISION', (i: CompletionAssessmentInput) => { i.policy.revision = i.proposal.policyRevision = 'v-next'; }],
    ['proposal revision mismatch', 'UNSUPPORTED_POLICY_REVISION', (i: CompletionAssessmentInput) => { i.proposal.policyRevision = 'v-next'; }],
    ['disabled policy', 'POLICY_NOT_APPROVED', (i: CompletionAssessmentInput) => { i.policy.enabled = false; }],
    ['future policy approval', 'POLICY_NOT_APPROVED', (i: CompletionAssessmentInput) => { i.policy.approvedAt = '2026-10-27T00:00:00Z'; }],
    ['wrong PIC', 'IDENTITY_MISMATCH', (i: CompletionAssessmentInput) => { i.live.identity.pic = '03220'; }],
    ['wrong department', 'IDENTITY_MISMATCH', (i: CompletionAssessmentInput) => { i.live.identity.department = '032'; }],
    ['raw TaskNo whitespace changed', 'IDENTITY_MISMATCH', (i: CompletionAssessmentInput) => { i.live.identity.listTaskNo = i.proposal.identity.detailTaskNo; }],
    ['missing association', 'ORIGIN_MAPPING_MISSING', (i: CompletionAssessmentInput) => { i.proposal.association = null; }],
    ['wrong association', 'ORIGIN_MAPPING_MISSING', (i: CompletionAssessmentInput) => { i.proposal.association!.identity.listTaskNo += ' '; }],
    ['supporting-only association', 'ORIGIN_MAPPING_MISSING', (i: CompletionAssessmentInput) => { i.proposal.association!.provenance = { ...i.proposal.association!.provenance, kind: 'assistant_summary' }; }],
    ['wrong source task', 'ORIGIN_MAPPING_MISSING', (i: CompletionAssessmentInput) => { i.live.sourceTaskUrl += '/other'; }],
    ['changed live goal', 'GOAL_SCOPE_MISMATCH', (i: CompletionAssessmentInput) => { i.live.rawGoal = 'deployment complete'; }],
  ] as const)('blocks %s', (_name, reason, mutate) => {
    const input = valid(); mutate(input);
    const result = assessCompletion(input);
    expect(result.eligible).toBe(false); expect(result.reasonCodes).toContain(reason);
    expect(result.proposedPesFinishDate).toBeNull();
  });
  it('accepts exact associated task-specific authoritative goal proof under standing target-date policy', () => {
    expect(isCompletionAssessmentInput(valid())).toBe(true);
    expect(assessCompletion(valid())).toEqual({ eligible: true, reasonCodes: [], proposedPesFinishDate: { iso: '2026-10-23', raw: '23-Okt-2026' } });
  });
});
