// Separate Asana milestone candidate. Never replaces parked assessment or installed release.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const scratch=path.join(os.homedir(),'AppData/Local/hermes/cache/scratch');fs.mkdirSync(scratch,{recursive:true});
 const stage=fs.mkdtempSync(path.join(scratch,'pes-asana-m1-stage-'));
 const paths=JSON.parse(fs.readFileSync(path.join(root,'verification/production-dependency-paths.json'),'utf8'));
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));const manifest={...pkg,version:'0.2.0-asana-m1.1'};delete manifest.devDependencies;delete manifest.scripts;
 for(const name of ['dist','assets'])fs.cpSync(path.join(root,name),path.join(stage,name),{recursive:true});
 fs.writeFileSync(path.join(stage,'package.json'),JSON.stringify(manifest,null,2));
 const owned=path.join(root,'node_modules')+path.sep;
 for(const item of paths){const full=path.resolve(item);if(!full.startsWith(owned)||fs.lstatSync(full).isSymbolicLink()||!fs.lstatSync(full).isDirectory())throw Error('UNSAFE_DEPENDENCY_PATH');fs.cpSync(full,path.join(stage,path.relative(root,full)),{recursive:true,filter:p=>!p.split(path.sep).some(s=>['test','tests','__tests__','.vite','.vitest-cache'].includes(s))});}
 const runtime=path.join(root,'release/PES-win32-x64');const out=path.join(root,'release/asana-milestone1/PES-win32-x64');
 if(!fs.existsSync(path.join(runtime,'PES.exe')))throw Error('EXISTING_RUNTIME_MISSING');
 fs.mkdirSync(out,{recursive:true});fs.cpSync(runtime,out,{recursive:true});
 const {createPackage,listPackage,extractFile}=await import('@electron/asar');const asar=path.join(out,'resources/app.asar');await createPackage(stage,asar);
 const entries=listPackage(asar).map(p=>p.split(path.sep).join('/'));
 const forbidden=entries.filter(p=>/\/(?:verification|tests|source)\/|(?:^|\/)(?:Cookies|Login Data|workspace\.json|asana-state\.json|taskbridge\.db|\.implementation\.lock)$/.test(p));
 const required=['dist/main/main/asana-catalog.js','dist/main/main/asana-store.js','dist/main/main/asana-ipc.js','dist/main/shared/asana-types.js','dist/main/shared/asana-domain.js','dist/main/main/main.js','dist/main/main/preload.js','dist/renderer/index.html'];
 for(const file of required){if(!entries.includes('/'+file)||!extractFile(asar,file.split('/').join(path.sep)).equals(fs.readFileSync(path.join(root,file))))throw Error('BUNDLE_MISMATCH');}
 if(forbidden.length)throw Error('FORBIDDEN_BUNDLE_PATHS');
 const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 const result={at:new Date().toISOString(),status:'PASS',version:manifest.version,candidate:out,entries:entries.length,requiredFilesMatchBuild:true,forbiddenPaths:forbidden,exeSha256:sha(path.join(out,'PES.exe')),asarSha256:sha(asar),installedReleaseReplaced:false,parkedAssessmentReplaced:false,liveWrites:false,source:'catalog_only'};
 fs.writeFileSync(path.join(root,'verification/asana-m1-package.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
