// Runs actual application worker code in new containers, with synthetic model/storage adapters.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';

const here=path.dirname(fileURLToPath(import.meta.url));
const appRoot=path.resolve(here,'../..');
const image=process.argv[2]||'deer-flow-dev-frontend:latest';
const outputRoot=path.resolve(process.argv[3]||path.join(appRoot,'.artifacts','recovery-proof'));
const runId=randomUUID();
const output=path.join(outputRoot,runId);
const bundle=path.join(output,'bundle');
fs.mkdirSync(bundle,{recursive:true});
const docker=(args,timeout=30000)=>execFileSync('docker',args,{encoding:'utf8',timeout,stdio:['ignore','pipe','pipe']}).trim();
const parseLast=text=>JSON.parse(text.trim().split(/\r?\n/).at(-1));
const owned=[];
const report={status:'FAIL',run_id:runId,image,started_at:new Date().toISOString(),scenarios:[],
  limits:'Application process control flow uses durable local Blob semantics and a synthetic gateway; no live LLM, Netlify app request, PDF parsing, cross-store ACID, or operational data is certified.'};
const persist=()=>fs.writeFileSync(path.join(output,'proof.json'),JSON.stringify(report,null,2)+'\n');
try{
  report.image_id=docker(['image','inspect','--format','{{.Id}}',image]); // Never pull images implicitly.
  report.node_version=docker(['run','--rm','--network','none','--entrypoint','node',image,'--version']);
  report.source_files={};
  for(const file of ['netlify/functions/rigor-api.mts','netlify/functions/_shared/deerflow.ts','netlify/functions/_shared/source-provenance.ts']){
    report.source_files[file]=createHash('sha256').update(fs.readFileSync(path.join(appRoot,file))).digest('hex');
  }
  buildSync({entryPoints:[path.join(here,'runner.mjs')],outfile:path.join(bundle,'runner.mjs'),bundle:true,platform:'node',target:'node22',format:'esm',
    banner:{js:"import {createRequire} from 'node:module'; const require=createRequire(import.meta.url);"},
    alias:{'@netlify/blobs':path.join(here,'store-adapter.mjs'),'pdf-parse':path.join(here,'pdf-stub.mjs')}});
  persist();
  for(const mode of ['after-claim','before-commit']){
    const state=path.join(output,mode);fs.mkdirSync(state);
    const mounts=['--network','none','--mount',`type=bind,source=${bundle},target=/proof,readonly`,'--mount',`type=bind,source=${state},target=/state`];
    const run=command=>parseLast(docker(['run','--rm',...mounts,'--entrypoint','node',image,'/proof/runner.mjs',command]));
    const initialization=run('init');
    const name=`rigor-proof-${mode}-${runId.slice(0,8)}`;
    const containerId=docker(['run','-d','--name',name,'--label',`codex.test=rigor-recovery-${runId}`,...mounts,'--env',`RECOVERY_MODE=${mode}`,'--entrypoint','node',image,'/proof/runner.mjs','run']);
    owned.push(name);
    const marker=path.join(state,'crash-point.json');const deadline=Date.now()+15000;
    while(!fs.existsSync(marker)&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
    assert(fs.existsSync(marker),'Fault hook was not reached');
    const metadata=JSON.parse(docker(['inspect',name]))[0];
    assert.equal(metadata.Config.Labels['codex.test'],`rigor-recovery-${runId}`);
    docker(['kill','--signal','KILL',name]);
    const stopped=JSON.parse(docker(['inspect',name]))[0];assert.equal(stopped.State.ExitCode,137);
    const resumed=run('resume');const retried=run('retry');
    report.scenarios.push({mode,container_id:containerId,exit_code:137,initialization,crash_point:JSON.parse(fs.readFileSync(marker)),resumed,retried});persist();
  }
  report.status='PASS';report.completed_at=new Date().toISOString();persist();
  console.log(JSON.stringify({status:report.status,output,scenarios:report.scenarios.length,image_id:report.image_id}));
}catch(error){
  report.error={name:error.name,message:error.message};persist();
  console.error(JSON.stringify({status:'FAIL',output,error:report.error}));process.exitCode=1;
}finally{
  for(const name of owned){
    try{
      const metadata=JSON.parse(docker(['inspect',name]))[0];
      if(metadata.Config.Labels['codex.test']!==`rigor-recovery-${runId}`)continue;
      if(metadata.State.Running)docker(['kill','--signal','KILL',name]);
      docker(['rm',name]); // Only containers created and label-verified by this run; bind-mounted evidence is retained.
    }catch{ /* Preserve the failed run/evidence; never broaden cleanup to unrelated containers. */ }
  }
}
