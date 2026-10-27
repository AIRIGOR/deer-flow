// Explicitly authorized isolated cloud-data test. Never operates on the application stores.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
const here=path.dirname(fileURLToPath(import.meta.url));
const appRoot=path.resolve(here,'../..');
const [siteId,helperPath,outputRoot]=process.argv.slice(2);
assert(siteId&&helperPath&&outputRoot,'Usage: node run-cloud.mjs STAGING_SITE_ID CLI_AUTH_HELPER OUTPUT');
assert(/^[0-9a-f-]{36}$/.test(siteId));
const runId=randomUUID();const output=path.join(path.resolve(outputRoot),runId);fs.mkdirSync(output,{recursive:true});
const bundle=path.join(output,'runner.mjs');
const report={status:'FAIL',run_id:runId,site_id:siteId,started_at:new Date().toISOString(),node_version:process.version,scenarios:[],
  limits:'Real application worker and Netlify storage across killed host processes, with synthetic gateway/TXT fixtures. No deployed function invocation, real LLM, PDF, cross-store ACID, or operational-workspace access.'};
const persist=()=>fs.writeFileSync(path.join(output,'proof.json'),JSON.stringify(report,null,2)+'\n');
try{
  report.source_files={};
  for(const file of ['netlify/functions/rigor-api.mts','netlify/functions/_shared/deerflow.ts','netlify/functions/_shared/source-provenance.ts'])report.source_files[file]=createHash('sha256').update(fs.readFileSync(path.join(appRoot,file))).digest('hex');
  buildSync({entryPoints:[path.join(here,'runner.mjs')],outfile:bundle,bundle:true,platform:'node',target:'node24',format:'esm',
    banner:{js:"import {createRequire} from 'node:module'; const require=createRequire(import.meta.url);"},
    alias:{'@netlify/blobs':path.join(here,'cloud-adapter.mjs'),'pdf-parse':path.join(here,'pdf-stub.mjs')}});
  persist();
  for(const mode of ['after-claim','before-commit','conflict-before-commit']){
    const state=path.join(output,mode);fs.mkdirSync(state);
    const prefix=`rigorrec-${runId.slice(0,8)}-${mode.replaceAll('-','')}`;
    const env={...process.env,PROOF_STATE_DIR:state,PROOF_STORE_PREFIX:prefix,PROOF_SITE_ID:siteId,
      PROOF_AUTH_HELPER:pathToFileURL(path.resolve(helperPath)).href,PROOF_BLOBS_SDK:pathToFileURL(path.join(appRoot,'node_modules/@netlify/blobs/dist/main.js')).href};
    const run=command=>JSON.parse(execFileSync(process.execPath,[bundle,command],{env,encoding:'utf8',timeout:60000,stdio:['ignore','pipe','pipe']}).trim().split(/\r?\n/).at(-1));
    const scenario={mode,store_names:[prefix+'-rigor-beta',prefix+'-rigor-integration'],status:'STARTED'};
    report.scenarios.push(scenario);persist();
    const initialization=run('init');
    const child=spawn(process.execPath,[bundle,'run'],{env:{...env,RECOVERY_MODE:mode},stdio:['ignore','pipe','pipe']});
    // Retain raw child output in memory only: cloud SDK errors may contain request details.
    child.stdout.resume();child.stderr.resume();
    let exitResult;const ended=new Promise(resolve=>child.once('exit',(code,signal)=>{exitResult={code,signal};resolve(exitResult);}));
    const marker=path.join(state,'crash-point.json');const deadline=Date.now()+60000;
    while(!fs.existsSync(marker)&&!exitResult&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
    if(!fs.existsSync(marker)){child.kill('SIGKILL');await ended;throw new Error('Expected isolated cloud fault hook not reached');}
    let termination,resumed;
    if(mode==='conflict-before-commit'){
      scenario.concurrent_change=run('concurrent-change');
      fs.writeFileSync(path.join(state,'release-commit.json'),'{}');
      const timer=setTimeout(()=>child.kill('SIGKILL'),60000);termination=await ended;clearTimeout(timer);
      assert.equal(termination.code,0,'Conflict handling did not finish');resumed=run('check-conflict');
    }else{
      child.kill('SIGKILL');termination=await ended;
      assert(termination.signal==='SIGKILL'||termination.code!==0,'Child was not interrupted');resumed=run('resume');
    }
    const retried=run('retry');
    Object.assign(scenario,{status:'PASS',initialization,termination,crash_point:JSON.parse(fs.readFileSync(marker)),resumed,retried,synthetic_data_retained:true});persist();
  }
  report.status='PASS';report.completed_at=new Date().toISOString();persist();
  console.log(JSON.stringify({status:'PASS',output,scenarios:report.scenarios.length}));
}catch(error){
  report.error={name:error.name,message:'Isolated cloud recovery proof failed; raw SDK/child details withheld.'};persist();
  console.error(JSON.stringify({status:'FAIL',output,error:report.error}));process.exitCode=1;
}
