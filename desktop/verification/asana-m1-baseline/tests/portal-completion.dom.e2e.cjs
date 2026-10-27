// ARTIFICIAL isolated contract fixture; actual Electron Chromium, zero PES requests/writes.
const {app,BrowserWindow,session}=require('electron');
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const {PortalCompletionDriver}=require(path.join(root,'dist/main/main/portal-completion.js'));
const scratch=fs.mkdtempSync(path.join(process.env.TMPDIR,'pes-completion-dom-'));
app.setPath('userData',path.join(scratch,'profile'));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
 const isolated=session.fromPartition('completion-artificial-'+Date.now());
 // HTTPS is fulfilled locally below; every other request is denied before networking.
 isolated.webRequest.onBeforeRequest((request,callback)=>callback({cancel:!request.url.startsWith('https://')}));
 const html=fs.readFileSync(path.join(__dirname,'fixtures/portal-completion.html'),'utf8');
 let intercepted=0;
 // All HTTPS is intercepted before networking. No remote fixture server, no real profile.
 await isolated.protocol.handle('https',()=>{intercepted++;return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'"}});});
 const win=new BrowserWindow({show:false,webPreferences:{session:isolated,sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 let navigations=0;win.webContents.on('did-finish-load',()=>navigations++);
 // Electron may erase renderer exception messages at the context boundary.
 const evaluate=async script=>{
  const result=await win.webContents.executeJavaScript(`(() => {try{return {ok:true,value:(${script})};}catch(error){return {ok:false,error:String(error?.message??error)};}})()`);
  if(!result.ok)throw Error(result.error);return result.value;
 };
 const transitions=[];const cdpCalls=[];
 const transport={evaluate,
  async transition(action,expected){
   transitions.push(action);const before=navigations;
   await evaluate(`(() => {const p=window.Sys?.WebForms?.PageRequestManager?.getInstance();window.__contractWait={done:!p};if(p){const done=()=>{window.__contractWait.done=true;p.remove_endRequest(done);};p.add_endRequest(done);}return true;})()`);
   await evaluate(action); // Deliberately never retried, even on a navigation or timeout.
   const until=Date.now()+7000;
   while(Date.now()<until){
    try {if(await evaluate(`(() => {const p=window.Sys?.WebForms?.PageRequestManager?.getInstance();return document.readyState==='complete'&&(!p||!p.get_isInAsyncPostBack())&&(${navigations!==before}||window.__contractWait?.done)&&(${expected});})()`))return;}catch(error){if(!/context|navigation|frame|loading/i.test(String(error)))throw error;}
    await pause(10);
   }
   throw Error('FIXTURE_TRANSITION_TIMEOUT');
  },
  async list(){return evaluate('window.contract.list()');},
  async setFileInput(filePath){
   const dbg=win.webContents.debugger;dbg.attach('1.3');
   try {
    const {root:doc}=await dbg.sendCommand('DOM.getDocument');
    const {nodeId}=await dbg.sendCommand('DOM.querySelector',{nodeId:doc.nodeId,selector:'#MainContent_fuFileName'});
    assert.ok(nodeId);assert.equal(await evaluate("!!document.getElementById('MainContent_fuFileName').getClientRects().length"),true);
    await dbg.sendCommand('DOM.setFileInputFiles',{nodeId,files:[filePath]});cdpCalls.push({command:'DOM.setFileInputFiles',selector:'#MainContent_fuFileName'});
   } finally {dbg.detach();}
  },
  async screenshot(){return {kind:'artificial-fixture-only',bytes:(await win.webContents.capturePage()).toPNG().length};}
 };
 try {
  await win.loadURL('https://pes.grcboard.com/Modul/ISO/FormInputTask.aspx');
  const initial=await evaluate('window.contract.getState()');
  const goalIdentity=Object.fromEntries(['listTaskNo','detailTaskNo','pic','picName','sourceUrl','taskName','goal','target'].map(k=>[k,initial.records[0][k]]));
  const goalControl="document.getElementById('MainContent_TxtGoal')";
  goalIdentity.dept='32';
  // Every adversarial case runs against actual Chromium DOM, before any Update.
  for(const mutation of [
   `${goalControl}.value+=' '`,
   `${goalControl}.remove()`,
   `${goalControl}.after(${goalControl}.cloneNode(true))`,
   `${goalControl}.id='MainContent_txtGoal'`,
   "document.getElementById('MainContent_ddlDept').value='33'",
  ]){
   const changedTransport={...transport,async transition(action,expected){await transport.transition(action,expected);if(action.includes('MainContent_lst_kelola_'))await evaluate(mutation);}};
   await assert.rejects(()=>new PortalCompletionDriver(changedTransport).inspect(goalIdentity),/DETAIL_IDENTITY_MISMATCH|DETAIL_CONTROL_UNKNOWN/);
   assert.equal((await evaluate('window.contract.getState()')).records[0].updates,0);
  }
  for(const phase of ['after-stage','immediate-click','stage-postback']){
   const changedTransport={...transport,async transition(action,expected){
    if(phase==='immediate-click'&&action.includes("get('lbUpdateTask').click()"))await evaluate(`${goalControl}.value+=' '`);
    await transport.transition(action,expected);
    if(phase==='stage-postback'&&action.includes("dispatchEvent(new Event('change'"))await evaluate(`${goalControl}.value+=' '`);
   }};
   const d=new PortalCompletionDriver(changedTransport);
   if(phase==='stage-postback')await assert.rejects(()=>d.stage(goalIdentity,goalIdentity.target),/DETAIL_IDENTITY_MISMATCH/);
   else {
    await d.stage(goalIdentity,goalIdentity.target);
    if(phase==='after-stage')await evaluate(`${goalControl}.value+=' '`);
    await assert.rejects(()=>d.submit(goalIdentity),/DETAIL_IDENTITY_MISMATCH/);
    if(phase==='immediate-click')await assert.rejects(()=>d.submit(goalIdentity),/SUBMIT_ALREADY_ATTEMPTED/);
   }
   assert.equal((await evaluate('window.contract.getState()')).records[0].updates,0);
  }
  for(const phase of ['after-stage','immediate-click','stage-postback']){
   const drift="document.getElementById('MainContent_ArtificialPreserved').value+=' drift'";
   // Generic posted business fields must remain byte-for-byte unchanged too.
   const changedTransport={...transport,async transition(action,expected){
    if(phase==='immediate-click'&&action.includes("get('lbUpdateTask').click()"))await evaluate(drift);
    await transport.transition(action,expected);
    if(phase==='stage-postback'&&action.includes("dispatchEvent(new Event('change'"))await evaluate(drift);
   }};
   const d=new PortalCompletionDriver(changedTransport);
   if(phase==='stage-postback')await assert.rejects(()=>d.stage(goalIdentity,goalIdentity.target),/PRESERVED_FIELDS_CHANGED/);
   else {
    await d.stage(goalIdentity,goalIdentity.target);
    if(phase==='after-stage')await evaluate(drift);
    await assert.rejects(()=>d.submit(goalIdentity),/PRESERVED_FIELDS_CHANGED/);
   }
   assert.equal((await evaluate('window.contract.getState()')).records[0].updates,0);
  }
  for(const mutation of [
   `${goalControl}.remove()`,
   `${goalControl}.after(${goalControl}.cloneNode(true))`,
   `${goalControl}.id='MainContent_txtGoal'`,
   "document.getElementById('MainContent_ddlDept').value='33'",
  ]){
   const changedTransport={...transport,async transition(action,expected){
    if(action.includes("get('lbUpdateTask').click()"))await evaluate(mutation);
    await transport.transition(action,expected);
   }};
   const d=new PortalCompletionDriver(changedTransport);await d.stage(goalIdentity,goalIdentity.target);
   await assert.rejects(()=>d.submit(goalIdentity),/DETAIL_IDENTITY_MISMATCH|DETAIL_CONTROL_UNKNOWN/);
   await assert.rejects(()=>d.submit(goalIdentity),/SUBMIT_ALREADY_ATTEMPTED/);
   assert.equal((await evaluate('window.contract.getState()')).records[0].updates,0);
  }
  for(let index=0;index<2;index++){
   const original=initial.records[index];const {listTaskNo,detailTaskNo,pic,picName,sourceUrl,taskName,goal,target}=original;
   const identity={listTaskNo,detailTaskNo,pic,picName,sourceUrl,taskName,goal,target,dept:'32'};
   const otherBefore=(await evaluate('window.contract.getState()')).records[1-index];
   const driver=new PortalCompletionDriver(transport);
   await evaluate(`window.contract.setFullNavigation(${index===1})`);
   const staged=await driver.stage(identity,target);assert.equal(staged.detail.finish,target);assert.equal(staged.detail.status,'Selesai');
   assert.equal(staged.detail.goal,goal);assert.equal(staged.detail.dept,'32');assert.equal(staged.detail.preservedFields,staged.before.detail.preservedFields);
   assert.equal(await evaluate("document.getElementById('MainContent_ArtificialPreserved').value"),'untouched business value');
   const submitted=await driver.submit(identity);assert.equal(submitted.dialog.visible,true);
   await assert.rejects(()=>driver.submit(identity),/SUBMIT_ALREADY_ATTEMPTED/);
   const filePath=path.join(scratch,`artificial-${index}.txt`);const bytes=Buffer.from(`ARTIFICIAL contract attachment ${index}; NOT live evidence`);fs.writeFileSync(filePath,bytes);
   const file={filePath,fileName:path.basename(filePath),size:bytes.length,mime:'text/plain',sha256:createHash('sha256').update(bytes).digest('hex')};
   // Changed bytes may never be selected or uploaded.
   fs.writeFileSync(filePath,Buffer.alloc(bytes.length,0));await assert.rejects(()=>driver.attach(identity,file),/STAGED_FILE_CHANGED/);fs.writeFileSync(filePath,bytes);
   const attached=await driver.attach(identity,file);assert.equal(attached.dialog.files[0].name,file.fileName);
   assert.equal(await evaluate("document.getElementById('MainContent_fuFileName1').files.length"),0);
   const navBefore=navigations;
   await driver.upload(identity);await assert.rejects(()=>driver.upload(identity),/UPLOAD_ALREADY_ATTEMPTED/);
   if(index===1)assert.ok(navigations>navBefore,'full-page upload postback was awaited');
   const saved=await driver.captureSaved(identity);assert.equal(saved.detail.status,'Selesai');assert.equal(saved.detail.finish,target);assert.equal(saved.detail.updateEnabled,false);
   assert.ok(saved.targetTables.flat(2).includes('Solved'));assert.equal(saved.row.cells[15],file.fileName);assert.equal(saved.attachments.detail[0].text,file.fileName);
   assert.equal(saved.row.cells[12],index===0?'Solved':'Update Task');assert.equal(saved.row.cells[14],index===0?'26-Okt-2026':'');
   assert.ok(saved.info.text.includes(index===0?'Solved':'Update Task'));assert.equal(saved.attachmentVerification,'metadata_only');
   assert.ok(saved.detailScreenshot.bytes>0);assert.ok(saved.infoScreenshot.bytes>0);
   const state=await evaluate('window.contract.getState()');assert.equal(state.records[index].updates,1);assert.equal(state.records[index].uploads,1);assert.equal(state.records[index].uploadedBody,bytes.toString('utf8'),'fixture callback consumed actual Chromium File bytes');assert.equal(state.unrelated,initial.unrelated);assert.deepEqual(state.records[1-index],otherBefore);
   // Saved/locked state is never eligible for another completion.
   await assert.rejects(()=>new PortalCompletionDriver(transport).stage(identity,target),/TASK_NOT_WRITABLE/);
  }
  const identity=Object.fromEntries(['listTaskNo','detailTaskNo','pic','picName','sourceUrl','taskName','goal','target'].map(k=>[k,initial.records[0][k]]));
  await assert.rejects(()=>new PortalCompletionDriver(transport).inspect({...identity,goal:identity.goal+' '}),/LIST_IDENTITY_MISMATCH/);
  await assert.rejects(()=>new PortalCompletionDriver(transport).inspect({...identity,detailTaskNo:identity.listTaskNo}),/FIXTURE_TRANSITION_TIMEOUT/);
  await win.loadURL('https://wrong-origin.invalid/Modul/ISO/FormInputTask.aspx');
  await assert.rejects(()=>new PortalCompletionDriver(transport).inspect(identity),/ORIGIN_REJECTED/);
  assert.equal(cdpCalls.length,2);assert.equal(win.webContents.debugger.isAttached(),false);
  console.log(JSON.stringify({status:'PASS',source:'ARTIFICIAL isolated contract fixture, NOT live evidence',browser:'actual Electron Chromium',livePortal:false,network:'all HTTPS intercepted in isolated in-memory session',updates:2,uploads:2,cdpCalls,navigations,intercepted,storeDateDiscrepancyRetained:true,fifoStatusDiscrepancyRetained:true}));
 } finally {win.destroy();app.quit();}
}).catch(error=>{console.error(error);app.exit(1);});
