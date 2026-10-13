import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {Context} from '@netlify/functions';
const mocks=vi.hoisted(()=>{
 const records=new Map<string,any>(); let revision=0;
 const store={
  get:vi.fn(async(key:string)=>structuredClone(records.get(key)??null)),
  getWithMetadata:vi.fn(async(key:string)=>records.has(key)?{data:structuredClone(records.get(key)),etag:String(revision)}:null),
  setJSON:vi.fn(async(key:string,value:any,options?:{onlyIfNew?:boolean;onlyIfMatch?:string})=>{
   if(options?.onlyIfNew&&records.has(key))return {modified:false};
   if(options?.onlyIfMatch!==undefined&&options.onlyIfMatch!==String(revision))return {modified:false};
   records.set(key,structuredClone(value));revision++;return {modified:true};
  }),
 };
 return {records,store,execute:vi.fn()};
});
vi.mock('./company-store.js',()=>({companyStore:async()=>mocks.store}));
vi.mock('./deerflow.js',()=>({companyActionContext:()=> '{}',deerFlowRequest:mocks.execute}));
import runner from '../rigor-company-action-runner-background.mjs';
const context={deploy:{context:'production'}} as Context;
const request=()=>new Request('https://example.test/worker',{method:'POST',headers:{'X-RIGOR-Automation-Token':'test-token'}});
const action=(key='internal-test')=>({action_key:key,action_type:'INTERNAL_TEST',scope:'OBSERVE',title:'Review saved evidence',owner_agent:'rigor-qa-security',approval_required:false,status:'APPROVED',payload:{objective:'Read evidence'}});
beforeEach(()=>{
 vi.clearAllMocks();mocks.records.clear();
 vi.stubGlobal('Netlify',{env:{get:(key:string)=>key==='RIGOR_DEERFLOW_TOKEN'?'test-token':'https://backend.test'}});
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:202})));
 mocks.execute.mockImplementation(async()=>Response.json({status:'COMPLETE',result_summary:'Reviewed',execution_receipts:[{task_id:'actual-qa-call',agent:'rigor-qa-security',status:'COMPLETE'}]}));
});
describe('automatic company action authority and concurrency',()=>{
 it('executes a queued internal action once under overlapping worker invocations',async()=>{
  mocks.records.set('actions/queue',[action()]);
  await Promise.all([runner(request(),context),runner(request(),context)]);
  expect(mocks.execute).toHaveBeenCalledTimes(1);
 });
 it.each(['EMAIL_SEND','CREDENTIAL_CHANGE','PRODUCTION_PROMOTE','INTERNAL_CODE_CHANGE'])('rejects forged automatic flags for %s',async(action_type)=>{
  mocks.records.set('actions/queue',[{...action(),action_type}]);
  await runner(request(),context);
  expect(mocks.execute).not.toHaveBeenCalled();
 });
 it('rejects Founder-reserved scope even when queue flags claim approval',async()=>{
  mocks.records.set('actions/queue',[{...action(),scope:'FOUNDER_RESERVED'}]);
  await runner(request(),context);expect(mocks.execute).not.toHaveBeenCalled();
 });
 it('never re-executes a completed action resurrected by a stale queue snapshot',async()=>{
  mocks.records.set('actions/queue',[action()]);await runner(request(),context);
  mocks.records.set('actions/queue',[action()]);await runner(request(),context);
  expect(mocks.execute).toHaveBeenCalledTimes(1);
 });
 it('preserves unrelated queue updates made while an action is executing',async()=>{
  mocks.records.set('actions/queue',[action(),{...action('other'),status:'NEEDS_APPROVAL',approval_required:true}]);
  mocks.execute.mockImplementationOnce(async()=>{
   const queue=mocks.records.get('actions/queue');queue[1].summary='new Founder context';queue[1].status='REJECTED';
   return Response.json({status:'COMPLETE',execution_receipts:[{task_id:'qa-call',agent:'rigor-qa-security',status:'COMPLETE'}]});
  });
  await runner(request(),context);
  expect(mocks.records.get('actions/queue')[1]).toMatchObject({summary:'new Founder context',status:'REJECTED'});
 });
 it('retains a reservation after uncertain failure instead of automatically retrying',async()=>{
  mocks.records.set('actions/queue',[action()]);mocks.execute.mockRejectedValueOnce(new Error('private upstream details'));
  await runner(request(),context);mocks.records.set('actions/queue',[action()]);await runner(request(),context);
  expect(mocks.execute).toHaveBeenCalledTimes(1);
  const claims=[...mocks.records.entries()].filter(([key])=>key.startsWith('actions/execution-claims/'));
  expect(claims[0][1]).toMatchObject({status:'FAILED',failure_code:'ACTION_EXECUTION_FAILED'});
  expect(JSON.stringify(claims)).not.toContain('private upstream details');
 });
 it('skips legacy completed actions without starving another eligible job',async()=>{
  mocks.records.set('actions/queue',[action('old'),action('new')]);
  mocks.records.set('actions/results/old.json',{result:{status:'COMPLETE'}});
  await runner(request(),context);
  expect(mocks.execute).toHaveBeenCalledTimes(1);
  expect(mocks.records.get('actions/results/new.json')).toBeTruthy();
 });

 it.each(['payload','approval_required'])('cancels dispatch when %s changes after the initial queue read',async(field)=>{
  mocks.records.set('actions/queue',[action()]);
  const original=mocks.store.getWithMetadata.getMockImplementation()!;
  mocks.store.getWithMetadata.mockImplementationOnce(async(key:string)=>{
   const current=mocks.records.get('actions/queue');
   if(field==='payload') current[0].payload={objective:'changed objective'};
   else current[0].approval_required=true;
   return original(key);
  });
  await runner(request(),context);
  expect(mocks.execute).not.toHaveBeenCalled();
  const claim=[...mocks.records.entries()].find(([key])=>key.startsWith('actions/execution-claims/'))![1];
  expect(claim).toMatchObject({status:'CANCELLED',failure_code:'PROPOSAL_CHANGED_BEFORE_EXECUTION'});
 });

});
