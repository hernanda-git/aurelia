/** Completion contracts deliberately do not grant mutation authority. Main must authenticate,
 * stage bytes, hold portal ownership and journal intent independently. Raw IDs are opaque. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function isNonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
export function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(value)
    && Number.isFinite(Date.parse(value)) && isIsoCivilDate(value.slice(0, 10));
}
export function isIsoCivilDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function isCivilDate(value: unknown): value is CivilDate {
  if (!isRecord(value) || !isIsoCivilDate(value.iso) || !isNonempty(value.raw)) return false;
  if (value.raw === value.iso) return true;
  const match = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(value.raw);
  if (!match) return false;
  const months: Readonly<Record<string, string>> = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', Mei: '05', May: '05',
    Jun: '06', Jul: '07', Agu: '08', Agt: '08', Aug: '08', Sep: '09', Okt: '10', Oct: '10', Nov: '11', Des: '12', Dec: '12' };
  const month = months[match[2]];
  return !!month && `${match[3]}-${month}-${match[1].padStart(2, '0')}` === value.iso;
}
export function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
export function isCompletionIdentity(value: unknown): value is CompletionIdentity {
  return isRecord(value) && ['listTaskNo', 'detailTaskNo', 'pic', 'department', 'originUrl'].every(key => isNonempty(value[key]));
}
export type ProvenanceKind = 'task_system' | 'execution_report' | 'user_confirmation' | 'assistant_summary' | 'rendered_summary';
export interface SourceProvenance {
  kind: ProvenanceKind; uri: string; taskUrl: string; revision: string; capturedAt: string;
}
export interface CompletionSourceFact {
  sourceTaskUrl: string; goalScope: string; checks: string[]; state: string;
  observedAt: string; provenance: SourceProvenance;
}
export interface CompletionEvidenceManifest {
  identity: CompletionIdentity; fileName: string; mimeType: string; byteLength: number; sha256: string;
  capturedAt: string; provenance: SourceProvenance;
  kind: 'original_screenshot' | 'original_execution_report' | 'approved_rendered_summary'; secretsReviewed: boolean;
}
export interface CompletionTaskRule {
  taskType: string; goalScope: string; requiredChecks: string[]; minAuthoritativeSources: number;
  allowedSourceKinds: Array<'task_system' | 'execution_report'>; allowReadyForQa: boolean;
}
export interface CompletionPolicy {
  revision: string; approvedBy: string; approvedAt: string; enabled: boolean; finishDatePolicy: string; timezone: string;
  maxLiveAgeMs: number; maxPreflightAgeMs: number; maxSourceAgeMs: number; maxEvidenceAgeMs: number;
  maxAttachmentBytes: number; allowedMimeTypes: string[]; taskRules: CompletionTaskRule[];
}
export interface CompletionProposal {
  proposalId: string; policyRevision: string; identity: CompletionIdentity; taskType: string; goalScope: string;
  rawGoal: string; sourceTaskUrl: string; targetDate: CivilDate; proposedPesFinishDate: CivilDate; observedCompletedAt: string;
  association: { identity: CompletionIdentity; verifiedAt: string; provenance: SourceProvenance } | null;
  sourceFacts: CompletionSourceFact[]; evidence: CompletionEvidenceManifest;
}
export interface CompletionLivePreflight {
  identity: CompletionIdentity; taskType: string; goalScope: string; rawGoal: string; sourceTaskUrl: string; targetDate: CivilDate;
  listStatus: string; detailStatus: string; updateEnabled: boolean; capturedAt: string; preflightAt: string;
  underLock: boolean; priorAttempt: 'none' | 'submitted' | 'uncertain' | 'verified'; unresolvedDiscrepancy: boolean;
  /** Raw matching target-row status, required for the observed Approval/T1 mapping. */
  targetStatus?: string;
}
export interface CompletionAssessmentInput {
  schemaVersion: 1; now: string; policy: CompletionPolicy; proposal: CompletionProposal; live: CompletionLivePreflight;
}
export type CompletionPolicyReasonCode = 'INVALID_INPUT' | 'UNSUPPORTED_POLICY_REVISION' | 'POLICY_NOT_APPROVED'
  | 'IDENTITY_MISMATCH' | 'ORIGIN_MAPPING_MISSING' | 'GOAL_SCOPE_MISMATCH' | 'STALE_LIVE' | 'STALE_PREFLIGHT'
  | 'STALE_SOURCE_FACTS' | 'STALE_EVIDENCE' | 'UNKNOWN_STATUS' | 'NOT_WRITABLE' | 'ALREADY_COMPLETE'
  | 'PRIOR_ATTEMPT_REQUIRES_RECONCILIATION' | 'UNRESOLVED_DISCREPANCY' | 'AUTHORITATIVE_PROOF_MISSING'
  | 'ACCEPTANCE_PROOF_MISSING' | 'EVIDENCE_INVALID' | 'DATE_POLICY_NOT_APPROVED' | 'FUTURE_FINISH_DATE'
  | 'TARGET_DATE_CHANGED' | 'FINISH_DATE_MISMATCH' | 'COMPLETION_TIME_INVALID';
export interface CompletionPolicyDecision {
  eligible: boolean; reasonCodes: CompletionPolicyReasonCode[]; proposedPesFinishDate: CivilDate | null;
}

export interface CivilDate { iso: string; raw: string }
export interface CompletionIdentity {
  listTaskNo: string; detailTaskNo: string; pic: string; department: string; originUrl: string;
}
export type CompletionOutcome = 'VERIFIED' | 'SAVED_WITH_DISCREPANCY' | 'OUTCOME_UNKNOWN';
export type VerificationReasonCode = 'INVALID_INPUT' | 'REQUIRED_VIEW_MISSING' | 'STALE_READBACK'
  | 'IDENTITY_MISMATCH' | 'UNKNOWN_STATUS' | 'STATUS_MISMATCH' | 'TARGET_DATE_MISMATCH'
  | 'FINISH_DATE_MISMATCH' | 'ATTACHMENT_MISMATCH' | 'SEMANTICS_UNAPPROVED';
export interface SavedTaskView {
  taskNo: string; pic: string; department: string; originUrl: string; status: string;
  targetDate: CivilDate; finishDate?: CivilDate | null;
  capturedAt: string; independentlyReopened: boolean;
}
export interface AttachmentReadback {
  identity: CompletionIdentity;
  fileName: string; capturedAt: string; independentlyReopened: boolean;
  verification: 'metadata_only' | 'sha256'; sha256?: string;
}
export interface CompletionVerificationInput {
  schemaVersion: 1; now: string; submittedAt: string; maxReadbackAgeMs: number;
  expected: { identity: CompletionIdentity; targetDate: CivilDate; finishDate: CivilDate;
    attachmentName: string; attachmentSha256: string };
  semanticContract: { revision: string; approvedBy: string } | null;
  views: { list?: SavedTaskView | null; detail?: SavedTaskView | null;
    targetTable?: SavedTaskView | null; info?: SavedTaskView | null };
  attachment?: AttachmentReadback | null;
}
export interface CompletionVerificationResult {
  outcome: CompletionOutcome; reasonCodes: VerificationReasonCode[];
  remoteViews: CompletionVerificationInput['views'] | null;
  attachmentVerification: 'metadata_only' | 'sha256' | 'unavailable';
  retryMutation: false;
}
