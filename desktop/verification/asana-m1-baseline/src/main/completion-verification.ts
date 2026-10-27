import {
  isRecord, isNonempty, isTimestamp, isCivilDate, isSha256, isCompletionIdentity,
  type SavedTaskView, type CompletionVerificationInput, type CompletionVerificationResult,
} from '../shared/completion-types';

function isView(value: unknown): value is SavedTaskView {
  return isRecord(value) && ['taskNo', 'pic', 'department', 'originUrl', 'status'].every(key => isNonempty(value[key]))
    && isCivilDate(value.targetDate) && (value.finishDate === undefined || value.finishDate === null || isCivilDate(value.finishDate))
    && isTimestamp(value.capturedAt) && typeof value.independentlyReopened === 'boolean';
}
/** Structural validation never proves a remote read or authorization occurred. */
export function isCompletionVerificationInput(value: unknown): value is CompletionVerificationInput {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isTimestamp(value.now) || !isTimestamp(value.submittedAt)
    || typeof value.maxReadbackAgeMs !== 'number' || !Number.isSafeInteger(value.maxReadbackAgeMs) || value.maxReadbackAgeMs <= 0
    || !isRecord(value.expected) || !isCompletionIdentity(value.expected.identity)
    || !isCivilDate(value.expected.targetDate) || !isCivilDate(value.expected.finishDate)
    || !isNonempty(value.expected.attachmentName) || !isSha256(value.expected.attachmentSha256) || !isRecord(value.views)) return false;
  if (value.semanticContract !== null && (!isRecord(value.semanticContract)
    || !isNonempty(value.semanticContract.revision) || !isNonempty(value.semanticContract.approvedBy))) return false;
  for (const key of ['list', 'detail', 'targetTable', 'info']) {
    const view = value.views[key];
    if (view !== undefined && view !== null && !isView(view)) return false;
  }
  const attachment = value.attachment;
  return attachment === undefined || attachment === null || (isRecord(attachment)
    && isCompletionIdentity(attachment.identity) && isNonempty(attachment.fileName) && isTimestamp(attachment.capturedAt)
    && typeof attachment.independentlyReopened === 'boolean'
    && (attachment.verification === 'metadata_only' || attachment.verification === 'sha256')
    && (attachment.sha256 === undefined || isSha256(attachment.sha256))
    && (attachment.verification !== 'sha256' || isSha256(attachment.sha256)));
}

/** Read-only classification: no outcome authorizes repeating a mutation. Main supplies
 * expected values from the sealed proposal, observed views from the portal adapter and
 * its explicitly approved semantic contract. The revision is not inferred from statuses.
 * List/Info use listTaskNo; Kelola/targetTable use detailTaskNo. All raw values are retained. */
export function verifyCompletion(input: unknown): CompletionVerificationResult {
  if (!isCompletionVerificationInput(input)) return { outcome: 'OUTCOME_UNKNOWN', reasonCodes: ['INVALID_INPUT'],
    remoteViews: null, attachmentVerification: 'unavailable', retryMutation: false };
  const required = [input.views.list, input.views.detail, input.views.targetTable, input.views.info, input.attachment];
  const unknown = (reason: 'REQUIRED_VIEW_MISSING' | 'STALE_READBACK'): CompletionVerificationResult => ({
    outcome: 'OUTCOME_UNKNOWN', reasonCodes: [reason], remoteViews: input.views,
    attachmentVerification: 'unavailable', retryMutation: false,
  });
  if (required.some(view => !view)) return unknown('REQUIRED_VIEW_MISSING');
  const now = Date.parse(input.now);
  const submitted = Date.parse(input.submittedAt);
  if (submitted > now || required.some(view => view && (!view.independentlyReopened
    || Date.parse(view.capturedAt) < submitted || Date.parse(view.capturedAt) > now
    || now - Date.parse(view.capturedAt) > input.maxReadbackAgeMs))) return unknown('STALE_READBACK');
  const reasonCodes: CompletionVerificationResult['reasonCodes'] = [];
  const identity = input.expected.identity;
  if (identity.pic !== '3220' || identity.department !== '32') reasonCodes.push('IDENTITY_MISMATCH');
  if (input.semanticContract?.revision !== 'pes-selesai-solved-v1') reasonCodes.push('SEMANTICS_UNAPPROVED');
  for (const key of ['list', 'detail', 'targetTable', 'info'] as const) {
    const view = input.views[key];
    if (!view) continue; // Missing views have already returned OUTCOME_UNKNOWN.
    const taskNo = key === 'detail' || key === 'targetTable' ? identity.detailTaskNo : identity.listTaskNo;
    if (view.taskNo !== taskNo || view.pic !== identity.pic || view.department !== identity.department
      || view.originUrl !== identity.originUrl) reasonCodes.push('IDENTITY_MISMATCH');
    if (!['Open', 'Approval', 'Update Task', 'Solved', 'Selesai'].includes(view.status)) reasonCodes.push('UNKNOWN_STATUS');
    if (view.status !== (key === 'detail' ? 'Selesai' : 'Solved')) reasonCodes.push('STATUS_MISMATCH');
    // Each raw value was validated against its ISO civil date at the boundary.
    // Preserve the source spelling; compare days across different PES locale displays.
    if (view.targetDate.iso !== input.expected.targetDate.iso) reasonCodes.push('TARGET_DATE_MISMATCH');
    if ((key === 'list' || key === 'detail' || view.finishDate !== undefined)
      && view.finishDate?.iso !== input.expected.finishDate.iso) reasonCodes.push('FINISH_DATE_MISMATCH');
  }
  const attachment = input.attachment;
  if (attachment?.fileName !== input.expected.attachmentName
    || !attachment || (['listTaskNo', 'detailTaskNo', 'pic', 'department', 'originUrl'] as const).some(key => attachment.identity[key] !== identity[key])
    || (attachment.verification === 'sha256' && attachment.sha256 !== input.expected.attachmentSha256)) reasonCodes.push('ATTACHMENT_MISMATCH');
  // A contradiction is only a saved discrepancy when an exact saved completed detail is established.
  const detail = input.views.detail;
  const saved = detail?.taskNo === identity.detailTaskNo && detail.pic === identity.pic
    && detail.department === identity.department && detail.originUrl === identity.originUrl && detail.status === 'Selesai';
  return { outcome: reasonCodes.length ? (saved ? 'SAVED_WITH_DISCREPANCY' : 'OUTCOME_UNKNOWN') : 'VERIFIED',
    reasonCodes: [...new Set(reasonCodes)], remoteViews: input.views,
    attachmentVerification: input.attachment?.verification ?? 'unavailable', retryMutation: false };
}
