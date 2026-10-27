"""Validate actual evidence, freeze source identity, and build the portable PES archive."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import uuid
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT.parent
VERIFY = ROOT / 'verification'

def load(name):
    return json.loads((VERIFY / name).read_text(encoding='utf-8-sig'))

def sha(path):
    return hashlib.file_digest(Path(path).open('rb'), 'sha256').hexdigest()

def save(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

unit = load('unit-tests-0.2.json')
assert unit['success'] and unit['numFailedTests'] == 0 and unit['numPassedTests'] == unit['numTotalTests']
core = load('packaged-e2e.json')
recovery = load('packaged-startup-collision.json')
inspection = load('package-inspection.json')
user = load('update-0.2-user-data.json')
shortcuts = load('shortcuts-0.2.json')
launch = load('shortcut-launch-0.2.json')
assert not core['rendererErrors'] and recovery['status'] == inspection['status'] == user['status'] == shortcuts['status'] == launch['status'] == 'PASS'
assert user['sourceSnapshotPreserved'] and user['preferencesPreserved'] and user['settingsPreserved']
assert len(shortcuts['shortcuts']) == 2 and all(item['verified'] for item in shortcuts['shortcuts'])
assert user['livePesSync'] is False and user['browserCredentialsReadOrCopied'] is False
checks = core['checks'] + recovery['checks']
assert len(checks) == len(set(checks))
folder = ROOT / 'release/PES-win32-x64'
exe = folder / 'PES.exe'
asar = folder / 'resources/app.asar'
assert sha(exe) == inspection['exeSha256'] and sha(asar) == inspection['asarSha256']
assert Path(launch['executable']).resolve() == exe.resolve() and launch['windowTitle'] == 'PES'

# Source files and original launch aliases, never profiles, generated task data, or authentication storage.
files = []
for directory in ['src', 'tests', 'scripts', 'assets', 'docs']:
    files.extend(path for path in (ROOT / directory).rglob('*') if path.is_file() and '__pycache__' not in path.parts)
files.extend(path for pattern in ['package*.json', 'tsconfig*.json', '*config.mts', 'README.md'] for path in ROOT.glob(pattern))
files.extend([PROJECT / 'Open PES.cmd', PROJECT / 'Launch PES Focus.cmd', PROJECT / 'README.md'])
items = [{'path': str(path.relative_to(PROJECT)).replace('\\', '/'), 'bytes': path.stat().st_size, 'sha256': sha(path)} for path in sorted(set(files))]
source_hash = hashlib.sha256(json.dumps(items, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
manifest = {'at': datetime.datetime.now().astimezone().isoformat(), 'root': str(PROJECT), 'algorithm': 'SHA256 of UTF-8 compact sorted-key JSON files array', 'sourceSetSha256': source_hash, 'files': items}
save(VERIFY / 'update-0.2-manifest.json', manifest)

# Check local canonical Markdown links without treating code examples as links.
links = 0
for document in [PROJECT / 'README.md', ROOT / 'README.md', *sorted((ROOT / 'docs').glob('*.md'))]:
    text = re.sub(r'```.*?```', '', document.read_text(encoding='utf-8'), flags=re.S)
    text = re.sub(r'`[^`]*`', '', text)
    for target in re.findall(r'\[[^\]]+\]\(([^)]+)\)', text):
        if '://' in target or target.startswith('#'):
            continue
        assert (document.parent / target.split('#')[0]).exists(), (document, target)
        links += 1

start = folder / 'START-HERE.txt'
start.write_text(f'''PES 0.2.0 - List Tasks

Open PES.exe with this complete folder intact, or use the installed Desktop/Start menu PES shortcut.
No administrator installation is required. This is an unsigned internal Windows x64 portable application.

Verified: {unit['numPassedTests']} unit tests; {len(checks)} actual packaged runtime checks ({len(core['checks'])} desktop + {len(recovery['checks'])} projection failure/recovery).
Actual user cache preserved: {user['taskCount']} tasks and matching histories. This update did NOT fetch newer PES data.
Source retrieval time: {user['retrievedAt']}.
Existing cache/sign-in storage remains in the legacy per-user PES Focus directory.
Agent task files: C:\\Workspace\\pesautomation\\data\\agent-workspace.
Keep notes/plans/outputs in each task's work folder; generated source files can be replaced.

This package contains real internal historical task seed data. Do not publish it or share browser profiles.
No independent final-source review approval is claimed. Full evidence and documentation remain in the development workspace.
''', encoding='utf-8')
archive = ROOT / 'release/PES-0.2.0-Windows-x64.zip'
temporary = archive.with_name('.pes-' + uuid.uuid4().hex + '.zip.tmp')
release_files = sorted(path for path in folder.rglob('*') if path.is_file())
assert not any(path.name.lower() in {'cookies', 'login data', 'workspace.json'} for path in release_files)
try:
    with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as out:
        for path in release_files:
            out.write(path, str(path.relative_to(folder.parent)).replace('\\', '/'))
    with zipfile.ZipFile(temporary) as check:
        assert check.testzip() is None and len(check.infolist()) == len(release_files)
        assert all(name.startswith('PES-win32-x64/') and '..' not in Path(name).parts for name in check.namelist())
    os.replace(temporary, archive)
finally:
    if temporary.exists():
        temporary.unlink()
archive_hash = sha(archive)
archive.with_suffix('.zip.sha256').write_text(f'{archive_hash}  {archive.name}\n', encoding='utf-8')
result = {
    'at': datetime.datetime.now().astimezone().isoformat(), 'status': 'VERIFIED_AND_OPENED', 'version': '0.2.0',
    'unitTests': unit['numPassedTests'], 'unitFiles': len(unit['testResults']),
    'packagedRuntimeChecks': len(checks), 'packagedDesktopChecks': len(core['checks']), 'packagedRecoveryChecks': len(recovery['checks']),
    'userData': user, 'shortcuts': shortcuts['shortcuts'], 'desktopLaunch': launch,
    'exe': str(exe), 'exeSha256': sha(exe), 'asarSha256': sha(asar),
    'archive': str(archive), 'archiveSha256': archive_hash, 'archiveBytes': archive.stat().st_size, 'archiveEntries': len(release_files),
    'sourceSetSha256': source_hash, 'manifestFileSha256': sha(VERIFY / 'update-0.2-manifest.json'),
    'canonicalMarkdownLinksChecked': links, 'livePesSyncThisUpdate': False,
    'independentFinalSourceReview': 'NOT_CLAIMED_PREVIOUS_DEFERRAL',
    'optionalRootAgentInstructions': 'NOT_CREATED_APPROVAL_TIMED_OUT_NOT_RETRIED',
}
save(VERIFY / 'update-0.2-handoff.json', result)
print(json.dumps({key: result[key] for key in ['status', 'unitTests', 'unitFiles', 'packagedRuntimeChecks', 'archive', 'archiveSha256', 'archiveEntries', 'canonicalMarkdownLinksChecked', 'sourceSetSha256']}, indent=2))
