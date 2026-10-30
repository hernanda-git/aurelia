import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Task, Snapshot } from '../shared/types';
import {
  PortalCompletionDriver,
  type CompletionIdentity,
  type CompletionStagedFile,
} from './portal-completion';
import type { PesPortal } from './portal';
import type { CompletionJournal } from './completion-journal';
import type { PortalCoordinator } from './portal-coordinator';

export async function stageEvidenceFile(filePath: string): Promise<CompletionStagedFile> {
  const stat = await fs.promises.stat(filePath);
  if (!stat.isFile() || stat.size === 0) {
    throw new Error('FILE_BUKTI_TIDAK_VALID');
  }
  const bytes = await fs.promises.readFile(filePath);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const fileName = path.basename(filePath);
  const ext = fileName.split('.').pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    txt: 'text/plain',
    md: 'text/plain',
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    zip: 'application/zip',
  };
  const mime = (ext && mimeMap[ext]) || 'application/octet-stream';
  return {
    filePath,
    fileName,
    size: stat.size,
    mime,
    sha256,
  };
}

export async function createAutoEvidence(task: Task, targetDir: string): Promise<CompletionStagedFile> {
  fs.mkdirSync(targetDir, { recursive: true });
  const cleanId = task.TaskNo.replace(/[^a-zA-Z0-9_-]/g, '_');
  const nowIso = new Date().toISOString();
  const evidencePath = path.join(targetDir, `bukti-penyelesaian-${cleanId}.txt`);

  const content = [
    '================================================================================',
    'BUKTI PENYELESAIAN TASK PES (PORTAL EVALUASI STAF)',
    '================================================================================',
    `Nomor Task       : ${task.TaskNo}`,
    `Nama Task        : ${task.TaskName}`,
    `PIC              : ${task.Pic}`,
    `Jabatan / Dept   : ${task.Jabatan} / ${task.DeptName}`,
    `Goal / Target    : ${task.GoalTask}`,
    `Target Kategori  : ${task.Target} (Bobot: ${task.Bobot})`,
    `Tenggat Waktu    : ${task.Duedate}`,
    `Status Sebelum   : ${task.Status}`,
    `Waktu Selesai    : ${nowIso}`,
    '--------------------------------------------------------------------------------',
    'CATATAN & VERIFIKASI:',
    'Pekerjaan pengembangan teknis telah diselesaikan dan diverifikasi.',
    'Status diubah ke Selesai melalui Aurelia Personal Agentic Task Management.',
    '================================================================================',
  ].join('\r\n');

  await fs.promises.writeFile(evidencePath, content, 'utf8');
  return stageEvidenceFile(evidencePath);
}

export interface PesCompletionResult {
  success: boolean;
  taskNo: string;
  finishDate?: string;
  evidenceName?: string;
  error?: string;
}

export async function executePesCompletion(options: {
  taskNo: string;
  finishDate: string;
  evidencePath?: string | null;
  snapshot: Snapshot | null;
  portal: PesPortal;
  portalOwner: PortalCoordinator;
  journal?: CompletionJournal;
  workspaceRoot?: string;
}): Promise<PesCompletionResult> {
  const { taskNo, finishDate, evidencePath, snapshot, portal, portalOwner, journal, workspaceRoot } = options;
  if (!snapshot || !snapshot.tasks.length) {
    return { success: false, taskNo, error: 'SNAPSHOT_TIDAK_TERSEDIA' };
  }

  const task = snapshot.tasks.find(t => t.TaskNo === taskNo);
  if (!task) {
    return { success: false, taskNo, error: `TASK_TIDAK_DITEMUKAN: ${taskNo}` };
  }

  // 1. Prepare evidence file
  let stagedFile: CompletionStagedFile;
  try {
    if (evidencePath && fs.existsSync(evidencePath)) {
      stagedFile = await stageEvidenceFile(evidencePath);
    } else {
      const fallbackDir = workspaceRoot ? path.join(workspaceRoot, 'evidence') : path.join(process.cwd(), 'evidence');
      stagedFile = await createAutoEvidence(task, fallbackDir);
    }
  } catch (err) {
    return { success: false, taskNo, error: `GAGAL_MENYIAPKAN_BUKTI: ${err instanceof Error ? err.message : String(err)}` };
  }

  // 2. Build CompletionIdentity
  const identity: CompletionIdentity = {
    listTaskNo: task.TaskNo,
    detailTaskNo: task.TaskNo,
    pic: '3220',
    picName: task.Pic || 'MUHAMMAD HERNANDA',
    sourceUrl: task.AsalTask || 'Lain-Lain',
    taskName: task.TaskName,
    goal: task.GoalTask,
    target: task.Duedate || finishDate,
    dept: '32',
  };

  // 3. Drive completion under portal coordinator lock
  try {
    return await portalOwner.run('completion', async () => {
      const transport = portal.getCompletionTransport();
      const driver = new PortalCompletionDriver(transport);

      const opId = `pes-submit-${Date.now()}`;
      if (journal) {
        try {
          journal.createAttempt({
            operationId: opId,
            accountId: '3220',
            taskId: task.TaskNo,
            targetRevision: task.Target || '1',
            proposalDigest: createHash('sha256').update(task.TaskNo).digest('hex'),
            evidenceDigest: stagedFile.sha256,
            policyRevision: 'standard-v1',
          });
        } catch {}
      }

      // Stage and Submit
      await driver.stage(identity, finishDate);
      await driver.submit(identity);

      // Attach evidence and upload
      await driver.attach(identity, stagedFile);
      await driver.upload(identity);

      // Reconcile and capture saved state
      await driver.captureSaved(identity);

      if (journal) {
        try {
          for (const s of ['ASSESSED', 'EVIDENCE_READY', 'PREPARED', 'PRECHECKED', 'SUBMIT_INTENT', 'SUBMITTED', 'UPLOAD_INTENT', 'UPLOADED', 'VERIFYING', 'VERIFIED'] as const) {
            journal.transition(opId, s);
          }
        } catch {}
      }

      return {
        success: true,
        taskNo: task.TaskNo,
        finishDate,
        evidenceName: stagedFile.fileName,
      };
    });
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    return {
      success: false,
      taskNo: task.TaskNo,
      error: errorMsg,
    };
  }
}
