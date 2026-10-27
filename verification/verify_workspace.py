"""Validate this documentation handoff against preserved source and real evidence.

Offline checks only: no PES requests, credentials, task mutations or remediation.
"""
import collections
import csv
import datetime as dt
import hashlib
import json
import pathlib
import re
import sys
import urllib.parse
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
failures = []
checks = []


def check(name, condition, details=None):
    checks.append({'name': name, 'passed': bool(condition), 'details': details})
    if not condition:
        failures.append(name)


required = [
    'README.md', 'pes_automation.py', 'test_pes_automation.py',
    'docs/01-SESSION-RECORD.md', 'docs/02-REQUIREMENTS.md',
    'docs/03-ARCHITECTURE-E2E.md', 'docs/04-OPERATIONS.md',
    'docs/05-DATA-AND-RESULTS.md', 'docs/LESSONS_LEARNED.md',
    'docs/07-SECURITY.md', 'docs/08-VERIFICATION-AND-LIMITATIONS.md',
    'docs/09-PROVENANCE-AND-HANDOFF.md', 'source/provenance.json',
    'verification/unit-tests.txt',
]
check('required_artifacts', all((ROOT/p).is_file() for p in required), required)
manifest = json.loads((ROOT/'source/provenance.json').read_text(encoding='utf-8'))
for entry in manifest['files']:
    data = (ROOT/entry['snapshot']).read_bytes()
    check('snapshot_hash:' + entry['snapshot'], hashlib.sha256(data).hexdigest() == entry['sha256'] and len(data) == entry['bytes'])
    # The active skill is intentionally updated after preserving its old snapshot.
    if entry['snapshot'] != 'source/pes-task-extraction.SKILL.snapshot.md':
        source = pathlib.Path(entry['source'])
        check('original_unchanged:' + entry['snapshot'], source.is_file() and hashlib.sha256(source.read_bytes()).hexdigest() == entry['sha256'])

active = ['pes_automation.py', 'test_pes_automation.py']
active += [p.relative_to(ROOT/'source/original').as_posix() for parent in ['evidence', 'reports'] for p in (ROOT/'source/original'/parent).rglob('*') if p.is_file()]
for relative in active:
    check('active_copy_identical:' + relative, (ROOT/relative).read_bytes() == (ROOT/'source/original'/relative).read_bytes())

folder = ROOT/'reports/2026-10-26'
report = json.loads((folder/'pes_tasks.json').read_text(encoding='utf-8'))
raw = json.loads((folder/'pes_filtered_raw.json').read_text(encoding='utf-8'))
histories = json.loads((folder/'pes_task_histories.json').read_text(encoding='utf-8'))
tasks = report['tasks']
with (folder/'pes_tasks.csv').open(encoding='utf-8-sig', newline='') as stream:
    records = list(csv.DictReader(stream))
raw_ids = [row['cells'][1] for row in raw['rows']]
raw_counts = dict(collections.Counter(row['cells'][12] for row in raw['rows']))
selected_ids = {row['cells'][1] for row in raw['rows'] if row['cells'][12] in ('Approval', 'Open')}
ids = [task['TaskNo'] for task in tasks]
check('raw_32_unique_rows', len(raw_ids) == len(set(raw_ids)) == 32)
check('raw_status_distribution', raw_counts == {'Approval': 8, 'Solved': 24}, raw_counts)
check('all_requested_statuses_included', selected_ids == set(ids))
check('selected_8_unique_tasks', len(ids) == len(set(ids)) == 8)
check('selected_counts', report['counts'] == {'Approval': 8, 'Open': 0})
check('csv_identity_and_count', len(records) == len(ids) and {row['TaskNo'] for row in records} == set(ids))
check('matching_histories', set(histories) == set(ids) and all(task['TaskNo'] in task['history']['text'] and task['TaskNo'] in histories[task['TaskNo']]['text'] for task in tasks))
check('expected_pic', all(task['Pic'] == 'MUHAMMAD HERNANDA' for task in tasks))
check('date_window', (report['date_from'], report['date_to']) == ('2026-09-01', '2026-11-30'))
check('overdue_calculation', sorted((task['TaskNo'], task['days_overdue']) for task in tasks if task['overdue']) == [('M03989/Task. IT/1026', 3), ('M03990/Task. IT/1026', 3)])
check('unit_test_log_pass', 'Ran 2 tests' in (ROOT/'verification/unit-tests.txt').read_text(encoding='utf-8') and '\nOK' in (ROOT/'verification/unit-tests.txt').read_text(encoding='utf-8'))

