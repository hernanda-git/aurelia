// Actual Electron regression: an optional projection failure must not prevent cached tasks from opening.
const {_electron:electron}=require('playwright');
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const profile=fs.mkdtempSync(path.join(root,'verification/startup-collision-'));
 const workspace=path.join(profile,'agent-workspace');fs.mkdirSync(workspace);
 const keep=path.join(workspace,'keep.txt');fs.writeFileSync(keep,'Unrelated user data: never overwrite.');
 const env={...process.env,PES_FOCUS_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 let app;
 try{
  const executable=process.env.PES_FOCUS_TEST_EXECUTABLE||require('electron');
  app=await electron.launch({executablePath:executable,args:process.env.PES_FOCUS_TEST_EXECUTABLE?[]:[path.join(__dirname,'startup-bootstrap.cjs')],env,cwd:root,timeout:30000});
  const page=await app.firstWindow();await page.waitForFunction(()=>!!window.pes,{timeout:10000});
  const state=await page.evaluate(()=>window.pes.getState());
  assert.equal(state.snapshot.tasks.length,8);assert.ok(state.agentWorkspace.error);
  assert.equal(state.agentWorkspace.path,workspace);
  assert.equal(fs.readFileSync(keep,'utf8'),'Unrelated user data: never overwrite.');
  assert.ok(!fs.existsSync(path.join(profile,'startup-error.json')));
  await page.getByTestId('nav-settings').click();
  assert.ok(await page.getByTestId('agent-workspace-open').isDisabled());
  assert.ok(await page.locator('.agent-workspace [role="alert"]').isVisible());
  const preserved=path.join(profile,'preserved-unrelated-folder');fs.renameSync(workspace,preserved);
  await page.evaluate(()=>window.pes.updateSettings({compact:true}));
  const recovered=await page.evaluate(()=>window.pes.getState());assert.equal(recovered.agentWorkspace.error,null);assert.equal(recovered.agentWorkspace.taskCount,8);
  assert.equal(recovered.snapshot.id,state.snapshot.id);assert.equal(fs.readFileSync(path.join(preserved,'keep.txt'),'utf8'),'Unrelated user data: never overwrite.');
  assert.ok(await page.getByTestId('agent-workspace-open').isEnabled());
  const evidence={at:new Date().toISOString(),status:'PASS',executable,profile,checks:['cached tasks remain available when projection initialization fails','unrelated workspace data is not overwritten','projection error is visible and workspace action is disabled','projection recovers after the collision is resolved without restarting the application','recovery preserves the source snapshot and unrelated files'],livePesSync:false};
  fs.writeFileSync(path.join(root,process.env.PES_FOCUS_TEST_EXECUTABLE?'verification/packaged-startup-collision.json':'verification/startup-collision.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
 }finally{if(app)await app.close().catch(()=>{});}
})().catch(error=>{console.error(error);process.exitCode=1});
