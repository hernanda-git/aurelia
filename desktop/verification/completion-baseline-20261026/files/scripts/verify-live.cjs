/* Manual secure sign-in followed by real packaged-app sync. Never reads credentials. */
const {_electron}=require('playwright');const fs=require('node:fs');const path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..');const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const executable=path.join(root,'release/PES-win32-x64/PES.exe');
 const app=await _electron.launch({executablePath:executable,args:[],env,timeout:45000});
 try{
  const page=await app.firstWindow();await page.waitForFunction(()=>!!window.pes);
  await page.evaluate(()=>window.pes.openConnection());
  console.log('PES_LOGIN_WINDOW_READY — sign in directly in the official PES window.');
  const deadline=Date.now()+300000;
  let connected=false;
  while(Date.now()<deadline){const s=await page.evaluate(()=>window.pes.getState());if(s.connection==='connected'){connected=true;break;}await new Promise(r=>setTimeout(r,1000));}
  if(!connected){fs.writeFileSync(path.join(root,'verification/live-app-result.json'),JSON.stringify({at:new Date().toISOString(),status:'BLOCKED',reason:'Manual sign-in not completed',livePesSync:false},null,2));console.log('BLOCKED: sign-in not completed');return;}
  console.log('PES_AUTHENTICATED — running real read-only sync.');
  await page.evaluate(()=>window.pes.sync());
  const state=await page.evaluate(()=>window.pes.getState());
  const snapshot=state.snapshot;
  const passed=state.sync.phase==='success'&&snapshot?.source==='live'&&snapshot.tasks.every(t=>t.history.text.includes(t.TaskNo));
  const result={at:new Date().toISOString(),status:passed?'PASS':'FAILED',livePesSync:passed,sync:state.sync,lastError:state.lastError,snapshot:snapshot?{source:snapshot.source,retrievedAt:snapshot.retrievedAt,scope:snapshot.scope,totalScanned:snapshot.totalScanned,selected:snapshot.tasks.length,approval:snapshot.tasks.filter(t=>t.Status==='Approval').length,open:snapshot.tasks.filter(t=>t.Status==='Open').length,histories:snapshot.tasks.filter(t=>t.history.text.includes(t.TaskNo)).length}:null};
  fs.writeFileSync(path.join(root,'verification/live-app-result.json'),JSON.stringify(result,null,2));
  await page.screenshot({path:path.join(root,'verification/live-desktop.png')});console.log(JSON.stringify(result,null,2));
 }finally{await app.close();}
})().catch(error=>{console.error('Live verification could not finish:',String(error.message).slice(0,400));process.exitCode=1});
