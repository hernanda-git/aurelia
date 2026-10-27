import {
  isRecord, isNonempty, isTimestamp, isCivilDate, isSha256, isCompletionIdentity,
  type SourceProvenance, type CompletionIdentity, type CompletionAssessmentInput, type CompletionPolicyDecision,
} from '../shared/completion-types';

const positiveInteger = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
function denseArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index++) if (!Object.hasOwn(value, index)) return false;
  return true;
}
const strings = (value: unknown): value is string[] => denseArray(value) && value.every(isNonempty);
const enumMember = (value: unknown, allowed: readonly string[]): value is string => typeof value === 'string' && allowed.includes(value);
function provenance(value: unknown): value is SourceProvenance {
  return isRecord(value) && enumMember(value.kind, ['task_system', 'execution_report', 'user_confirmation', 'assistant_summary', 'rendered_summary'])
    && isNonempty(value.uri) && isNonempty(value.taskUrl) && isNonempty(value.revision) && isTimestamp(value.capturedAt);
}
function validPolicy(value: unknown): boolean {
  if (!isRecord(value) || !['revision', 'approvedBy', 'finishDatePolicy', 'timezone'].every(key => isNonempty(value[key]))
    || !isTimestamp(value.approvedAt) || typeof value.enabled !== 'boolean'
    || !['maxLiveAgeMs', 'maxPreflightAgeMs', 'maxSourceAgeMs', 'maxEvidenceAgeMs', 'maxAttachmentBytes'].every(key => positiveInteger(value[key]))
    || !strings(value.allowedMimeTypes) || value.allowedMimeTypes.length === 0 || !denseArray(value.taskRules) || value.taskRules.length === 0) return false;
  try { new Intl.DateTimeFormat('en-CA', { timeZone: String(value.timezone) }).format(0); } catch { return false; }
  return value.taskRules.every(rule => isRecord(rule) && isNonempty(rule.taskType) && isNonempty(rule.goalScope)
    && strings(rule.requiredChecks) && rule.requiredChecks.length > 0 && new Set(rule.requiredChecks).size === rule.requiredChecks.length
    && positiveInteger(rule.minAuthoritativeSources) && denseArray(rule.allowedSourceKinds) && rule.allowedSourceKinds.length > 0
    && rule.allowedSourceKinds.every(kind => kind === 'task_system' || kind === 'execution_report') && typeof rule.allowReadyForQa === 'boolean');
}
function validProposal(value: unknown): boolean {
  if (!isRecord(value) || !['proposalId', 'policyRevision', 'taskType', 'goalScope', 'rawGoal', 'sourceTaskUrl'].every(key => isNonempty(value[key]))
    || !isCompletionIdentity(value.identity) || !isCivilDate(value.targetDate) || !isCivilDate(value.proposedPesFinishDate)
    || !isTimestamp(value.observedCompletedAt) || !denseArray(value.sourceFacts)) return false;
  const association = value.association;
  if (association !== null && (!isRecord(association) || !isCompletionIdentity(association.identity)
    || !isTimestamp(association.verifiedAt) || !provenance(association.provenance))) return false;
  if (!value.sourceFacts.every(fact => isRecord(fact) && isNonempty(fact.sourceTaskUrl) && isNonempty(fact.goalScope)
    && strings(fact.checks) && isNonempty(fact.state) && isTimestamp(fact.observedAt) && provenance(fact.provenance))) return false;
  const e = value.evidence;
  return isRecord(e) && isCompletionIdentity(e.identity) && isNonempty(e.fileName) && isNonempty(e.mimeType)
    && positiveInteger(e.byteLength) && isSha256(e.sha256) && isTimestamp(e.capturedAt) && provenance(e.provenance)
    && enumMember(e.kind, ['original_screenshot', 'original_execution_report', 'approved_rendered_summary']) && typeof e.secretsReviewed === 'boolean';
}
function validLive(value: unknown): boolean {
  return isRecord(value) && isCompletionIdentity(value.identity)
    && ['taskType', 'goalScope', 'rawGoal', 'sourceTaskUrl', 'listStatus', 'detailStatus'].every(key => isNonempty(value[key]))
    && isCivilDate(value.targetDate) && isTimestamp(value.capturedAt) && isTimestamp(value.preflightAt)
    && ['updateEnabled', 'underLock', 'unresolvedDiscrepancy'].every(key => typeof value[key] === 'boolean')
    && (value.targetStatus === undefined || isNonempty(value.targetStatus))
    && enumMember(value.priorAttempt, ['none', 'submitted', 'uncertain', 'verified']);
}
/** Accepts unknown transport data; does not authenticate a principal or validate evidence bytes. */
export function isCompletionAssessmentInput(value: unknown): value is CompletionAssessmentInput {
  return isRecord(value) && value.schemaVersion === 1 && isTimestamp(value.now)
    && validPolicy(value.policy) && validProposal(value.proposal) && validLive(value.live);
}
const sameIdentity = (left: CompletionIdentity, right: CompletionIdentity): boolean =>
  left.listTaskNo === right.listTaskNo && left.detailTaskNo === right.detailTaskNo && left.pic === right.pic
    && left.department === right.department && left.originUrl === right.originUrl;
