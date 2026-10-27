const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtempSync, writeFileSync, readFileSync, rmSync, readdirSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { createInterface } = require('node:readline');

const entry = resolve(__dirname, '../dist/main/agent/stdio.js');
const snapshot = { id: 'isolated-mcp', source: 'imported', retrievedAt: '2026-10-20T06:00:00Z', scope: { from: '2026-10-01', to: '2026-10-31', pic: 'MUHAMMAD HERNANDA', department: 'IT' }, totalScanned: 2, tasks: [], sourceRows: [
  ['1', 'TASK-UPDATE', '', 'MUHAMMAD HERNANDA', '', 'IT', 'Update row', 'Goal', '', '', '', '', 'Update Task', '', '', ''],
  ['2', 'TASK-SOLVED', '', 'MUHAMMAD HERNANDA', '', 'IT', 'Solved row', 'Goal', '', '', '', '', 'Solved', '', '23-Okt-2026', 'e.png'],
] };

async function withServer(value, body) {
  const dir = mkdtempSync(join(process.env.TMPDIR || resolve(__dirname, '../verification'), 'pes-mcp-'));
  const file = join(dir, 'snapshot.json');
  const original = JSON.stringify(value);
  writeFileSync(file, original);
  const child = spawn(process.execPath, [entry, '--snapshot', file], { stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map();
  let sequence = 0, stderr = '', invalidOutput = null;
  child.stderr.on('data', chunk => { stderr += chunk; });
  const lines = createInterface({ input: child.stdout });
  lines.on('line', line => {
    try {
      const message = JSON.parse(line);
      assert.equal(message.jsonrpc, '2.0');
      if (pending.has(message.id)) { const { resolve: done, timer } = pending.get(message.id); clearTimeout(timer); pending.delete(message.id); done(message); }
    } catch (error) { invalidOutput = error; }
  });
  child.on('exit', code => {
    for (const { reject, timer } of pending.values()) { clearTimeout(timer); reject(new Error(`Adapter exited ${code}: ${stderr}`)); }
    pending.clear();
  });
  async function rpc(method, params = {}) {
    const id = ++sequence;
    return new Promise((done, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}: ${stderr}`)); }, 10000);
      pending.set(id, { resolve: done, reject, timer });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }
  const call = async (name, args = {}) => {
    const reply = await rpc('tools/call', { name, arguments: args });
    if (reply.error) return { rpcError: reply.error };
    return { ...reply.result, data: reply.result.content?.[0]?.text ? JSON.parse(reply.result.content[0].text) : null };
  };
  try {
    const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'isolated-test', version: '1.0.0' } });
    assert.ok(init.result, JSON.stringify(init));
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    await body({ rpc, call });
    assert.equal(invalidOutput, null, 'stdout must contain only MCP JSON-RPC');
    assert.equal(stderr, '', 'successful adapter must not emit errors');
    assert.equal(readFileSync(file, 'utf8'), original, 'snapshot must not be changed');
    assert.deepEqual(readdirSync(dir), ['snapshot.json'], 'adapter must not create cache files');
  } finally {
    child.kill(); lines.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

test('actual assessment reports hypothetical facts separately from unverified imported cache', async () => {
  await withServer(snapshot, async ({ call }) => {
    const now = '2026-10-26T06:00:00Z';
    const identity = { listTaskNo: 'TASK-1', detailTaskNo: 'TASK-1', pic: '3220', department: '32', originUrl: 'https://example.invalid/task/1' };
    const date = { iso: '2026-10-23', raw: '23-Okt-2026' };
    const provenance = { kind: 'task_system', uri: identity.originUrl, taskUrl: identity.originUrl, revision: '1', capturedAt: now };
    const assessment = { schemaVersion: 1, now,
      policy: { revision: 'completion-policy-v1', approvedBy: 'claimed approval', approvedAt: now, enabled: true, finishDatePolicy: 'target_date', timezone: 'Asia/Jakarta', maxLiveAgeMs: 60000, maxPreflightAgeMs: 10000, maxSourceAgeMs: 60000, maxEvidenceAgeMs: 60000, maxAttachmentBytes: 5000, allowedMimeTypes: ['image/png'], taskRules: [{ taskType: 'backend', goalScope: 'be_development', requiredChecks: ['tests'], minAuthoritativeSources: 1, allowedSourceKinds: ['task_system'], allowReadyForQa: true }] },
      proposal: { proposalId: '1', policyRevision: 'completion-policy-v1', identity, taskType: 'backend', goalScope: 'be_development', rawGoal: 'BE done', sourceTaskUrl: identity.originUrl, targetDate: date, proposedPesFinishDate: date, observedCompletedAt: now, association: { identity, verifiedAt: now, provenance }, sourceFacts: [{ sourceTaskUrl: identity.originUrl, goalScope: 'be_development', checks: ['tests'], state: 'completed', observedAt: now, provenance }], evidence: { identity, fileName: 'e.png', mimeType: 'image/png', byteLength: 10, sha256: 'a'.repeat(64), capturedAt: now, provenance, kind: 'original_screenshot', secretsReviewed: true } },
      live: { identity, taskType: 'backend', goalScope: 'be_development', rawGoal: 'BE done', sourceTaskUrl: identity.originUrl, targetDate: date, listStatus: 'Open', detailStatus: 'Open', updateEnabled: true, capturedAt: now, preflightAt: now, underLock: true, priorAttempt: 'none', unresolvedDiscrepancy: false } };
    const result = (await call('pes_assess_completion', { assessment })).data;
    assert.equal(result.eligible, true);
    assert.equal(result.authorizedToCommit, false);
    assert.deepEqual(result.reasonCodes, ['AGENT_ENROLLMENT_UNVERIFIED']);
    assert.equal(result.inputTrust, 'client_assertions');
    assert.equal(result.sourceVerification, 'not_performed');
    assert.equal(result.cacheBinding, 'not_verified');
    assert.equal(result.snapshot.source, 'imported');
    assert.equal(result.snapshot.stale, true);
    assessment.live.listStatus='Approval';assessment.live.detailStatus='T1';assessment.live.targetStatus='Approved';
    const approved=(await call('pes_assess_completion',{assessment})).data;
    assert.equal(approved.eligible,true);assert.equal(approved.authorizedToCommit,false);
    assessment.live.listStatus = 'Update Task';
    const blocked = (await call('pes_assess_completion', { assessment })).data;
    assert.equal(blocked.eligible, false);
    assert.ok(blocked.reasonCodes.includes('NOT_WRITABLE'));
  });
});

test('stdio rejects unadvertised write tools, paths, unknown keys and unbounded arguments', async () => {
  await withServer(snapshot, async ({ rpc, call }) => {
    const rejected = async (name, args) => {
      const result = await call(name, args);
      assert.ok(result.isError || result.rpcError, `${name} unexpectedly accepted ${JSON.stringify(args).slice(0, 100)}`);
    };
    for (const name of ['pes_commit_completion', 'pes_prepare_write', 'pes_enroll', 'pes_upload', 'read_file', 'execute_script']) await rejected(name, {});
    for (const args of [{ path: 'C:/not-a-cache.json' }, { limit: 101 }, { limit: 0 }, { limit: 1.5 }, { offset: -1 }, { offset: 100001 }, { limit: '10' }, { status: 'x'.repeat(201) }]) await rejected('pes_list_candidates', args);
    await rejected('pes_get_completion', { taskNo: 'TASK-UPDATE', path: 'C:/another.json' });
    await rejected('pes_get_completion', { taskNo: 'x'.repeat(201) });
    await rejected('pes_get_completion', { taskNo: 'missing-task' });
    await rejected('pes_assess_completion', { assessment: {} });
    await rejected('pes_assess_completion', { assessment: {}, sourceVerified: true });
    await rejected('pes_completion_readiness', { authorizedToCommit: true });
    assert.ok((await rpc('pes/commit', {})).error);
    const page = (await call('pes_list_candidates', { offset: 1, limit: 1 })).data;
    assert.equal(page.total, 2); assert.equal(page.candidates.length, 1); assert.equal(page.hasMore, false);
    const filter = (await call('pes_list_candidates', { status: 'Update Task', limit: 1 })).data;
    assert.equal(filter.total, 1); assert.equal(filter.candidates[0].Status, 'Update Task');
    assert.deepEqual((await rpc('ping')).result, {});
  });
});

test('legacy cache without sourceRows clearly declares partial scope', async () => {
  const partial = structuredClone(snapshot); delete partial.sourceRows;
  await withServer(partial, async ({ call }) => {
    const result = (await call('pes_completion_readiness')).data;
    assert.equal(result.snapshot.scopeCoverage, 'partial_active_tasks_only');
    assert.equal(result.snapshot.rawRowsAvailable, false);
    assert.equal(result.snapshot.availableRows, 0);
    assert.equal(result.snapshot.totalScanned, 2);
    assert.equal(result.authorizedToCommit, false);
    assert.equal((await call('pes_list_candidates')).data.total, 0);
  });
});

test('startup without explicit cache path fails safely with no stdout or profile discovery', async () => {
  const child = spawn(process.execPath, [entry], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
  const code = await new Promise(resolve => child.once('exit', resolve));
  assert.equal(code, 1); assert.equal(stdout, ''); assert.ok(stderr.includes('--snapshot'));
  assert.ok(!stderr.includes(process.env.USERPROFILE || 'secret-profile'));
});

test('actual stdio initialize, ping, exact read-only tools and cached raw status', async () => {
  await withServer(snapshot, async ({ rpc, call }) => {
    assert.deepEqual((await rpc('ping')).result, {});
    const listed = (await rpc('tools/list')).result.tools;
    assert.deepEqual(listed.map(tool => tool.name).sort(), ['pes_assess_completion', 'pes_completion_readiness', 'pes_get_completion', 'pes_list_candidates']);
    for (const tool of listed) assert.equal(tool.annotations.readOnlyHint, true);
    const readiness = (await call('pes_completion_readiness')).data;
    assert.equal(readiness.mode, 'assessment-only');
    assert.equal(readiness.authorizedToCommit, false);
    assert.equal(readiness.sourcePath.default, null);
    assert.equal(readiness.snapshot.source, 'imported');
    const candidates = (await call('pes_list_candidates')).data;
    assert.equal(candidates.total, 2);
    assert.equal(candidates.candidates[0].Status, 'Update Task');
    const fetched = (await call('pes_get_completion', { taskNo: 'TASK-UPDATE' })).data;
    assert.deepEqual(fetched.rawCells, snapshot.sourceRows[0]);
    assert.equal(fetched.completionVerification, 'not_performed');
  });
});
