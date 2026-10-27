// Deterministic candidate staging avoids the full-tree dependency pruner.
// Run npm ls --omit=dev --parseable --all into verification/production-dependency-paths.json first.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
(async()=>{
 const root=path.resolve(__dirname,'..');const scratch=path.join(os.homedir(),'AppData/Local/hermes/cache/scratch');
 const stage=process.env.PES_REUSE_STAGE?path.resolve(process.env.PES_REUSE_STAGE):fs.mkdtempSync(path.join(scratch,'pes-assessment-stage-'));
 if(!stage.startsWith(scratch+path.sep+'pes-assessment-stage-')||fs.lstatSync(stage).isSymbolicLink())throw Error('Unsafe staging root');
 console.log('staging',stage);
 const dependencies=JSON.parse(fs.readFileSync(path.join(root,'verification/production-dependency-paths.json'),'utf8'));
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 const manifest={...pkg,version:'0.2.0-assessment.1'};delete manifest.devDependencies;delete manifest.scripts;
 for(const name of ['dist','assets'])fs.cpSync(path.join(root,name),path.join(stage,name),{recursive:true});
 fs.writeFileSync(path.join(stage,'package.json'),JSON.stringify(manifest,null,2));
 const owned=path.join(root,'node_modules')+path.sep;
 if(!process.env.PES_REUSE_STAGE)for(const dependency of dependencies){
  const absolute=path.resolve(dependency);if(!absolute.startsWith(owned)||!fs.lstatSync(absolute).isDirectory()||fs.lstatSync(absolute).isSymbolicLink())throw Error('Unsafe dependency path');
  fs.cpSync(absolute,path.join(stage,path.relative(root,absolute)),{recursive:true,filter:p=>!p.split(path.sep).some(s=>['test','tests','__tests__','.vite','.vitest-cache'].includes(s))});
 }
 const {createPackage}=await import('@electron/asar');
 const out=path.join(root,'release/assessment-candidate/PES-win32-x64');
 const runtime=path.join(root,'release/PES-win32-x64');
 if(!fs.existsSync(path.join(runtime,'PES.exe')))throw Error('Verified existing runtime missing');
 // Reuse the unchanged local verified runtime; no signing or PE metadata rewrite is claimed.
 fs.mkdirSync(out,{recursive:true});fs.cpSync(runtime,out,{recursive:true});
 await createPackage(stage,path.join(out,'resources/app.asar'));
 const folders=[out];
 const result={at:new Date().toISOString(),status:'PASS',version:manifest.version,folders,staging:stage,productionDependencyPaths:dependencies.length,prune:false,runtimeSource:runtime,peMetadataUnchanged:true,existingReleaseReplaced:false,liveWritesEnabled:false};
 fs.writeFileSync(path.join(root,'verification/completion-package-build.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
