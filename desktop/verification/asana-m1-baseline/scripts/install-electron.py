"""Verified alternative to a stalled npm Electron binary download.

Downloads the official release and verifies its SHA-256 against the installed,
lockfile-pinned Electron package before extracting. No credentials or privileges.
"""
from pathlib import Path
import hashlib
import json
import os
import shutil
import urllib.request
import zipfile

root = Path(__file__).resolve().parents[1]
pkg = root / 'node_modules/electron'
version = json.loads((pkg / 'package.json').read_text())['version']
name = f'electron-v{version}-win32-x64.zip'
cache = Path.home() / 'AppData/Local/hermes/cache/scratch/pes-electron'
cache.mkdir(parents=True, exist_ok=True)
archive = cache / name
expected = json.loads((pkg / 'checksums.json').read_text())[name]
if not archive.exists() or hashlib.file_digest(archive.open('rb'), 'sha256').hexdigest() != expected:
    partial = archive.with_suffix('.partial')
    req = urllib.request.Request(f'https://github.com/electron/electron/releases/download/v{version}/{name}', headers={'User-Agent':'PES-Focus-build'})
    with urllib.request.urlopen(req, timeout=90) as source, partial.open('wb') as target:
        shutil.copyfileobj(source, target, length=1024*1024)
    actual = hashlib.file_digest(partial.open('rb'), 'sha256').hexdigest()
    if actual != expected:
        raise RuntimeError('Official Electron release checksum mismatch; extraction refused')
    partial.replace(archive)
dist = pkg / 'dist'
dist.mkdir(exist_ok=True)
with zipfile.ZipFile(archive) as source:
    for member in source.infolist():
        target = (dist / member.filename).resolve()
        if not target.is_relative_to(dist.resolve()):
            raise RuntimeError('Unsafe archive entry')
    source.extractall(dist)
if (dist/'electron.d.ts').exists():
    shutil.move(str(dist/'electron.d.ts'), str(pkg/'electron.d.ts'))
(pkg/'path.txt').write_text('electron.exe', encoding='utf-8')
evidence={'version':version, 'archive':str(archive),'sha256':expected,'bytes':archive.stat().st_size,'binary':str(dist/'electron.exe'),'verified':True}
(root/'verification/electron-binary.json').write_text(json.dumps(evidence,indent=2),encoding='utf-8')
print(json.dumps(evidence,indent=2))
