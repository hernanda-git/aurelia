const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
(async()=>{
 const {listPackage,extractFile}=await import('@electron/asar');
 const root=path.resolve(__dirname,'..');const folder=path.join(root,'release/PES-win32-x64');const asar=path.join(folder,'resources/app.asar');
 const files=listPackage(asar).map(file=>file.split(path.sep).join('/'));
 const forbidden=files.filter(file=>/\/(?:verification|tests|source)\/|(?:^|\/)(?:Cookies|Login Data|workspace\.json|\.implementation\.lock)$/.test(file));
 const required=['dist/main/main/main.js','dist/main/main/preload.js','dist/main/main/portal.js','dist/main/main/portal-data.js','dist/main/main/sync.js','dist/main/main/agent-workspace.js','dist/main/main/store.js','dist/main/shared/domain.js','dist/renderer/index.html','assets/seed.json'];
 const compiledMatch=required.every(file=>{const bundled=extractFile(asar,file.split('/').join(path.sep));return Buffer.compare(bundled,fs.readFileSync(path.join(root,file)))===0});
 const contains=required.every(file=>files.includes('/'+file));
 if(forbidden.length||!contains||!compiledMatch)throw new Error('Package integrity check failed');
 const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 const result={at:new Date().toISOString(),status:'PASS',entries:files.length,forbiddenPaths:forbidden,requiredPathsPresent:contains,bundledFilesMatchBuild:compiledMatch,exeSha256:hash(path.join(folder,'PES.exe')),asarSha256:hash(asar)};
 fs.writeFileSync(path.join(root,'verification/package-inspection.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
})().catch(error=>{console.error(error);process.exitCode=1});
