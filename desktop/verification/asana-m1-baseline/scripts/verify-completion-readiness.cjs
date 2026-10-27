// Read-only real-cache smoke: does not contact PES, write its cache, or configure Hermes.
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const {spawn}=require('node:child_process');const readline=require('node:readline');
(async()=>{
 if(process.argv.length!==3||!path.isAbsolute(process.argv[2]))throw Error('Supply one explicit absolute immutable snapshot path');
 const file=process.argv[2],before=fs.readFileSync(file);const cache=JSON.parse(before);const root=path.resolve(__dirname,'..');
 const child=spawn(process.execPath,[path.join(root,'dist/main/agent/stdio.js'),'--snapshot',file],{stdio:['pipe','pipe','pipe']});
 let n=0,stderr='';const pending=new Map();child.stderr.on('data',c=>stderr+=c);
 const lines=readline.createInterface({input:child.stdout});lines.on('line',line=>{const v=JSON.parse(line);const wait=pending.get(v.id);if(wait){clearTimeout(wait.timer);pending.delete(v.id);wait.resolve(v);}});
 const rpc=(method,params={})=>new Promise((resolve,reject)=>{const id=++n;const timer=setTimeout(()=>{pending.delete(id);reject(Error('Protocol timeout'));},10000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
 const call=async(name,args={})=>{const r=await rpc('tools/call',{name,arguments:args});if(r.error||r.result.isError)throw Error('Read-only call failed');return JSON.parse(r.result.content[0].text);};
 try{
  const init=await rpc('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'pes-readiness-local-smoke',version:'1'}});if(!init.result)throw Error('Initialization failed');
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
  const tools=(await rpc('tools/list')).result.tools.map(t=>t.name).sort();
  if(JSON.stringify(tools)!==JSON.stringify(['pes_assess_completion','pes_completion_readiness','pes_get_completion','pes_list_candidates']))throw Error('Unexpected tool surface');
  const readiness=await call('pes_completion_readiness');const rows=[];let page;
  do{page=await call('pes_list_candidates',{offset:rows.length,limit:100});rows.push(...page.candidates);}while(page.hasMore);
  if(rows.length!==page.total||new Set(rows.map(r=>r.TaskNo)).size!==rows.length)throw Error('Count or identity mismatch');
  if(readiness.authorizedToCommit!==false||readiness.commitReady!==false)throw Error('Unsafe readiness');
  if(Buffer.compare(before,fs.readFileSync(file))!==0)throw Error('Cache changed');if(stderr)throw Error('Adapter stderr');
  const statuses={};for(const r of rows)statuses[r.Status]=(statuses[r.Status]||0)+1;
  const result={at:new Date().toISOString(),status:'PASS',track:'real immutable LOCAL CACHE over actual MCP stdio, NOT live PES',source:cache.source,retrievedAt:cache.retrievedAt,snapshotSha256:crypto.createHash('sha256').update(before).digest('hex'),tools,recordsRead:rows.length,statuses,scopeCoverage:readiness.snapshot.scopeCoverage,stale:readiness.snapshot.stale,authorizedToCommit:false,livePortal:false,cacheUnchanged:true,hermesConnected:false};
  fs.writeFileSync(path.join(root,'verification/completion-real-cache-mcp.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
 }finally{for(const p of pending.values())clearTimeout(p.timer);child.kill();lines.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
