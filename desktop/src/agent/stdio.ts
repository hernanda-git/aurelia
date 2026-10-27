import { openSync, fstatSync, readFileSync, closeSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { assessAgentCompletion, createAssessmentWorkspace } from './assessment';

const text = z.string().min(1).max(4096);
const short = z.string().min(1).max(200);
const time = z.string().min(20).max(40);
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const checks = z.array(short).max(50);
const identity = z.object({ listTaskNo: short, detailTaskNo: short, pic: short, department: short, originUrl: text }).strict();
const date = z.object({ iso: z.string().max(10), raw: short }).strict();
const provenance = z.object({ kind: z.enum(['task_system', 'execution_report', 'user_confirmation', 'assistant_summary', 'rendered_summary']), uri: text, taskUrl: text, revision: short, capturedAt: time }).strict();
const assessment = z.object({
  schemaVersion: z.literal(1), now: time,
  policy: z.object({ revision: short, approvedBy: short, approvedAt: time, enabled: z.boolean(), finishDatePolicy: short, timezone: short,
    maxLiveAgeMs: positive, maxPreflightAgeMs: positive, maxSourceAgeMs: positive, maxEvidenceAgeMs: positive, maxAttachmentBytes: positive,
    allowedMimeTypes: z.array(short).min(1).max(20), taskRules: z.array(z.object({ taskType: short, goalScope: short, requiredChecks: checks,
      minAuthoritativeSources: positive, allowedSourceKinds: z.array(z.enum(['task_system', 'execution_report'])).min(1).max(2), allowReadyForQa: z.boolean() }).strict()).min(1).max(20),
  }).strict(),
  proposal: z.object({ proposalId: short, policyRevision: short, identity, taskType: short, goalScope: short, rawGoal: text, sourceTaskUrl: text,
    targetDate: date, proposedPesFinishDate: date, observedCompletedAt: time,
    association: z.object({ identity, verifiedAt: time, provenance }).strict().nullable(),
    sourceFacts: z.array(z.object({ sourceTaskUrl: text, goalScope: short, checks, state: short, observedAt: time, provenance }).strict()).max(50),
    evidence: z.object({ identity, fileName: short, mimeType: short, byteLength: positive, sha256: z.string().regex(/^[a-f0-9]{64}$/), capturedAt: time,
      provenance, kind: z.enum(['original_screenshot', 'original_execution_report', 'approved_rendered_summary']), secretsReviewed: z.boolean() }).strict(),
  }).strict(),
  live: z.object({ identity, taskType: short, goalScope: short, rawGoal: text, sourceTaskUrl: text, targetDate: date,
    listStatus: short, detailStatus: short, updateEnabled: z.boolean(), capturedAt: time, preflightAt: time, underLock: z.boolean(),
    priorAttempt: z.enum(['none', 'submitted', 'uncertain', 'verified']), unresolvedDiscrepancy: z.boolean(), targetStatus: short.optional() }).strict(),
}).strict();
const listArguments = z.object({ offset: z.number().int().min(0).max(100000).optional(), limit: z.number().int().min(1).max(100).optional(), status: short.optional() }).strict();
const getArguments = z.object({ taskNo: short }).strict();
const assessArguments = z.object({ assessment }).strict();
const emptyArguments = z.object({}).strict();

/** Only startup can select one local cache file. No per-tool paths, script execution,
 * profile discovery, network access, write capability or persisted assessment journal. */
export async function startReadOnlyStdio(argv: string[] = process.argv.slice(2)): Promise<void> {
  if (argv.length !== 2 || argv[0] !== '--snapshot' || !isAbsolute(argv[1])) throw new Error('STARTUP_REQUIRES_EXPLICIT_ABSOLUTE_SNAPSHOT_PATH');
  let value: unknown;
  const fd = openSync(argv[1], 'r');
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.size > 16 * 1024 * 1024) throw new Error('SNAPSHOT_TOO_LARGE_OR_NOT_FILE');
    const bytes = readFileSync(fd);
    if (bytes.byteLength > 16 * 1024 * 1024) throw new Error('SNAPSHOT_TOO_LARGE_OR_NOT_FILE');
    value = JSON.parse(bytes.toString('utf8'));
  } finally { closeSync(fd); }
  const workspace = createAssessmentWorkspace(value);
  const server = new Server({ name: 'pes-read-only-completion', version: '1.0.0' }, { capabilities: { tools: {} } });
  const tools = [
    { name: 'pes_list_candidates', description: 'List cached raw rows, not verified completion candidates. Includes Update Task; cache may be imported/stale/partial.', schema: listArguments },
    { name: 'pes_assess_completion', description: 'Hypothetical deterministic policy assessment of client assertions, including claimed policy approval and provenance. Does not verify sources or authorize any commit.', schema: assessArguments },
    { name: 'pes_get_completion', description: 'Read one cached task and raw status. This is not a live completion outcome or verified readback.', schema: getArguments },
    { name: 'pes_completion_readiness', description: 'Report assessment-only readiness and cache limitations. Enrollment unverified; commits always disabled.', schema: emptyArguments },
  ];
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: tools.map(({ name, description, schema }) => ({ name, description,
    inputSchema: z.toJSONSchema(schema) as { type: 'object' }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } })) }));
  server.setRequestHandler(CallToolRequestSchema, async request => {
    const args = request.params.arguments ?? {};
    let result: unknown;
    try {
      switch (request.params.name) {
        case 'pes_list_candidates': result = workspace.list(listArguments.parse(args)); break;
        case 'pes_assess_completion': result = { ...assessAgentCompletion(assessArguments.parse(args).assessment), cacheBinding: 'not_verified', snapshot: workspace.readiness().snapshot }; break;
        case 'pes_get_completion': result = workspace.get(getArguments.parse(args).taskNo); break;
        case 'pes_completion_readiness': emptyArguments.parse(args); result = workspace.readiness(); break;
        default: return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'UNKNOWN_READ_ONLY_TOOL' }) }] };
      }
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: error instanceof z.ZodError ? 'INVALID_ARGUMENTS' : 'TASK_NOT_IN_SNAPSHOT' }) }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  });
  await server.connect(new StdioServerTransport(process.stdin, process.stdout, { maxBufferSize: 256 * 1024 }));
}

if (require.main === module) {
  startReadOnlyStdio().catch(() => {
    // Never disclose raw cache paths/content or put non-protocol output on stdout.
    process.stderr.write('PES read-only adapter startup failed; provide --snapshot <absolute-cache-snapshot.json>.\n');
    process.exitCode = 1;
  });
}
