const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
(async()=>{
 const {packager}=await import('@electron/packager');
 const root=path.resolve(__dirname,'..');
 const pkg=require('../package.json');
 // Candidate packaging can target a separate folder without replacing the running release.
 const output=process.env.PES_PACKAGE_OUT?path.resolve(process.env.PES_PACKAGE_OUT):path.join(root,'release');
 const version=require('../node_modules/electron/package.json').version;
 const cache=path.join(os.homedir(),'AppData/Local/hermes/cache/scratch/pes-electron');
 const tmp=path.join(os.homedir(),'AppData/Local/hermes/cache/scratch/pes-packager');fs.mkdirSync(tmp,{recursive:true});
 const archive=path.join(cache,`electron-v${version}-win32-x64.zip`);
 const paths=await packager({dir:root,name:'PES',platform:'win32',arch:'x64',electronVersion:version,appVersion:pkg.version,out:output,overwrite:true,asar:true,prune:true,icon:path.join(root,'assets/icon.ico'),tmpdir:tmp,electronZipDir:fs.existsSync(archive)?cache:undefined,
 ignore:[/^\/(?:src|tests|verification|release|scripts)(?:\/|$)/,/^\/(?:\.implementation\.lock|IMPLEMENTATION\.md|tsconfig[^/]*|vite[^/]*|vitest[^/]*|package-lock\.json)$/],
 win32metadata:{CompanyName:'Hernanda',FileDescription:'PES — Personal tasks workspace',ProductName:'PES',InternalName:'PES'}});
 console.log(JSON.stringify({packages:paths,version:pkg.version,electron:version},null,2));
})().catch(error=>{console.error(error);process.exitCode=1});
