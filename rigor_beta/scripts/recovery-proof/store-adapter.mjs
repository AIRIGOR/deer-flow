// Durable local test adapter. It emulates Blob API semantics; it is not Netlify storage.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root='/state';
const hash=value=>createHash('sha256').update(value).digest('hex');
function file(name,key){return path.join(root,hash(name+'\n'+key)+'.json');}
function read(name,key){const p=file(name,key);return fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):null;}
function write(name,key,record){const target=file(name,key);const temp=target+'.tmp';fs.writeFileSync(temp,JSON.stringify(record));fs.renameSync(temp,target);}
export function getStore(options){
  const name=typeof options==='string'?options:options.name;
  return {
    async get(key,options={}){const row=read(name,key);if(!row)return null;if(row.kind==='raw'){const bytes=Buffer.from(row.data,'base64');return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);}return row.data;},
    async getWithMetadata(key){const row=read(name,key);return row?{data:row.data,metadata:{},etag:hash(JSON.stringify(row.data))}:null;},
    async set(key,value){write(name,key,{kind:'raw',data:Buffer.from(value).toString('base64')});return {modified:true};},
    async setJSON(key,value,options={}){
      fs.appendFileSync(path.join(root,'writes.ndjson'),JSON.stringify({mode:process.env.RECOVERY_MODE||null,key,states:value.productions?.flatMap(p=>p.documents.map(d=>d.status))||null})+'\n');
      const old=read(name,key);
      if(options.onlyIfNew&&old)return {modified:false};
      if(options.onlyIfMatch&&(!old||hash(JSON.stringify(old.data))!==options.onlyIfMatch))return {modified:false};
      if(process.env.RECOVERY_MODE==='before-commit'&&key.startsWith('workspace/')&&value.productions?.some(p=>p.documents.some(d=>d.status==='PROCESSED'))){
        fs.writeFileSync(path.join(root,'crash-point.json'),JSON.stringify({point:'after-receipt-before-workspace-commit'}));
        await new Promise(()=>setInterval(()=>{},1000)); // The host kills this labeled container after observing the durable marker.
      }
      write(name,key,{kind:'json',data:value});return {modified:true,etag:hash(JSON.stringify(value))};
    },
    async delete(key){const p=file(name,key);if(fs.existsSync(p))fs.unlinkSync(p);},
  };
}
export const getDeployStore=getStore;
