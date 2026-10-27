// Actual Chromium DOM regression against the preserved PES table, not a mocked document.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const {captureGridScript,decodeGrid}=require(path.join(root,'dist/main/main/portal-data.js'));
app.setPath('userData',path.join(root,'verification/portal-dom-profile'));
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
 try{
  const original=JSON.parse(fs.readFileSync(path.join(root,'../reports/2026-10-26/pes_filtered_raw.json'),'utf8'));
  await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(original.html));
  const captured=await win.webContents.executeJavaScript(captureGridScript);
  const result=decodeGrid(captured);
  assert.equal(result.rows.length,32);assert.equal(result.rows.filter(r=>['Approval','Open'].includes(r.task.Status)).length,8);
  assert.equal(new Set(result.rows.map(r=>r.task.TaskNo)).size,32);
  const evidence={at:new Date().toISOString(),browser:'actual Electron Chromium',source:'preserved real PES table HTML',rows:32,selected:8,status:'PASS',livePortal:false};
  fs.writeFileSync(path.join(root,'verification/portal-dom.json'),JSON.stringify(evidence,null,2));
  console.log(JSON.stringify(evidence));
 }finally{win.destroy();app.quit();}
}).catch(error=>{console.error(error);app.exit(1)});
