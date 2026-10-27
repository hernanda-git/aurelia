import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { inflateSync } from 'node:zlib';
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync, lstatSync, fstatSync, constants } from 'node:fs';
import { join, resolve, dirname, isAbsolute, parse } from 'node:path';

export interface EvidenceProvenance { taskKey: string; source: string; capturedAt: string }
export interface EvidenceIntake { taskKey: string; mediaType: 'image/png'; bytes: Uint8Array; provenance: EvidenceProvenance }
export interface StagedCompletionEvidence { taskKey: string; mediaType: 'image/png'; sha256: string; byteLength: number; path: string; provenance: EvidenceProvenance }
export const MAX_COMPLETION_EVIDENCE_BYTES = 10 * 1024 * 1024;
export const MAX_COMPLETION_EVIDENCE_DIMENSION = 8192;
export const MAX_COMPLETION_EVIDENCE_DECODED_BYTES = 64 * 1024 * 1024;
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function validateProvenance(taskKey: string, provenance: EvidenceProvenance): void {
 if (typeof taskKey !== 'string' || !taskKey.trim() || taskKey.length > 2048 || /[\x00-\x1f]/.test(taskKey)
  || !provenance || provenance.taskKey !== taskKey || typeof provenance.source !== 'string' || !provenance.source.trim()
  || provenance.source.length > 2048 || typeof provenance.capturedAt !== 'string'
  || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(provenance.capturedAt)
  || !Number.isFinite(Date.parse(provenance.capturedAt))) throw new Error('Invalid task provenance');
}
function validatePng(bytes: Buffer): void {
 if (bytes.length <= 8 || bytes.length > MAX_COMPLETION_EVIDENCE_BYTES || !bytes.subarray(0, 8).equals(pngSignature)) throw new Error('Invalid PNG magic or size');
 if (bytes.length < 33 || bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error('Invalid PNG header');
 if (bytes[24] !== 8 || ![2, 6].includes(bytes[25]) || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28] !== 0) throw new Error('Unsupported PNG representation: require non-interlaced 8-bit RGB/RGBA');
 const width = bytes.readUInt32BE(16); const height = bytes.readUInt32BE(20);
 // Conservatively reserve eight bytes per pixel plus scanline filters before
 // allocation; both raw scanlines and normalized RGBA fit this image budget.
 if (!width || !height || width > MAX_COMPLETION_EVIDENCE_DIMENSION || height > MAX_COMPLETION_EVIDENCE_DIMENSION
  || (width * 8 + 1) * height > MAX_COMPLETION_EVIDENCE_DECODED_BYTES) throw new Error('PNG dimensions exceed decode resource limit');
 const compressedParts: Buffer[] = [];
 let ended = false; let chunkCount = 0;
 // This is only a bounded envelope inspection, not a PNG codec. Pixel/filter/CRC
 // validation is delegated to pngjs; decompression is delegated to Node zlib.
 for (let offset = 8; offset < bytes.length;) {
  if (++chunkCount > 4096) throw new Error('PNG chunk limit exceeded');
  if (bytes.length - offset < 12) throw new Error('Truncated PNG chunk');
  const length = bytes.readUInt32BE(offset); const type = bytes.toString('ascii', offset + 4, offset + 8);
  if (!['IHDR', 'IDAT', 'IEND'].includes(type)) throw new Error('Unsupported PNG chunk');
  if (length > bytes.length - offset - 12) throw new Error('Truncated PNG chunk');
  if (ended || (type === 'IHDR' && offset !== 8)) throw new Error('Invalid PNG chunk structure');
  if (type === 'IDAT') compressedParts.push(bytes.subarray(offset + 8, offset + 8 + length));
  if (type === 'IEND') {
   if (length !== 0 || compressedParts.length === 0 || offset + 12 !== bytes.length) throw new Error('Invalid PNG end structure');
   ended = true;
  }
  offset += length + 12;
 }
 if (!ended) throw new Error('Incomplete PNG chunk structure');
 try {
  const compressed = Buffer.concat(compressedParts);
  const expected = (width * (bytes[25] === 6 ? 4 : 3) + 1) * height;
  // pngjs's sync inflater can stop at the expected output, missing stream checksum
  // and truncation errors. Node's trusted inflater must finish the entire stream,
  // with a hard output cap, before pngjs performs CRC/filter/pixel decoding.
  const inflated = inflateSync(compressed, { maxOutputLength: expected, info: true }) as unknown as { buffer: Buffer; engine: { bytesWritten: number } };
  if (inflated.buffer.length !== expected || inflated.engine.bytesWritten !== compressed.length) throw new Error('Invalid PNG data stream length');
  PNG.sync.read(bytes, { checkCRC: true });
 } catch { throw new Error('Invalid readable PNG image or bounded data stream'); }
}
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
function syncDirectory(path: string): void {
 // Node on Windows cannot flush directory handles. File fsync remains mandatory;
 // process-crash recovery is supported, but power-loss metadata durability is not promised there.
 let fd: number;
 try { fd = openSync(path, 'r'); } catch (error) {
  if (process.platform === 'win32' && ['EPERM', 'EISDIR', 'EINVAL', 'ENOTSUP'].includes((error as NodeJS.ErrnoException).code ?? '')) return;
  throw error;
 }
 try { fsyncSync(fd); } catch (error) {
  if (!(process.platform === 'win32' && ['EPERM', 'EISDIR', 'EINVAL', 'ENOTSUP'].includes((error as NodeJS.ErrnoException).code ?? ''))) throw error;
 } finally { closeSync(fd); }
}
function safeDirectory(path: string, create = false): string {
 if (typeof path !== 'string' || !isAbsolute(path) || /^[\\/]{2}/.test(path) || /[\x00-\x1f]/.test(path)
  || path.split(/[\\/]/).some((p, n) => p === '.' || p === '..' || /[. ]$/.test(p) || (n > 0 && /[:*?"<>|]/.test(p)))) throw new Error('Unsafe storage root path');
 const full = resolve(path); if (full === parse(full).root) throw new Error('Unsafe volume root');
 const ancestors: string[] = []; for (let p = full; ; p = dirname(p)) { ancestors.unshift(p); if (p === dirname(p)) break; }
 for (const p of ancestors) {
  let st; try { st = lstatSync(p); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (!st && create) { mkdirSync(p, { mode: 0o700 }); st = lstatSync(p); }
  if (st && (st.isSymbolicLink() || !st.isDirectory())) throw new Error('Unsafe storage root link');
  if (!st && !create) throw new Error('Missing storage root');
 }
 if (process.platform !== 'win32' && (lstatSync(full).mode & 0o022)) throw new Error('Unsafe writable storage root');
 return full;
}
function safeRead(path: string, max: number): Buffer {
 safeDirectory(dirname(path));
 const before = lstatSync(path);
 if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) throw new Error('Unsafe artifact link');
 if (before.size > max) throw new Error('Artifact exceeds size limit');
 const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
 try {
  const opened = fstatSync(fd);
  if (!opened.isFile() || opened.nlink !== 1 || opened.ino !== before.ino || opened.dev !== before.dev || opened.size !== before.size) throw new Error('Unsafe artifact identity');
  const bytes = readFileSync(fd); const after = lstatSync(path);
  if (after.isSymbolicLink() || after.nlink !== 1 || after.ino !== opened.ino || after.dev !== opened.dev || bytes.length > max) throw new Error('Unsafe artifact link changed');
  return bytes;
 } finally { closeSync(fd); }
}
/**
 * Trusted main-process byte intake only; never expose this class directly to a renderer/agent transport.
 * root must be a dedicated application-owned directory with account-restricted ACLs on Windows.
 * Rejects lexical/link hazards but does not provision/audit Windows ACLs or defeat same-user races.
 * Provenance is bound to the task and sealed, not independently authenticated here: intake must attest it.
 * Requires bounded pngjs decoding of non-interlaced 8-bit RGB/RGBA PNGs with
 * IHDR/IDAT/IEND only: <=8192 per axis, <=64 MiB conservative image budget,
 * <=4096 chunks, <=10 MiB encoded bytes. Unsupported metadata/animation fails closed.
 * Complete zlib streams and pixel decoding establish readability, not provenance
 * authenticity, secret/content review, or proof of task completion.
 * validate() rechecks the sealed bytes immediately before upload; callers must not accept a replacement path.
 */
export class CompletionEvidenceStore {
 readonly root: string;
 constructor(root: string) { this.root = safeDirectory(root, true); }
 stage(input: EvidenceIntake): StagedCompletionEvidence {
  if (!input || Object.keys(input).some(k => !['taskKey', 'mediaType', 'bytes', 'provenance'].includes(k)) || input.mediaType !== 'image/png' || !(input.bytes instanceof Uint8Array)) throw new Error('Trusted PNG byte intake required; paths forbidden');
  validateProvenance(input.taskKey, input.provenance);
  if (input.bytes.byteLength > MAX_COMPLETION_EVIDENCE_BYTES) throw new Error('PNG too large');
  const bytes = Buffer.from(input.bytes); validatePng(bytes); const sha256 = hash(bytes);
  const dir = safeDirectory(join(this.root, hash(input.taskKey)), true);
  const path = join(dir, `${sha256}.png`); const fd = openSync(path, 'wx', 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
  const provenance = Object.freeze({ taskKey: input.provenance.taskKey, source: input.provenance.source, capturedAt: input.provenance.capturedAt });
  const ref = Object.freeze({ taskKey: input.taskKey, mediaType: 'image/png' as const, sha256, byteLength: bytes.length, path, provenance });
  const manifest = openSync(path.replace(/\.png$/, '.json'), 'wx', 0o600);
  try { writeFileSync(manifest, `${JSON.stringify(ref)}\n`); fsyncSync(manifest); } finally { closeSync(manifest); }
  syncDirectory(dir);
  this.validate(ref, input.taskKey);
  return ref;
 }
 validate(ref: StagedCompletionEvidence, taskKey: string): Buffer {
  if (!ref || ref.taskKey !== taskKey || ref.mediaType !== 'image/png' || !/^[a-f0-9]{64}$/.test(ref.sha256) || !Number.isSafeInteger(ref.byteLength) || ref.byteLength > MAX_COMPLETION_EVIDENCE_BYTES) throw new Error('Invalid evidence reference');
  validateProvenance(taskKey, ref.provenance);
  const path = join(this.root, hash(taskKey), `${ref.sha256}.png`);
  if (ref.path !== path) throw new Error('Evidence path is not owned');
  const manifest = safeRead(path.replace(/\.png$/, '.json'), 16384).toString('utf8');
  const canonical = { taskKey: ref.taskKey, mediaType: ref.mediaType, sha256: ref.sha256, byteLength: ref.byteLength, path, provenance: { taskKey: ref.provenance.taskKey, source: ref.provenance.source, capturedAt: ref.provenance.capturedAt } };
  if (manifest !== `${JSON.stringify(canonical)}\n`) throw new Error('Evidence manifest seal mismatch');
  const bytes = safeRead(path, MAX_COMPLETION_EVIDENCE_BYTES);
  if (bytes.length !== ref.byteLength || hash(bytes) !== ref.sha256) throw new Error('Staged evidence hash or size changed');
  validatePng(bytes);
  return bytes;
 }
}
