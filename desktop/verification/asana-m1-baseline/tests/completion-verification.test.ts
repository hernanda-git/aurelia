import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { verifyCompletion, isCompletionVerificationInput } from '../src/main/completion-verification';
import type { CompletionVerificationInput } from '../src/shared/completion-types';
const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/completion/${name}.json`, import.meta.url), 'utf8'));
function consistent(): CompletionVerificationInput {
  const data = fixture('store');
  if (!isCompletionVerificationInput(data)) throw new Error('invalid fixture');
  if (!data.views.list) throw new Error('missing list fixture');
  data.views.list.finishDate = { ...data.expected.finishDate };
  return data;
}
describe('saved-view completion verification', () => {
  it('compares validated civil dates across Oct/Okt formatting while preserving raw observations',()=>{
    const input=consistent();input.views.info!.targetDate={iso:'2026-10-23',raw:'23-Oct-2026'};
    input.views.list!.finishDate={iso:'2026-10-23',raw:'23-Oct-2026'};
    const result=verifyCompletion(input);expect(result.outcome).toBe('VERIFIED');
    expect(result.remoteViews?.info?.targetDate.raw).toBe('23-Oct-2026');
  });
  it('rejects attachment metadata read from another task even when the filename matches', () => {
    const input = consistent();
    Object.assign(input.attachment!, { identity: { ...input.expected.identity, detailTaskNo: 'M09999/Task.IT/1026' } });
    const result = verifyCompletion(input);
    expect(result.outcome).toBe('SAVED_WITH_DISCREPANCY');
    expect(result.reasonCodes).toContain('ATTACHMENT_MISMATCH');
  });
  it.each([null, [], {}, { schemaVersion: 2 }])('rejects malformed verification transport input', input => {
    expect(isCompletionVerificationInput(input)).toBe(false);
    expect(verifyCompletion(input)).toMatchObject({ outcome: 'OUTCOME_UNKNOWN', reasonCodes: ['INVALID_INPUT'], retryMutation: false });
  });
  it.each([
    ['raw identifier whitespace', 'IDENTITY_MISMATCH', (i: CompletionVerificationInput) => { i.views.list!.taskNo = i.expected.identity.detailTaskNo; }],
    ['PIC', 'IDENTITY_MISMATCH', (i: CompletionVerificationInput) => { i.views.info!.pic = '3221'; }],
    ['department', 'IDENTITY_MISMATCH', (i: CompletionVerificationInput) => { i.views.targetTable!.department = '33'; }],
    ['origin', 'IDENTITY_MISMATCH', (i: CompletionVerificationInput) => { i.views.detail!.originUrl += '/other'; }],
    ['unknown status', 'UNKNOWN_STATUS', (i: CompletionVerificationInput) => { i.views.info!.status = 'Unexpected'; }],
    ['target date', 'TARGET_DATE_MISMATCH', (i: CompletionVerificationInput) => { i.views.info!.targetDate = { iso: '2026-10-24', raw: '24-Okt-2026' }; }],
    ['both wrong finish dates', 'FINISH_DATE_MISMATCH', (i: CompletionVerificationInput) => { i.views.list!.finishDate = i.views.detail!.finishDate = { iso: '2026-10-24', raw: '24-Okt-2026' }; }],
    ['absent finish field', 'FINISH_DATE_MISMATCH', (i: CompletionVerificationInput) => { delete i.views.list!.finishDate; delete i.views.detail!.finishDate; }],
    ['attachment filename', 'ATTACHMENT_MISMATCH', (i: CompletionVerificationInput) => { i.attachment!.fileName += '.other'; }],
    ['attachment bytes', 'ATTACHMENT_MISMATCH', (i: CompletionVerificationInput) => { i.attachment!.verification = 'sha256'; i.attachment!.sha256 = '0'.repeat(64); }],
    ['missing semantic approval', 'SEMANTICS_UNAPPROVED', (i: CompletionVerificationInput) => { i.semanticContract = null; }],
  ] as const)('does not verify mismatching %s', (_name, reason, mutate) => {
    const input = consistent(); mutate(input);
    const result = verifyCompletion(input);
    expect(result.outcome).not.toBe('VERIFIED');
    expect(result.reasonCodes).toContain(reason);
  });
  it.each(['list', 'detail', 'targetTable', 'info', 'attachment'] as const)('missing %s is unknown, never inferred from disappearance', key => {
    const input = consistent();
    if (key === 'attachment') input.attachment = null;
    else input.views[key] = null;
    expect(verifyCompletion(input)).toMatchObject({ outcome: 'OUTCOME_UNKNOWN', reasonCodes: ['REQUIRED_VIEW_MISSING'], retryMutation: false });
  });
  it.each(['old', 'future', 'before-submit', 'not-reopened'] as const)('rejects %s readback as unknown', mode => {
    const input = consistent();
    const view = input.views.list!;
    if (mode === 'old') view.capturedAt = '2026-10-26T13:01:00+07:00';
    if (mode === 'future') view.capturedAt = '2026-10-26T13:21:00+07:00';
    if (mode === 'before-submit') view.capturedAt = '2026-10-26T12:59:00+07:00';
    if (mode === 'not-reopened') view.independentlyReopened = false;
    expect(verifyCompletion(input)).toMatchObject({ outcome: 'OUTCOME_UNKNOWN', reasonCodes: ['STALE_READBACK'] });
  });
  it('verifies consistent independently reopened saved views, disclosing metadata-only assurance', () => {
    const result = verifyCompletion(consistent());
    expect(result).toMatchObject({ outcome: 'VERIFIED', reasonCodes: [], attachmentVerification: 'metadata_only', retryMutation: false });
  });
  it('retains the real Store list/detail date conflict as a discrepancy', () => {
    const result = verifyCompletion(fixture('store'));
    expect(result.outcome).toBe('SAVED_WITH_DISCREPANCY');
    expect(result.reasonCodes).toContain('FINISH_DATE_MISMATCH');
    expect(JSON.stringify(result.remoteViews)).toContain('26-Okt-2026');
    expect(JSON.stringify(result.remoteViews)).toContain('Task. IT');
    expect(JSON.stringify(result.remoteViews)).toContain('Task.IT');
  });
  it('keeps FIFO Update Task disagreement unresolved even when the saved detail is Selesai', () => {
    const result = verifyCompletion(fixture('fifo'));
    expect(result.outcome).toBe('SAVED_WITH_DISCREPANCY');
    expect(result.reasonCodes).toContain('STATUS_MISMATCH');
    expect(result.retryMutation).toBe(false);
  });
});
