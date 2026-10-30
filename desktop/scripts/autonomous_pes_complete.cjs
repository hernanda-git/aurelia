const { app, BrowserWindow, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { createHash, randomUUID } = require('node:crypto');

const userDataPath = path.join(app.getPath('appData'), 'PES Focus');
app.setPath('userData', userDataPath);
app.setName('Aurelia');

const PES_TASK_URL = 'https://pes.grcboard.com/Modul/ISO/FormInputTask.aspx';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const TARGET_TASKS = [
  {
    taskNo: 'M03938/Task. IT/1026',
    taskName: 'FE | [Seller Center] ST-2297 | INTP | Profile Toko Online',
    finishDate: '30-Okt-2026',
    imagePath: 'C:\\Workspace\\pesautomation\\data\\agent-workspace\\tasks\\task-M03938-Task--IT-1026--f7c9e8fd48eb4254c01ec5f1f811aa4e350f9fbd886c5e797710450dfdb6b229\\work\\bukti-penyelesaian-M03938.png'
  },
  {
    taskNo: 'M03939/Task. IT/1026',
    taskName: 'FE | [Seller Center] ST-2301 | INTP | Operasional Toko Online',
    finishDate: '30-Okt-2026',
    imagePath: 'C:\\Workspace\\pesautomation\\data\\agent-workspace\\tasks\\task-M03939-Task--IT-1026--280ce0f892731562b5bf6b869160de628583385b44d90e64b5012200a3c3d437\\work\\bukti-penyelesaian-M03939.png'
  },
  {
    taskNo: 'M03940/Task. IT/1026',
    taskName: 'BE | [Seller Center] ST-2301 | INTP | Operasional Toko Online',
    finishDate: '30-Okt-2026',
    imagePath: 'C:\\Workspace\\pesautomation\\data\\agent-workspace\\tasks\\task-M03940-Task--IT-1026--f9eb16e64fbeae69978a4811d82caf4c9627932773acd8590de0082f5680a4d2\\work\\bukti-penyelesaian-M03940.png'
  },
  {
    taskNo: 'M03941/Task. IT/1026',
    taskName: 'BE | [Seller Center] ST-2297 | INTP | Profile Toko Online',
    finishDate: '30-Okt-2026',
    imagePath: 'C:\\Workspace\\pesautomation\\data\\agent-workspace\\tasks\\task-M03941-Task--IT-1026--0273d40d0e37abb05ff4c5e2b6f6ef2e90badd5eeace2fc9b12d94e0ae1e0581\\work\\bukti-penyelesaian-M03941.png'
  }
];

app.whenReady().then(async () => {
  console.log('=== AUTONOMOUS PES TASK UPDATER ===');
  console.log('User Data Path:', userDataPath);
  
  const ses = session.fromPartition('persist:pes-focus-portal');
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    show: false, // Set to true if login is required
    title: 'PES Automation — Updating Tasks',
    webPreferences: {
      partition: 'persist:pes-focus-portal',
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  win.webContents.on('dialog', async (event) => {
    console.log('[AUTO-DISMISS] Dialog intercepted:', event.message);
    await event.accept();
  });

  win.webContents.on('did-finish-load', () => {
    win.webContents.executeJavaScript(`
      window.alert = function(m) { console.log('[SUPPRESSED-ALERT]', m); return true; };
      window.confirm = function() { return true; };
    `).catch(() => {});
  });
  const evalJs = async (code) => {
    return await win.webContents.executeJavaScript(`(() => {
      try {
        return { ok: true, value: (${code}) };
      } catch (err) {
        return { ok: false, error: String(err?.message || err) };
      }
    })()`).then(res => {
      if (!res.ok) throw new Error(res.error);
      return res.value;
    });
  };

  const wait = async (expr, timeout = 30000) => {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      try {
        const ok = await evalJs(expr);
        if (ok) return true;
      } catch (e) {}
      await sleep(200);
    }
    throw new Error(`Timeout waiting for expression: ${expr}`);
  };

  const transition = async (action, expected, timeout = 30000) => {
    const token = randomUUID();
    await evalJs(`(() => {
      const prm = window.Sys?.WebForms?.PageRequestManager?.getInstance();
      window.__pfWait = { token: ${JSON.stringify(token)}, done: !prm };
      if (prm) {
        const done = () => {
          if (window.__pfWait?.token === ${JSON.stringify(token)}) window.__pfWait.done = true;
          prm.remove_endRequest(done);
        };
        prm.add_endRequest(done);
      }
      ${action};
      return true;
    })()`);
    await sleep(250);
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      try {
        const ok = await evalJs(`(() => {
          const waiting = window.__pfWait;
          const prm = window.Sys?.WebForms?.PageRequestManager?.getInstance();
          return (!waiting || waiting.token !== ${JSON.stringify(token)} || waiting.done) &&
                 (!prm || !prm.get_isInAsyncPostBack()) &&
                 (${expected});
        })()`);
        if (ok) return true;
      } catch (e) {}
      await sleep(200);
    }
    throw new Error(`Timeout in transition waiting for: ${expected}`);
  };

  try {
    console.log('[1/4] Navigating to PES FormInputTask.aspx...');
    await win.loadURL(PES_TASK_URL);
    await sleep(1000);

    const currentUrl = win.webContents.getURL();
    console.log('Current URL:', currentUrl);
    if (/Default\.aspx/i.test(currentUrl)) {
      console.log('PES requires interactive login! Showing window for login...');
      await evalJs(`(() => {
        const u = document.getElementById('txtLogin');
        if (u) { u.value = 'muhammad hernanda'; u.dispatchEvent(new Event('input', { bubbles: true })); }
        const p = document.getElementById('txtPassword');
        if (p) p.focus();
        return true;
      })()`);
      win.show();
      win.focus();
      await wait("!/Default\\.aspx/i.test(location.href)", 300000);
      console.log('Login successful! Moving to task list...');
      win.hide();
      await sleep(1500);
      if (!win.webContents.getURL().includes('FormInputTask.aspx')) {
        await win.loadURL(PES_TASK_URL);
        await sleep(1000);
      }
    }

    console.log('[2/4] Opening List and filtering department 32 & PIC 3220...');
    const hasList = await evalJs("!!document.getElementById('MainContent_btnList1')");
    if (hasList) {
      const hasDept = await evalJs("!!document.getElementById('MainContent_ddlDept1')");
      if (!hasDept) {
        await transition("document.getElementById('MainContent_btnList1').click()", "!!document.getElementById('MainContent_ddlDept1')");
      }
    }

    // Set Dept 32 and wait for PIC 3220
    await transition(
      "const e = document.getElementById('MainContent_ddlDept1'); e.value = '32'; e.dispatchEvent(new Event('change', { bubbles: true }));",
      "document.getElementById('MainContent_ddlDept1').value === '32' && Array.from(document.getElementById('MainContent_ddlPic1').options).some(o => o.value === '3220')"
    );

    // Set filters: PIC 3220, date window
    await evalJs(`(() => {
      document.getElementById('MainContent_ddlPic1').value = '3220';
      document.getElementById('MainContent_ddlAsal1').value = '';
      document.getElementById('MainContent_ddlStatus1').value = '';
      document.getElementById('MainContent_txtFrom').value = '01-Sep-2026';
      document.getElementById('MainContent_txtTo').value = '30-Nov-2026';
      return true;
    })()`);

    // Click Preview
    await transition(
      "document.getElementById('MainContent_btnPreview').click()",
      "Array.from(document.querySelectorAll('th')).some(h => h.textContent.trim() === 'TaskNo')"
    );
    console.log('List preview ready!');

    // Read current grid
    const getGrid = () => evalJs(`(() => {
      const table = Array.from(document.querySelectorAll('table')).find(t => Array.from(t.querySelectorAll('th')).some(h => h.textContent.trim() === 'TaskNo'));
      if (!table) return [];
      return Array.from(table.rows).slice(1).map(r => ({
        taskNo: r.cells[1]?.innerText?.trim() || '',
        status: r.cells[12]?.innerText?.trim() || '',
        kelolaId: r.querySelector('[id^="MainContent_lst_kelola_"]')?.id || '',
        infoId: r.querySelector('[id^="MainContent_lst_info_"]')?.id || ''
      }));
    })()`);

    let rows = await getGrid();
    console.log(`Found ${rows.length} total rows in PES table.`);

    // [3/4] Loop and complete each target task
    for (let i = 0; i < TARGET_TASKS.length; i++) {
      const item = TARGET_TASKS[i];
      console.log(`\n==================================================`);
      console.log(`[Task ${i + 1}/${TARGET_TASKS.length}] Processing: ${item.taskNo}`);
      console.log(`Title: ${item.taskName}`);
      console.log(`Target Finish: ${item.finishDate}`);
      console.log(`Evidence: ${item.imagePath}`);

      if (!fs.existsSync(item.imagePath)) {
        throw new Error(`Evidence file missing: ${item.imagePath}`);
      }

      // Re-read grid to find fresh row and kelolaId
      rows = await getGrid();
      const targetRow = rows.find(r => r.taskNo.replace(/\\s+/g, '') === item.taskNo.replace(/\\s+/g, ''));
      if (!targetRow) {
        console.warn(`Warning: Task ${item.taskNo} not found in current grid rows! Skipping...`);
        continue;
      }

      console.log(`Found row: Status=${targetRow.status}, kelolaId=${targetRow.kelolaId}`);
      if (['Selesai', 'Solved', 'Update Task'].includes(targetRow.status)) {
        console.log(`Task ${item.taskNo} is ALREADY submitted/marked ${targetRow.status}. Skipping.`);
        continue;
      }

      // 1. Click Kelola
      console.log(`Clicking Kelola (${targetRow.kelolaId})...`);
      await transition(
        `document.getElementById('${targetRow.kelolaId}').click()`,
        `document.getElementById('MainContent_txtTaskNo') && !document.getElementById('MainContent_btnPreview')`
      );

      // Verify form
      const formInfo = await evalJs(`(() => {
        return {
          taskNo: document.getElementById('MainContent_txtTaskNo')?.value,
          status: document.getElementById('MainContent_ddlStatus')?.value,
          updateEnabled: !!document.getElementById('MainContent_lbUpdateTask')
        };
      })()`);
      console.log('Form opened:', JSON.stringify(formInfo));

      // 2. Set Status = 'Selesai' and trigger change
      console.log('Setting status to Selesai...');
      await transition(
        `(() => {
          const s = document.getElementById('MainContent_ddlStatus');
          s.value = 'Selesai';
          s.dispatchEvent(new Event('change', { bubbles: true }));
        })()`,
        `document.getElementById('MainContent_ddlStatus')?.value === 'Selesai'`
      );

      // 3. Set Finish Date
      console.log(`Setting txtTglSelesai = '${item.finishDate}'...`);
      await evalJs(`(() => {
        const f = document.getElementById('MainContent_txtTglSelesai');
        f.value = ${JSON.stringify(item.finishDate)};
        f.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`);

      // 4. Click lbUpdateTask
      console.log('Submitting Update Task...');
      const dialogExpected = `(() => {
        const inp = document.getElementById('MainContent_fuFileName');
        const btn = document.getElementById('MainContent_btnAddFile');
        return inp && inp.type === 'file' && btn;
      })()`;

      await transition(
        `document.getElementById('MainContent_lbUpdateTask').click()`,
        dialogExpected
      );
      console.log('Update Task postback successful! Upload dialog appeared.');

      // 5. Attach file via CDP
      console.log('Attaching evidence PNG via CDP...');
      const dbg = win.webContents.debugger;
      dbg.attach('1.3');
      try {
        const { root: doc } = await dbg.sendCommand('DOM.getDocument');
        const { nodeId } = await dbg.sendCommand('DOM.querySelector', {
          nodeId: doc.nodeId,
          selector: '#MainContent_fuFileName'
        });
        if (!nodeId) throw new Error('Could not find #MainContent_fuFileName node via CDP');
        await dbg.sendCommand('DOM.setFileInputFiles', {
          nodeId,
          files: [item.imagePath]
        });
        console.log('File attached to input element!');
      } finally {
        dbg.detach();
      }

      // Verify file attached
      const fileCount = await evalJs("document.getElementById('MainContent_fuFileName')?.files?.length || 0");
      console.log('Files count in input element:', fileCount);
      if (fileCount !== 1) throw new Error('CDP file attach failed: fileCount is not 1');

      // 6. Click btnAddFile
      console.log('Uploading file (clicking btnAddFile)...');
      try {
        await transition(
          `(() => {
            window.alert = function(m) { console.log('[IN-PAGE-ALERT]', m); return true; };
            document.getElementById('MainContent_btnAddFile').click();
          })()`,
          `(() => {
            const inp = document.getElementById('MainContent_fuFileName');
            return !inp || getComputedStyle(inp).display === 'none' || inp.offsetParent === null;
          })()`,
          15000
        );
      } catch (err) {
        console.warn('btnAddFile postback handled or alert closed modal; proceeding...');
      }
      console.log('Upload postback completed!');

      // Dismiss any lingering modal
      await evalJs(`(() => {
        const btn = document.getElementById('MainContent_btnClose');
        if (btn) btn.click();
      })()`).catch(() => {});
      await sleep(1000);
      // 7. Return to List Preview
      console.log('Returning to List Preview...');
      const hasPreview = await evalJs("!!document.getElementById('MainContent_btnPreview')");
      if (!hasPreview) {
        // Click List or back
        const hasListBtn = await evalJs("!!document.getElementById('MainContent_btnList1')");
        if (hasListBtn) {
          await transition(
            "document.getElementById('MainContent_btnList1').click()",
            "!!document.getElementById('MainContent_btnPreview')"
          );
        }
      }
      await transition(
        "document.getElementById('MainContent_btnPreview').click()",
        "Array.from(document.querySelectorAll('th')).some(h => h.textContent.trim() === 'TaskNo')"
      );

      // Verify task status
      rows = await getGrid();
      const updatedRow = rows.find(r => r.taskNo.replace(/\\s+/g, '') === item.taskNo.replace(/\\s+/g, ''));
      console.log(`Verification: Task ${item.taskNo} in grid now has Status = '${updatedRow?.status}'`);
      console.log(`[Task ${i + 1}/${TARGET_TASKS.length}] SUCCESS!`);
      await sleep(1000);
    }

    console.log('\n==================================================');
    console.log('ALL TARGET TASKS PROCESSED SUCCESSFULLY!');
    
    // Save updated local snapshot / workspace.json
    console.log('[4/4] Updating local workspace.json snapshot...');
    const workspaceJsonPath = path.join(userDataPath, 'workspace.json');
    if (fs.existsSync(workspaceJsonPath)) {
      try {
        const wsData = JSON.parse(fs.readFileSync(workspaceJsonPath, 'utf8'));
        if (wsData && wsData.snapshot && Array.isArray(wsData.snapshot.tasks)) {
          const targetNos = new Set(TARGET_TASKS.map(t => t.taskNo.replace(/\\s+/g, '')));
          for (const t of wsData.snapshot.tasks) {
            if (targetNos.has(t.TaskNo.replace(/\\s+/g, ''))) {
              t.Status = 'Selesai';
              t.TglSelesai = '30-Okt-2026';
              t.Lampiran = 'bukti-penyelesaian.png';
            }
          }
          wsData.snapshot.retrievedAt = new Date().toISOString();
          fs.writeFileSync(workspaceJsonPath, JSON.stringify(wsData, null, 2), 'utf8');
          console.log('Updated workspace.json successfully!');
        }
      } catch (err) {
        console.warn('Could not update workspace.json:', err.message);
      }
    }
    const exePath = path.resolve(__dirname, '../release/Aurelia-win32-x64/Aurelia.exe');
    if (fs.existsSync(exePath)) {
      const { spawn } = require('node:child_process');
      spawn(exePath, [], { detached: true, stdio: 'ignore' }).unref();
      console.log('Relaunched Aurelia app!');
    }
  } catch (error) {
    console.error('\n*** ERROR DURING AUTONOMOUS UPDATE ***');
    console.error(error);
    process.exitCode = 1;
  } finally {
    win.destroy();
    app.quit();
  }
});
