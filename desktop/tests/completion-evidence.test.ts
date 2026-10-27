import { afterEach, expect, test, vi } from 'vitest';
import * as fs from 'node:fs';
import { PNG } from 'pngjs';
import { crc32, deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
vi.mock('node:fs', async importOriginal => {
 const actual = await importOriginal<typeof import('node:fs')>();
 return { ...actual, openSync: vi.fn(actual.openSync), fsyncSync: vi.fn(actual.fsyncSync) };
});
import { mkdtempSync, rmSync, writeFileSync, readFileSync, linkSync, symlinkSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { CompletionEvidenceStore } from '../src/main/completion-evidence';
const roots: string[] = [];
function setup() { const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'pes-evidence-')); roots.push(dir); return new CompletionEvidenceStore(join(dir, 'evidence')); }
const png = readFileSync(new URL('./fixtures/completion/valid-image.png', import.meta.url));
const intake = () => ({ taskKey: '3220/M03990/Task. IT/1026', mediaType: 'image/png' as const, bytes: Buffer.from(png), provenance: { taskKey: '3220/M03990/Task. IT/1026', source: 'trusted-test-capture', capturedAt: '2026-10-26T06:00:00Z' } });
afterEach(() => roots.splice(0).forEach(r => rmSync(r, { recursive: true, force: true })));
test('rejects signature-only evidence rather than sealing unreadable bytes', () => {
 const s = setup();
 expect(() => s.stage({ ...intake(), bytes: Buffer.concat([png.subarray(0, 8), Buffer.from([0])]) })).toThrow(/PNG|image/i);
});
test.each([[8193, 1], [1, 8193], [8192, 8192], [0, 2]])('bounds PNG dimensions %ix%i before invoking the decoder', (width, height) => {
 const s = setup(); const bytes = Buffer.from(png); bytes.writeUInt32BE(width, 16); bytes.writeUInt32BE(height, 20);
 bytes.writeUInt32BE(crc32(bytes.subarray(12, 29)), 29);
 const decoder = vi.spyOn(PNG.sync, 'read').mockImplementation(() => { throw new Error('Decoder reached before resource gate'); });
 try {
  expect(() => s.stage({ ...intake(), bytes })).toThrow(/dimension|limit/i);
  expect(decoder).not.toHaveBeenCalled();
 } finally { decoder.mockRestore(); }
});
function chunk(type: string, data = Buffer.alloc(0)): Buffer {
 const header = Buffer.alloc(8); header.writeUInt32BE(data.length); header.write(type, 4, 'ascii');
 const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([header.subarray(4), data])));
 return Buffer.concat([header, data, checksum]);
}
test.each(['acTL', 'teXt'])('rejects unsupported %s content before invoking the decoder', type => {
 const s = setup(); const bytes = Buffer.concat([png.subarray(0, 33), chunk(type, Buffer.alloc(8)), png.subarray(33)]);
 const decoder = vi.spyOn(PNG.sync, 'read');
 try {
  expect(() => s.stage({ ...intake(), bytes })).toThrow(/unsupported/i);
  expect(decoder).not.toHaveBeenCalled();
 } finally { decoder.mockRestore(); }
});
test.each([[28, 1], [24, 16], [25, 0], [26, 1], [27, 1]])('rejects unsupported PNG representation byte %i=%i before decode', (offset, value) => {
 const s = setup(); const bytes = Buffer.from(png); bytes[offset] = value; bytes.writeUInt32BE(crc32(bytes.subarray(12, 29)), 29);
 const decoder = vi.spyOn(PNG.sync, 'read').mockImplementation(() => { throw new Error('Unsafe decoder branch reached'); });
 try {
  expect(() => s.stage({ ...intake(), bytes })).toThrow(/unsupported/i);
  expect(decoder).not.toHaveBeenCalled();
 } finally { decoder.mockRestore(); }
});
test.each(['overlong-inflate', 'truncated-zlib', 'bad-adler', 'trailing-zlib-data'])('rejects incomplete or oversized compressed PNG data: %s', mode => {
 const s = setup();
 const raw = Buffer.alloc(mode === 'overlong-inflate' ? 1024 * 1024 : 18);
 let compressed = deflateSync(raw);
 if (mode === 'truncated-zlib') compressed = compressed.subarray(0, -4);
 if (mode === 'bad-adler') { compressed = Buffer.from(compressed); compressed[compressed.length - 1] ^= 1; }
 if (mode === 'trailing-zlib-data') compressed = Buffer.concat([compressed, Buffer.from([0, 0, 0])]);
 const bytes = Buffer.concat([png.subarray(0, 33), chunk('IDAT', compressed), chunk('IEND')]);
 expect(() => s.stage({ ...intake(), bytes })).toThrow(/PNG|image|inflate|stream/i);
});
test.each(['duplicate-header', 'missing-end', 'end-payload', 'chunk-after-end', 'missing-data'])('rejects invalid PNG chunk structure before decoder: %s', mode => {
 const s = setup();
 const header = png.subarray(8, 33); const idat = png.subarray(33, 62);
 const parts = mode === 'duplicate-header' ? [header, header, idat, chunk('IEND')]
  : mode === 'missing-end' ? [header, idat]
  : mode === 'end-payload' ? [header, idat, chunk('IEND', Buffer.from([0]))]
  : mode === 'chunk-after-end' ? [header, idat, chunk('IEND'), chunk('IDAT')]
  : [header, chunk('IEND')];
 const decoder = vi.spyOn(PNG.sync, 'read');
 try {
  expect(() => s.stage({ ...intake(), bytes: Buffer.concat([png.subarray(0, 8), ...parts]) })).toThrow(/structure/i);
  expect(decoder).not.toHaveBeenCalled();
 } finally { decoder.mockRestore(); }
});
test('bounds chunk count before invoking decoder or collecting unbounded views', () => {
 const s = setup(); const bytes = Buffer.concat([png.subarray(0, 33), ...Array.from({ length: 4096 }, () => chunk('IDAT')), png.subarray(33)]);
 const decoder = vi.spyOn(PNG.sync, 'read');
 try {
  expect(() => s.stage({ ...intake(), bytes })).toThrow(/chunk limit/i);
  expect(decoder).not.toHaveBeenCalled();
 } finally { decoder.mockRestore(); }
});
test.each(['signature', 'header-truncated', 'data-truncated', 'bad-header-crc', 'bad-data-crc', 'bad-end-crc', 'invalid-filter'])('rejects unreadable PNG corruption: %s', mode => {
 const s = setup(); let bytes = Buffer.from(png);
 if (mode === 'signature') bytes = bytes.subarray(0, 8);
 if (mode === 'header-truncated') bytes = bytes.subarray(0, 30);
 if (mode === 'data-truncated') bytes = bytes.subarray(0, 50);
 if (mode === 'bad-header-crc') bytes[29] ^= 1;
 if (mode === 'bad-data-crc') bytes[58] ^= 1;
 if (mode === 'bad-end-crc') bytes[bytes.length - 1] ^= 1;
 if (mode === 'invalid-filter') { const raw = Buffer.alloc(18); raw[0] = 5; bytes = Buffer.concat([png.subarray(0, 33), chunk('IDAT', deflateSync(raw)), chunk('IEND')]); }
 expect(() => s.stage({ ...intake(), bytes })).toThrow(/PNG|image/i);
});
test('re-decodes final owned bytes even when reference, digest and manifest agree', () => {
 const s = setup(); const original = s.stage(intake()); const bytes = Buffer.concat([png.subarray(0, 8), Buffer.from([0])]);
 const sha256 = createHash('sha256').update(bytes).digest('hex');
 const ref = { ...original, sha256, byteLength: bytes.length, path: join(dirname(original.path), `${sha256}.png`) };
 writeFileSync(ref.path, bytes); writeFileSync(ref.path.replace(/\.png$/, '.json'), `${JSON.stringify(ref)}\n`);
 expect(() => new CompletionEvidenceStore(s.root).validate(ref, ref.taskKey)).toThrow(/PNG|image/i);
});
test('decodes real pixels at intake, after persistence and on restart', () => {
 const s = setup(); const decoder = vi.spyOn(PNG.sync, 'read');
 try {
  const ref = s.stage(intake());
  expect(decoder).toHaveBeenCalledTimes(2);
  expect(new CompletionEvidenceStore(s.root).validate(ref, ref.taskKey)).toEqual(png);
  expect(decoder).toHaveBeenCalledTimes(3);
  expect(decoder.mock.results.every(result => result.type === 'return' && result.value.width === 2 && result.value.height === 2 && result.value.data.length === 16)).toBe(true);
 } finally { decoder.mockRestore(); }
});
test('accepts a real RGB PNG with multiple contiguous data chunks', () => {
 const s = setup(); const rgb = PNG.sync.write({ width: 1, height: 1, data: Buffer.from([10, 20, 30, 255]) } as PNG, { colorType: 2 });
 const length = rgb.readUInt32BE(33); const data = rgb.subarray(41, 41 + length);
 const bytes = Buffer.concat([rgb.subarray(0, 33), chunk('IDAT', data.subarray(0, 3)), chunk('IDAT', data.subarray(3)), chunk('IEND')]);
 const ref = s.stage({ ...intake(), bytes });
 expect(s.validate(ref, ref.taskKey)).toEqual(bytes);
});
test('flushes evidence parent entries before returning a sealed reference', () => {
 const s = setup(); vi.mocked(fs.openSync).mockClear(); const ref = s.stage(intake());
 expect(vi.mocked(fs.openSync).mock.calls.some(args => args[0] === dirname(ref.path) && args[1] === 'r')).toBe(true);
});
test('persists provenance seal and rejects a changed manifest reference after restart', () => {
 const s = setup(); const ref = s.stage(intake());
 expect(Object.isFrozen(ref)).toBe(true); expect(Object.isFrozen(ref.provenance)).toBe(true);
 const restarted = new CompletionEvidenceStore(s.root);
 expect(() => restarted.validate({ ...ref, provenance: { ...ref.provenance, source: 'invented' } }, ref.taskKey)).toThrow(/manifest|seal/i);
 const manifest = ref.path.replace(/\.png$/, '.json'); rmSync(manifest);
 expect(() => restarted.validate(ref, ref.taskKey)).toThrow();
});
test.each(['hardlink', 'junction', 'file-symlink'])('rejects staged artifacts with %s hazards', mode => {
 const s = setup(); const ref = s.stage(intake());
 if (mode === 'hardlink') linkSync(ref.path, join(roots.at(-1)!, 'external-copy'));
 if (mode === 'file-symlink') { const outside = join(roots.at(-1)!, 'outside'); mkdirSync(outside); rmSync(ref.path); symlinkSync(outside, ref.path, 'junction'); }
 if (mode === 'junction') { const outside = join(roots.at(-1)!, 'outside'); mkdirSync(outside); writeFileSync(join(outside, `${ref.sha256}.png`), png); const dir = dirname(ref.path); rmSync(dir, { recursive: true }); symlinkSync(outside, dir, 'junction'); }
 expect(() => s.validate(ref, ref.taskKey)).toThrow(/link|safe/i);
});
test.each(['relative', 'traversal', 'junction'])('rejects unsafe root %s', mode => {
 const s = setup();
 const bad = mode === 'relative' ? 'relative-evidence' : mode === 'traversal' ? `${s.root}/../escape` : mode === 'device' ? '\\\\?\\C:\\evidence' : mode === 'unc' ? '//server/share/evidence' : mode === 'volume' ? 'C:/' : join(roots.at(-1)!, 'junction');
 if (mode === 'junction') symlinkSync(s.root, bad, 'junction');
 expect(() => new CompletionEvidenceStore(bad)).toThrow(/root|path|link|safe/i);
});
test('revalidation rejects changed bytes and never reads arbitrary reference paths', () => {
 const s = setup(); const ref = s.stage(intake());
 expect(() => s.validate(ref, 'other-task')).toThrow();
 expect(() => s.validate({ ...ref, path: 'C:/Users/test/profile/Login Data' }, ref.taskKey)).toThrow(/path|owned/i);
 expect(() => s.validate({ ...ref, sha256: '../escape' }, ref.taskKey)).toThrow();
 writeFileSync(ref.path, Buffer.concat([png, Buffer.from('changed')]));
 expect(() => s.validate(ref, ref.taskKey)).toThrow(/hash|size/i);
});
test.each(['path', 'mime', 'magic', 'oversize', 'unrelated', 'missing-provenance'])('rejects invalid byte intake: %s', mode => {
 const s = setup(); const i: any = intake();
 if (mode === 'path') { delete i.bytes; i.path = 'C:/Users/test/profile/Login Data'; }
 if (mode === 'mime') i.mediaType = 'image/jpeg';
 if (mode === 'magic') i.bytes = Buffer.from('not a png');
 if (mode === 'oversize') i.bytes = Buffer.concat([png, Buffer.alloc(10 * 1024 * 1024)]);
 if (mode === 'unrelated') i.provenance.taskKey = 'another-task';
 if (mode === 'missing-provenance') delete i.provenance;
 expect(() => s.stage(i)).toThrow();
});
test('stages owned PNG bytes under task and content hashes and validates after restart', () => {
 const s = setup(); const ref = s.stage(intake());
 expect(ref.sha256).toMatch(/^[a-f0-9]{64}$/); expect(ref.path).toContain(`${ref.sha256}.png`);
 expect(readFileSync(ref.path)).toEqual(png);
 expect(new CompletionEvidenceStore(s.root).validate(ref, intake().taskKey)).toEqual(png);
 expect(() => s.stage(intake())).toThrow(/exist|immutable/i);
});
