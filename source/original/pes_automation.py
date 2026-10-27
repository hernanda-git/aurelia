"""Read-only PES extraction for the Hermes browser_exec environment. No credentials stored."""
import calendar
import datetime as dt


def date_window(today):
    first = today.replace(day=1)
    start = (first - dt.timedelta(days=1)).replace(day=1)
    next_month = (first + dt.timedelta(days=32)).replace(day=1)
    end = next_month.replace(day=calendar.monthrange(next_month.year, next_month.month)[1])
    return start, end


def export_report(raw, histories, output, today):
    import csv
    import json
    import pathlib
    output = pathlib.Path(output)
    output.mkdir(parents=True, exist_ok=True)
    names = ['Row', 'TaskNo', 'TglInput', 'Pic', 'Jabatan', 'DeptName', 'TaskName', 'GoalTask', 'AsalTask', 'Bobot', 'Target', 'Duedate', 'Status', 'TglApproval', 'TglSelesai', 'Lampiran']
    tasks = []
    for row in raw['rows']:
        if row['cells'][12] not in ('Approval', 'Open'):
            continue
        task = dict(zip(names, row['cells']))
        assert task['Pic'] == 'MUHAMMAD HERNANDA', 'Unexpected PIC'
        assert task['TaskNo'] in histories, 'Missing detailed history'
        date_text = task['Duedate'].replace('Okt', 'Oct').replace('Agu', 'Aug').replace('Mei', 'May').replace('Des', 'Dec')
        due = dt.datetime.strptime(date_text, '%d-%b-%Y').date()
        task['overdue'] = due < today
        task['days_overdue'] = max(0, (today - due).days)
        task['history'] = histories[task['TaskNo']]
        tasks.append(task)
    assert len({t['TaskNo'] for t in tasks}) == len(tasks), 'Duplicate TaskNo'
    counts = {status: sum(t['Status'] == status for t in tasks) for status in ('Approval', 'Open')}
    start, end = date_window(today)
    report = {'retrieved_at': dt.datetime.now().astimezone().isoformat(), 'source': 'https://pes.grcboard.com/Modul/ISO/FormInputTask.aspx', 'department': 'IT Mitra Seribu Saudara', 'pic': 'MUHAMMAD HERNANDA', 'pic_value': '3220', 'date_from': start.isoformat(), 'date_to': end.isoformat(), 'total_scanned': len(raw['rows']), 'counts': counts, 'tasks': tasks}
    json_path = output / 'pes_tasks.json'
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    csv_path = output / 'pes_tasks.csv'
    with csv_path.open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=names + ['overdue', 'days_overdue', 'History'], extrasaction='ignore')
        writer.writeheader()
        for task in tasks:
            record = {**task, 'History': task['history']['text']}
            # Keep untrusted spreadsheet text from becoming a formula.
            record = {k: ("'" + v if isinstance(v, str) and v.startswith(('=', '+', '-', '@')) else v) for k, v in record.items()}
            writer.writerow(record)
    lines = ['# PES tasks', '', f'As of: {today.isoformat()}', f'Date range: {start.isoformat()} through {end.isoformat()}', 'Department: IT Mitra Seribu Saudara', 'PIC: MUHAMMAD HERNANDA (3220)', f"Scanned: {len(raw['rows'])}; Approval: {counts['Approval']}; Open: {counts['Open']}", '', 'List status is preserved exactly; history status may use a different label (e.g. Verifikasi). Overdue means due date is before the extraction date.', '']
    for task in tasks:
        lines.extend([f"## {task['TaskNo']}", ''])
        for key in names[2:]:
            lines.append(f"- **{key}:** {task[key] or '(blank)'}")
        lines.extend([f"- **Overdue:** {task['days_overdue']} days" if task['overdue'] else '- **Overdue:** No', '', '### Detailed target history', '', '```text', task['history']['text'], '```', ''])
    md_path = output / 'pes_tasks.md'
    md_path.write_text('\n'.join(lines), encoding='utf-8')
    return {'json': str(json_path), 'csv': str(csv_path), 'markdown': str(md_path), 'counts': counts, 'total_scanned': len(raw['rows'])}


