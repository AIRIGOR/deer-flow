import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import api,{processUpload} from '../../netlify/functions/rigor-api.mts';
import {createWorkspace,activeProduction,readiness} from '../../netlify/functions/_shared/model.ts';
import {sourceProvenance} from '../../netlify/functions/_shared/source-provenance.ts';
import {getStore} from '@netlify/blobs';
const root=process.env.PROOF_STATE_DIR||'/state';
const command=process.argv[2];
const store=getStore('rigor-beta');
const context={deploy:{context:'production',id:'synthetic-docker-recovery'},waitUntil:p=>waits.push(p)};
const waits=[];
globalThis.Netlify={env:{get:key=>key==='RIGOR_DEERFLOW_URL'?'https://synthetic-gateway.invalid':'SYNTHETIC_NO_REAL_CREDENTIAL'}};
globalThis.fetch=async(url,init)=>{
  if(String(url).includes('rigor-document-background')){
    fs.writeFileSync(root+'/retry-job.json',String(init.body));return new Response(null,{status:202});
  }
  assert(String(url).startsWith('https://synthetic-gateway.invalid/'));
  const count=fs.existsSync(root+'/gateway-count.json')?JSON.parse(fs.readFileSync(root+'/gateway-count.json')):0;
  fs.writeFileSync(root+'/gateway-count.json',JSON.stringify(count+1));
  if(process.env.RECOVERY_MODE==='after-claim'){
    fs.writeFileSync(root+'/crash-point.json',JSON.stringify({point:'after-claim-at-gateway-request'}));
    await new Promise(()=>setInterval(()=>{},1000));
  }
  return Response.json({requirements:[{department:'Lighting',category:'POWER_CAPACITY',requirement_text:'Lighting requires 400 amps of power.',source_excerpt:'Lighting requires 400 amps of power.',source_page:1,confidence:0.95}]});
};
const request=job=>new Request('http://synthetic.test/worker',{method:'POST',body:JSON.stringify(job)});
if(command==='init'){
  const state=createWorkspace('SYNTHETIC Process Recovery','PM');const production=activeProduction(state);
  const documentId='doc_syntheticrecovery';const text='Lighting requires 400 amps of power.';
  const raw=new TextEncoder().encode(text).buffer;
  const source=sourceProvenance({document_id:documentId,workspace_id:state.workspace.workspace_id,production_id:production.production.production_id},raw);
  const job={jobId:'a'.repeat(64)};
  production.documents.push({document_id:documentId,production_id:production.production.production_id,workspace_id:state.workspace.workspace_id,name:'synthetic.txt',doc_type:'UPLOADED',status:'PROCESSING',review_status:'PENDING',analysis_attempt_id:createHash('sha256').update(job.jobId).digest('hex'),processing_started_at:new Date(Date.now()-17*60000).toISOString(),source_provenance:source});
  await store.setJSON('workspace/'+state.tester.tester_id,state);
  await store.set('upload/'+state.workspace.workspace_id+'/'+production.production.production_id+'/'+documentId,raw);
  await store.setJSON('document-job/'+job.jobId,{testerId:state.tester.tester_id,productionId:production.production.production_id,documentId});
  await store.setJSON('session/'+createHash('sha256').update('synthetic-session').digest('hex'),{testerId:state.tester.tester_id,expiresAt:'2099-01-01'});
  fs.writeFileSync(root+'/fixture.json',JSON.stringify({testerId:state.tester.tester_id,workspaceId:state.workspace.workspace_id,productionId:production.production.production_id,documentId,job,sha256:source.sha256}));
  console.log(JSON.stringify({initialized:true,fixture:'synthetic direct-storage setup; no user intake or real model'}));
}else{
  const fixture=JSON.parse(fs.readFileSync(root+'/fixture.json','utf8'));
  if(command==='run')await processUpload(request(fixture.job),context);
  else if(command==='resume'){
    await processUpload(request(fixture.job),context);
    const state=await store.get('workspace/'+fixture.testerId,{type:'json'});const production=activeProduction(state);
    assert.equal(JSON.parse(fs.readFileSync(root+'/gateway-count.json')),1);
    assert.equal(production.documents[0].status,'PROCESSING');assert.equal(production.requirements.length,0);
    assert.notEqual(readiness(production).status,'SHOW_READY');
    assert(await store.get('document-execution/'+createHash('sha256').update(fixture.job.jobId).digest('hex'),{type:'json'}));
    const trace=await getStore('rigor-integration').get('attempt/document_analysis/'+createHash('sha256').update(fixture.job.jobId).digest('hex'),{type:'json'});
    assert.equal(trace.analysis_context.source_provenance.document_id,fixture.documentId);
    assert.equal(trace.analysis_context.source_provenance.sha256,fixture.sha256);
    assert(['RUNNING','VERIFIED'].includes(trace.status));
    assert.equal(production.documents[0].source_provenance.sha256,fixture.sha256);
    console.log(JSON.stringify({resumed_without_gateway_replay:true,document:'PROCESSING',readiness:'BLOCKED',source_binding_preserved:true,claim_preserved:true,correlated_receipt_preserved:true,receipt_status:trace.status}));
  }else if(command==='concurrent-change'){
    const response=await api(new Request('http://synthetic.test/api/productions',{method:'POST',headers:{cookie:'rigor_beta_session=synthetic-session','Content-Type':'application/json'},body:JSON.stringify({show_name:'SYNTHETIC Concurrent Edit',artist:'Synthetic Artist',venue:'Synthetic Venue',city:'Synthetic City',show_date:'2026-12-01'})}),context);
    assert.equal(response.status,201);
    console.log(JSON.stringify({concurrent_production_saved:true}));
  }else if(command==='check-conflict'){
    const state=await store.get('workspace/'+fixture.testerId,{type:'json'});
    const production=state.productions.find(p=>p.production.production_id===fixture.productionId);
    assert.equal(state.productions.length,2);assert.notEqual(state.workspace.active_production_id,fixture.productionId);
    assert.equal(production.documents[0].status,'FAILED');assert.equal(production.requirements.length,0);
    assert(production.events.some(event=>event.type==='DOCUMENT_PROCESSING_FAILED'&&event.payload.error_code==='WORKSPACE_CONFLICT'));
    assert.equal(JSON.parse(fs.readFileSync(root+'/gateway-count.json')),1);
    console.log(JSON.stringify({concurrent_edit_preserved:true,active_selection_preserved:true,stale_worker_failed_closed:true,failure_audit_preserved:true}));
  }else if(command==='retry'){
    const before=await store.get('workspace/'+fixture.testerId,{type:'json'});
    if(before.workspace.active_production_id!==fixture.productionId){
      const selected=await api(new Request('http://synthetic.test/api/productions/'+fixture.productionId+'/select',{method:'POST',headers:{cookie:'rigor_beta_session=synthetic-session'}}),context);
      assert.equal(selected.status,200);
    }
    const response=await api(new Request('http://synthetic.test/api/documents/'+fixture.documentId+'/retry',{method:'POST',headers:{cookie:'rigor_beta_session=synthetic-session','Content-Type':'application/json'},body:'{}'}),context);
    assert.equal(response.status,202);await Promise.all(waits);
    const job=JSON.parse(fs.readFileSync(root+'/retry-job.json','utf8'));await processUpload(request(job),context);await processUpload(request(job),context);
    const state=await store.get('workspace/'+fixture.testerId,{type:'json'});const production=activeProduction(state);
    assert.equal(production.documents[0].status,'PROCESSED');assert.equal(production.requirements.length,1);
    assert.equal(production.events.filter(event=>event.type==='DOCUMENT_PROCESSED').length,1);
    assert.equal(JSON.parse(fs.readFileSync(root+'/gateway-count.json')),2);
    assert.notEqual(readiness(production).status,'SHOW_READY');
    console.log(JSON.stringify({explicit_retry_completed:true,one_requirement:true,one_completion_event:true,total_gateway_calls:2,duplicate_effect:false,readiness_still_requires_human_review:true}));
  }else throw new Error('Unknown recovery command');
}