broken_links = []
fence_errors = []
mermaid_errors = []
mermaid_count = 0
for path in ROOT.rglob('*.md'):
    text = path.read_text(encoding='utf-8')
    lines = text.splitlines()
    fences = [line for line in lines if line.startswith('```')]
    if len(fences) % 2:
        fence_errors.append(path.relative_to(ROOT).as_posix())
    # Python ns['run'](globals(), ...) inside code is not a Markdown link.
    link_text = re.sub(r'```[^\n]*\n.*?\n```', '', text, flags=re.S)
    link_text = re.sub(r'`[^`\n]*`', '', link_text)
    for target in re.findall(r'\[[^\]\n]+\]\(([^)\n]+)\)', link_text):
        target = target.split('#', 1)[0]
        if not target or re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:', target):
            continue
        destination = path.parent / urllib.parse.unquote(target)
        if not destination.exists():
            broken_links.append({'file':path.relative_to(ROOT).as_posix(), 'target': target})
    for block in re.findall(r'```mermaid\n(.*?)\n```', text, re.S):
        mermaid_count += 1
        first = block.lstrip().splitlines()[0]
        if first.startswith('flowchart'):
            declarations = set(re.findall(r'\b([A-Z][A-Z0-9_]*)\s*(?:\[|\{)', block))
            endpoints = []
            for line in block.splitlines():
                match = re.match(r'\s*([A-Z][A-Z0-9_]*)\s*(?:\[[^\]]*\]|\{[^}]*\})?\s*-->(?:\|[^|]*\|)?\s*([A-Z][A-Z0-9_]*)', line)
                if match:
                    endpoints.extend(match.groups())
            if any(node not in declarations for node in endpoints):
                mermaid_errors.append('undeclared flowchart node:' + path.name)
            if len(re.findall(r'^\s*subgraph\b', block, re.M)) != len(re.findall(r'^\s*end\s*$', block, re.M)):
                mermaid_errors.append('flowchart subgraph imbalance:' + path.name)
        elif first == 'sequenceDiagram':
            opened = len(re.findall(r'^\s*(?:alt|loop|opt|par|critical|break)\b', block, re.M))
            ended = len(re.findall(r'^\s*end\s*$', block, re.M))
            if opened != ended:
                mermaid_errors.append('sequence block imbalance:' + path.name)
        else:
            mermaid_errors.append('unsupported diagram type:' + first)
check('markdown_relative_links', not broken_links, broken_links)
check('markdown_fence_balance', not fence_errors, fence_errors)
check('mermaid_basic_structure', not mermaid_errors and mermaid_count == 3, {'blocks':mermaid_count, 'errors':mermaid_errors, 'scope':'basic structural sanity, not rendered or full-parser validation'})

secret_patterns = [
    re.compile(r'(?i)(?:password|passwd|pwd)\s*[=:]\s*[\"\x27]?\d{3,}'),
    re.compile(r'(?i)(?:authorization\s*:\s*bearer\s+)[a-z0-9._-]{8,}'),
    re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    re.compile(r'(?i)[\"\x27](?:access_token|refresh_token|client_secret)[\"\x27]\s*:\s*[\"\x27][^\"\x27<>\s]{8,}'),
]
secret_hits = []
placeholder_hits = []
text_suffixes = {'.py', '.md', '.json', '.csv', '.txt'}
for path in ROOT.rglob('*'):
    if not path.is_file() or '__pycache__' in path.parts or path.name in {'validation.json','validation-output.txt','file-inventory.json'}:
        continue
    if path.suffix.lower() in text_suffixes:
        texts = [(path.relative_to(ROOT).as_posix(), path.read_text(encoding='utf-8-sig'))]
    elif path.suffix.lower() == '.zip':
        with zipfile.ZipFile(path) as archive:
            check('original_zip_integrity', archive.testzip() is None and len(archive.namelist()) == 10)
            texts = [(path.relative_to(ROOT).as_posix() + '!' + name, archive.read(name).decode('utf-8-sig')) for name in archive.namelist() if pathlib.Path(name).suffix.lower() in text_suffixes]
    else:
        texts = []
    for name, text in texts:
        for number, pattern in enumerate(secret_patterns, 1):
            if pattern.search(text):
                secret_hits.append({'file':name, 'pattern':number})
        if '[SKILL_' + 'PRUNED]' in text or '...[' + 'truncated]' in text:
            placeholder_hits.append(name)
forbidden = [p.relative_to(ROOT).as_posix() for p in ROOT.rglob('*') if p.is_file() and p.name.lower() in {'cookies', 'cookies.sqlite', 'login data', '.env'}]
check('heuristic_secret_scan', not secret_hits and not forbidden, {'hits':secret_hits, 'forbidden_files':forbidden, 'scope':'heuristic, not a formal no-secrets proof'})
check('no_truncation_placeholders', not placeholder_hits, placeholder_hits)
check('no_git_repository_created', not (ROOT/'.git').exists())

result = {'verified_at':dt.datetime.now().astimezone().isoformat(), 'workspace':str(ROOT), 'status':'PASS' if not failures else 'FAIL', 'check_count':len(checks), 'checks':checks, 'failures':failures, 'website_refreshed':False, 'preserved_retrieved_at':report['retrieved_at']}
(ROOT/'verification/validation.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'status':result['status'], 'checks':len(checks), 'failures':failures, 'raw_rows':len(raw_ids), 'selected_tasks':len(ids), 'histories':len(histories), 'mermaid_blocks':mermaid_count, 'website_refreshed':False}, indent=2))
sys.exit(1 if failures else 0)
