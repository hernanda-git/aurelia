// Real desktop test under isolated profiles; never invokes remote writes or real user cache.
const {_electron:electron}=require('playwright');
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..'),dir=path.join(root,'verification');fs.mkdirSync(dir,{recursive:true});
 const profile=fs.mkdtempSync(path.join(dir,'completion-desktop-'));const env={...process.env,PES_FOCUS_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;
 const executable=process.env.PES_FOCUS_TEST_EXECUTABLE||require('electron');const args=process.env.PES_FOCUS_TEST_EXECUTABLE?[]:[root];let app;
 const checks=[];
 try{
  app=await electron.launch({executablePath:executable,args,env,cwd:root,timeout:45000});const page=await app.firstWindow();
  await page.waitForFunction(()=>!!window.pes);const state=await page.evaluate(()=>window.pes.getState());
  assert.equal(state.completion?.mode,'assessment-only');assert.equal(state.completion.liveWritesEnabled,false);
  assert.ok(state.completion.reasonCodes.includes('AGENT_ENROLLMENT_UNVERIFIED'));checks.push('actual desktop discloses enrollment blocker and never grants live writes');
  const names=await page.evaluate(()=>Object.keys(window.pes));assert.ok(!names.some(n=>/complete|commit|enroll|upload/i.test(n)));checks.push('actual preload exposes no completion authority');
  await page.getByTestId('nav-settings').click();await page.getByTestId('completion-observer').waitFor();
  assert.ok(await page.getByText('Hanya agent · assessment-only',{exact:true}).isVisible());
  assert.equal(await page.getByRole('button',{name:/selesaikan|complete task|commit completion|retry completion/i}).count(),0);
  checks.push('settings shows observer-only completion status with no complete/retry button');
  await app.evaluate(({session})=>session.fromPartition('persist:pes-focus-portal').webRequest.onBeforeRequest((_d,cb)=>cb({cancel:true})));
  await page.evaluate(()=>window.pes.sync());const after=await page.evaluate(()=>window.pes.getState());
  assert.equal(after.completion.operationCount,0);assert.equal(after.snapshot.id,state.snapshot.id);checks.push('human Sync remains read-only and does not create completion operations');
  assert.deepEqual(after.snapshot.tasks,state.snapshot.tasks);checks.push('original imported task data remains untouched');
  await page.screenshot({path:path.join(dir,'completion-observer.png')});
  const result={at:new Date().toISOString(),status:'PASS',checks,profile,packaged:!!process.env.PES_FOCUS_TEST_EXECUTABLE,liveWrites:false};
  fs.writeFileSync(path.join(dir,process.env.PES_FOCUS_TEST_EXECUTABLE?'completion-packaged-e2e.json':'completion-desktop-e2e.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{if(app)await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
