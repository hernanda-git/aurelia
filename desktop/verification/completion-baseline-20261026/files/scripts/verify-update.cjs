// Real user's profile verification: read cache and generated projection only; no portal/network sync.
const {_electron:electron}=require('playwright');
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..');const evidenceDir=path.join(root,'verification');
 const baseline=JSON.parse(fs.readFileSync(path.join(evidenceDir,'update-0.2-baseline.json'),'utf8'));
 const original=JSON.parse(fs.readFileSync(baseline.backup,'utf8'));
 const executable=path.join(root,'release/PES-win32-x64/PES.exe');
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.PES_FOCUS_DATA_DIR;
 let app;
 try{
  app=await electron.launch({executablePath:executable,args:[],env,cwd:root,timeout:45000});
  const page=await app.firstWindow();await page.waitForFunction(()=>!!window.pes&&document.querySelectorAll('[data-testid="task-row"]').length>0);
  const profile=await app.evaluate(({app})=>app.getPath('userData'));
  assert.equal(path.resolve(profile),path.resolve(baseline.userData));
  const state=await page.evaluate(()=>window.pes.getState());
  assert.deepEqual(state.snapshot,original.snapshot);assert.deepEqual(state.preferences,original.preferences);assert.equal(state.focusTaskId,original.focusTaskId);assert.deepEqual(state.settings,original.settings);assert.equal(state.lastAttemptAt,original.lastAttemptAt);
  assert.equal(state.agentWorkspace.error,null);
  const workspace=path.resolve(root,'../data/agent-workspace');assert.equal(state.agentWorkspace.path,workspace);
  const index=JSON.parse(fs.readFileSync(path.join(workspace,'index.json'),'utf8'));
  const projected=JSON.parse(fs.readFileSync(path.join(workspace,index.currentPath),'utf8'));
  assert.deepEqual(projected.snapshot,state.snapshot);assert.equal(index.tasks.length,state.snapshot.tasks.length);
  for(const task of state.snapshot.tasks){
   const entry=index.tasks.find(item=>item.TaskNo===task.TaskNo);assert.ok(entry&&entry.historyAvailable&&entry.inCurrentScope);
   assert.deepEqual(JSON.parse(fs.readFileSync(path.join(workspace,entry.sourcePath),'utf8')).task,task);
   assert.ok(fs.existsSync(path.join(workspace,entry.path,'work','notes.md')));
  }
  assert.ok(await page.getByRole('heading',{name:'List Tasks',exact:true}).isVisible());assert.equal(await page.title(),'PES');
  await page.getByTestId('task-row').first().locator('.task-row-main').click();
  await page.screenshot({path:path.join(evidenceDir,'PES-0.2-real-user.png')});
  await page.getByTestId('nav-settings').click();await page.screenshot({path:path.join(evidenceDir,'PES-0.2-agent-workspace-real.png')});
  await app.close();app=null;
  const persisted=JSON.parse(fs.readFileSync(path.join(profile,'workspace.json'),'utf8'));
  assert.deepEqual(persisted.snapshot,original.snapshot);assert.deepEqual(persisted.preferences,original.preferences);assert.equal(persisted.focusTaskId,original.focusTaskId);
  const result={at:new Date().toISOString(),status:'PASS',executable,profile,agentWorkspace:workspace,taskCount:state.snapshot.tasks.length,taskFolders:index.tasks.length,source:state.snapshot.source,retrievedAt:state.snapshot.retrievedAt,snapshotId:state.snapshot.id,sourceRowsAvailable:index.sourceRowsAvailable,sourceSnapshotPreserved:true,preferencesPreserved:true,settingsPreserved:true,livePesSync:false,browserCredentialsReadOrCopied:false,screenshots:['PES-0.2-real-user.png','PES-0.2-agent-workspace-real.png']};
  fs.writeFileSync(path.join(evidenceDir,'update-0.2-user-data.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }finally{if(app)await app.close().catch(()=>{});}
})().catch(error=>{console.error(error);process.exitCode=1});