def run(browser, output_dir):
    """Run with an authenticated PES tab and the browser_exec globals().

    Does not log in, save credentials, mutate tasks, or schedule itself.
    Stops instead of exporting a partial report if server-side paging appears.
    """
    import json
    import pathlib
    import time
    js = browser['js']
    fill = browser['fill_input']
    browser['ensure_real_tab']()

    def wait_for(expression, timeout=60):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                if js(expression):
                    return
            except RuntimeError as error:
                if 'timed out' not in str(error):
                    raise
                # Navigation can finish while the old CDP session times out.
                # Reattach and re-read; never repeat the previous click.
                browser['ensure_real_tab']()
            time.sleep(0.3)
        raise TimeoutError('PES page did not reach expected state: ' + expression[:180])

    ready = "(!window.Sys || !Sys.WebForms || !Sys.WebForms.PageRequestManager.getInstance().get_isInAsyncPostBack())"
    url = 'https://pes.grcboard.com/Modul/ISO/FormInputTask.aspx'
    current = js('location.href')
    if 'pes.grcboard.com/Default.aspx' in current:
        raise RuntimeError('Log in through browser_vault before running extraction')
    if current != url:
        js('location.href=' + json.dumps(url))
        wait_for("!!document.getElementById('MainContent_btnList1')")
    if not js("!!document.getElementById('MainContent_ddlDept1')"):
        js("document.getElementById('MainContent_btnList1').click()")
        wait_for("!!document.getElementById('MainContent_ddlDept1') && " + ready)
    js("const e=document.getElementById('MainContent_ddlDept1'); e.value='32';e.dispatchEvent(new Event('change',{bubbles:true}));")
    time.sleep(0.5)
    wait_for("document.getElementById('MainContent_ddlDept1').value==='32' && Array.from(document.getElementById('MainContent_ddlPic1').options).some(o=>o.value==='3220') && " + ready)
    today = dt.date.today()
    start, end = date_window(today)
    months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
    format_date = lambda d: f'{d.day:02d}-{months[d.month-1]}-{d.year}'
    js("document.getElementById('MainContent_ddlPic1').value='3220';document.getElementById('MainContent_ddlAsal1').value='';document.getElementById('MainContent_ddlStatus1').value='';")
    fill('#MainContent_txtFrom', format_date(start))
    fill('#MainContent_txtTo', format_date(end))
    js("document.getElementById('MainContent_btnPreview').click()")
    time.sleep(0.5)
    wait_for(ready + " && !!document.querySelector('[id^=MainContent_lst_trLst_]')")
    expected = ['32', '3220', format_date(start), format_date(end)]
    actual = js("['MainContent_ddlDept1','MainContent_ddlPic1','MainContent_txtFrom','MainContent_txtTo'].map(id=>document.getElementById(id).value)")
    assert actual == expected, 'Filter readback mismatch'
    raw = js(r"""(() => {
        const t=Array.from(document.querySelectorAll('table')).find(t=>Array.from(t.querySelectorAll('th')).some(h=>h.innerText==='TaskNo'));
        return {headers:Array.from(t.querySelectorAll('th')).map(e=>e.innerText),rows:Array.from(t.rows).filter(r=>r.cells.length>=16 && r.querySelector('td')).map(r=>({cells:Array.from(r.cells).map(c=>c.innerText.trim()),controls:Array.from(r.querySelectorAll('input')).map(e=>({id:e.id}))})),pager:Array.from(document.querySelectorAll('a')).filter(a=>/Page\$/.test(a.getAttribute('href')||'')).map(a=>a.innerText),html:t.outerHTML};
    })()""")
    if raw['pager']:
        raise RuntimeError('Server pagination detected; refusing partial export')
    assert len(raw['rows']) == len({r['cells'][1] for r in raw['rows']}), 'Duplicate grid tasks'
    assert all(r['cells'][3]=='MUHAMMAD HERNANDA' for r in raw['rows']), 'Unexpected grid PIC'
    output = pathlib.Path(output_dir) / today.isoformat()
    output.mkdir(parents=True, exist_ok=True)
    (output/'pes_filtered_raw.json').write_text(json.dumps(raw, ensure_ascii=False, indent=2), encoding='utf-8')
    selected = [r for r in raw['rows'] if r['cells'][12] in ('Approval', 'Open')]
    histories = {}
    for row in selected:
        taskno = row['cells'][1]
        control = next(c['id'] for c in row['controls'] if '_info_' in c['id'])
        js('document.getElementById(' + json.dumps(control) + ').click()')
        wait_for("getComputedStyle(document.getElementById('MainContent_PanelModalTarget')).display!=='none' && document.getElementById('MainContent_PanelModalTarget').innerText.includes(" + json.dumps(taskno) + ') && ' + ready)
        history = js("(() => {const p=document.getElementById('MainContent_PanelModalTarget');return {text:p.innerText,tables:Array.from(p.querySelectorAll('table')).map(t=>Array.from(t.rows).map(r=>Array.from(r.cells).map(c=>c.innerText.trim())))};})()")
        assert taskno in history['text'], 'Wrong history task'
        histories[taskno] = history
        (output/'pes_task_histories.json').write_text(json.dumps(histories, ensure_ascii=False, indent=2), encoding='utf-8')
        js("document.getElementById('MainContent_btnClose').click()")
        wait_for("getComputedStyle(document.getElementById('MainContent_PanelModalTarget')).display==='none' && " + ready)
    assert len(histories) == len(selected), 'Incomplete task histories'
    return export_report(raw, histories, output, today)