const authoritative = (source: SourceProvenance): boolean => source.kind === 'task_system' || source.kind === 'execution_report';
/** Pure eligibility only. Main must supply trusted standing policy, clock and live under-lock
 * facts; an agent must not choose these fields. Provenance describes inspected primary
 * sources, not self-authenticating attestations. Evidence byte validation/staging, capability
 * consumption and journal durability remain separate mandatory gates before any write. */
export function assessCompletion(input: unknown): CompletionPolicyDecision {
  if (!isCompletionAssessmentInput(input)) return { eligible: false, reasonCodes: ['INVALID_INPUT'], proposedPesFinishDate: null };
  const { policy, proposal, live } = input;
  const now = Date.parse(input.now);
  const fresh = (at: string, ttl: number): boolean => Date.parse(at) <= now && now - Date.parse(at) <= ttl;
  const reasons: CompletionPolicyDecision['reasonCodes'] = [];
  if (!fresh(live.capturedAt, policy.maxLiveAgeMs)) reasons.push('STALE_LIVE');
  if (!live.underLock || !fresh(live.preflightAt, policy.maxPreflightAgeMs)
    || Date.parse(live.capturedAt) > Date.parse(live.preflightAt)) reasons.push('STALE_PREFLIGHT');
  if (proposal.sourceFacts.some(fact => !fresh(fact.observedAt, policy.maxSourceAgeMs)
    || !fresh(fact.provenance.capturedAt, policy.maxSourceAgeMs))) reasons.push('STALE_SOURCE_FACTS');
  if (!fresh(proposal.evidence.capturedAt, policy.maxEvidenceAgeMs)
    || !fresh(proposal.evidence.provenance.capturedAt, policy.maxEvidenceAgeMs)) reasons.push('STALE_EVIDENCE');
  if (proposal.association && (!fresh(proposal.association.verifiedAt, policy.maxSourceAgeMs)
    || !fresh(proposal.association.provenance.capturedAt, policy.maxSourceAgeMs))) reasons.push('ORIGIN_MAPPING_MISSING');
  const statuses = [live.listStatus, live.detailStatus];
  const approvedT1 = live.listStatus === 'Approval' && live.detailStatus === 'T1' && live.targetStatus === 'Approved';
  if (!['Open', 'Approval', 'Update Task', 'Solved', 'Selesai'].includes(live.listStatus)
    || (!['Open', 'Approval', 'Update Task', 'Solved', 'Selesai'].includes(live.detailStatus) && !approvedT1)) reasons.push('UNKNOWN_STATUS');
  if (statuses.some(status => status === 'Solved' || status === 'Selesai')) reasons.push('ALREADY_COMPLETE');
  if (!live.updateEnabled || (!approvedT1 && statuses.some(status => !['Open', 'Approval'].includes(status)))) reasons.push('NOT_WRITABLE');
  if (live.priorAttempt !== 'none') reasons.push('PRIOR_ATTEMPT_REQUIRES_RECONCILIATION');
  if (live.unresolvedDiscrepancy || (!approvedT1 && live.listStatus !== live.detailStatus)) reasons.push('UNRESOLVED_DISCREPANCY');
  if (policy.revision !== 'completion-policy-v1' || proposal.policyRevision !== policy.revision) reasons.push('UNSUPPORTED_POLICY_REVISION');
  if (!policy.enabled || Date.parse(policy.approvedAt) > Date.parse(input.now)) reasons.push('POLICY_NOT_APPROVED');
  if (proposal.identity.pic !== '3220' || proposal.identity.department !== '32' || !sameIdentity(proposal.identity, live.identity)) reasons.push('IDENTITY_MISMATCH');
  const association = proposal.association;
  if (!association || !sameIdentity(proposal.identity, association.identity) || !authoritative(association.provenance)
    || association.provenance.taskUrl !== proposal.identity.originUrl || proposal.sourceTaskUrl !== proposal.identity.originUrl
    || live.sourceTaskUrl !== proposal.sourceTaskUrl) reasons.push('ORIGIN_MAPPING_MISSING');
  if (proposal.rawGoal !== live.rawGoal || proposal.goalScope !== live.goalScope || proposal.taskType !== live.taskType) reasons.push('GOAL_SCOPE_MISMATCH');
  const rules = policy.taskRules.filter(rule => rule.taskType === proposal.taskType && rule.goalScope === proposal.goalScope);
  const rule = rules.length === 1 ? rules[0] : undefined;
  if (!rule) reasons.push('GOAL_SCOPE_MISMATCH');
  const facts = proposal.sourceFacts.filter(fact => authoritative(fact.provenance)
    && rule?.allowedSourceKinds.some(kind => kind === fact.provenance.kind)
    && fact.sourceTaskUrl === proposal.sourceTaskUrl && fact.provenance.taskUrl === proposal.sourceTaskUrl
    && fact.goalScope === proposal.goalScope && (fact.state === 'completed'
      || (fact.state === 'ready_for_qa' && proposal.goalScope === 'be_development' && rule?.allowReadyForQa)));
  const sources = new Set(facts.map(fact => `${fact.provenance.kind}\n${fact.provenance.uri}`));
  if (!rule || sources.size < rule.minAuthoritativeSources) reasons.push('AUTHORITATIVE_PROOF_MISSING');
  if (rule && rule.requiredChecks.some(check => !facts.some(fact => fact.checks.includes(check)))) reasons.push('ACCEPTANCE_PROOF_MISSING');
  const dayParts = new Intl.DateTimeFormat('en-CA', { timeZone: policy.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string): string => dayParts.find(value => value.type === type)?.value ?? '';
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  if (policy.finishDatePolicy !== 'target_date') reasons.push('DATE_POLICY_NOT_APPROVED');
  if (proposal.proposedPesFinishDate.iso > today) reasons.push('FUTURE_FINISH_DATE');
  if (proposal.targetDate.iso !== live.targetDate.iso || proposal.targetDate.raw !== live.targetDate.raw) reasons.push('TARGET_DATE_CHANGED');
  if (proposal.proposedPesFinishDate.iso !== proposal.targetDate.iso || proposal.proposedPesFinishDate.raw !== proposal.targetDate.raw) reasons.push('FINISH_DATE_MISMATCH');
  if (Date.parse(proposal.observedCompletedAt) > now) reasons.push('COMPLETION_TIME_INVALID');
  const evidence = proposal.evidence;
  if (!sameIdentity(evidence.identity, proposal.identity) || evidence.provenance.taskUrl !== proposal.sourceTaskUrl
    || !authoritative(evidence.provenance) || evidence.byteLength > policy.maxAttachmentBytes
    || !policy.allowedMimeTypes.includes(evidence.mimeType) || !evidence.secretsReviewed) reasons.push('EVIDENCE_INVALID');
  return { eligible: reasons.length === 0, reasonCodes: [...new Set(reasons)],
    proposedPesFinishDate: reasons.length ? null : { ...proposal.proposedPesFinishDate } };
}
