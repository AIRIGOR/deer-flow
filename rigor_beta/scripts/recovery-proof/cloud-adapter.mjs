// Real cloud Blob storage, restricted to newly generated synthetic store names.
// Existing CLI login is read through its normal helper; no credential is printed or saved.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const nativeFetch=globalThis.fetch;
const {getToken}=await import(process.env.PROOF_AUTH_HELPER);
const {getStore:realGetStore}=await import(process.env.PROOF_BLOBS_SDK);
const [token]=await getToken();
assert(token,'Existing authorized CLI login required');
const prefix=process.env.PROOF_STORE_PREFIX;
assert(/^rigorrec-[0-9a-f]{8}-(afterclaim|beforecommit|conflictbeforecommit)$/.test(prefix));
assert(process.env.PROOF_SITE_ID);
export function getStore(options){
  const name=typeof options==='string'?options:options.name;
  assert(['rigor-beta','rigor-integration'].includes(name),'Operational/unknown store access is forbidden in this proof');
  const actual=realGetStore({name:prefix+'-'+name,siteID:process.env.PROOF_SITE_ID,token,consistency:'strong',
    fetch:(input,init)=>nativeFetch(input,{...init,signal:AbortSignal.timeout(20000)})});
  return {
    get:(...args)=>actual.get(...args),getWithMetadata:(...args)=>actual.getWithMetadata(...args),
    set:(...args)=>actual.set(...args),delete:(...args)=>actual.delete(...args),
    async setJSON(key,value,options){
      if(['before-commit','conflict-before-commit'].includes(process.env.RECOVERY_MODE)&&key.startsWith('workspace/')&&value.productions?.some(p=>p.documents.some(d=>d.status==='PROCESSED'))){
        fs.writeFileSync(path.join(process.env.PROOF_STATE_DIR,'crash-point.json'),JSON.stringify({point:'after-receipt-before-workspace-commit'}));
        if(process.env.RECOVERY_MODE==='conflict-before-commit')while(!fs.existsSync(path.join(process.env.PROOF_STATE_DIR,'release-commit.json')))await new Promise(resolve=>setTimeout(resolve,50));
        else await new Promise(()=>setInterval(()=>{},1000));
      }
      return actual.setJSON(key,value,options);
    },
  };
}
export const getDeployStore=getStore;
