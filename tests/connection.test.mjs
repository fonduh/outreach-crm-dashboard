import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const script=fs.readFileSync(new URL('../site/connection.js',import.meta.url),'utf8');
const payload={ok:true,read_at:'2026-10-08T15:00:00Z',jobs:[{id:'J1',company_id:'C1',status:'applied'}],companies:[{id:'C1',name:'Example'}],contacts:[],job_activity:[],job_contacts:[]};
function setup({session=null,shared=payload,rpcError=null,snapshot=null,privatePayload=payload}={}){
 const elements=new Map(),calls=[];
 const storage=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}};
 const sessionStorage=storage();
 if(snapshot)sessionStorage.setItem('private-crm-pages:/snapshot',JSON.stringify(snapshot));
 const client={auth:{onAuthStateChange(){},getSession:async()=>({data:{session},error:null})},rpc:async(name,args)=>{calls.push({name,args});return {data:shared,error:rpcError}},from:table=>{
  calls.push({table});const chain={select(){return chain},eq(){return chain},maybeSingle:async()=>({data:{payload:privatePayload,updated_at:payload.read_at},error:null}),in:async()=>({data:[],error:null})};return chain;
 }};
 const window={CRM_PUBLIC_CONFIG:{url:'https://example.supabase.co',key:'sb_publishable_test'},supabase:{createClient:()=>client},dispatchEvent(){}};
 const document={querySelector:s=>{if(!elements.has(s))elements.set(s,{});return elements.get(s)}};
 vm.runInNewContext(script,{window,document,location:{pathname:'/'},localStorage:storage(),sessionStorage,URL,Response,structuredClone,setTimeout,Event});
 return {api:window.CRMData,calls,elements};
}
test('signed-out page loads shared records without querying private tables',async()=>{
 const {api,calls}=setup();const response=await api.load();const data=await response.json();
 assert.equal(response.status,200);assert.equal(data.jobs.length,1);assert.equal(data.storage,'shared');assert.equal(data.read_only,true);
 assert.deepEqual(calls.map(c=>c.name),['get_shared_crm']);
 const write=await api.saveTags('C1',['champion'],[]);assert.equal(write.status,400);assert.equal(calls.length,1);
});
test('authenticated page retains private data and skips public fallback',async()=>{
 const {api,calls}=setup({session:{user:{id:'owner'}},privatePayload:{...payload,contacts:[{id:'private-contact'}]}});
 const data=await(await api.load()).json();assert.equal(data.storage,'private');assert.equal(data.contacts.length,1);
 assert.deepEqual(calls.map(c=>c.table),['crm_snapshots','crm_tag_requests']);
});
test('chosen local snapshot takes precedence over public fallback',async()=>{
 const {api,calls}=setup({snapshot:payload});const data=await(await api.load()).json();
 assert.equal(data.storage,'browser');assert.equal(calls.length,0);
});
test('unavailable sharing reports a load error instead of zero applications',async()=>{
 for(const options of [{shared:null},{rpcError:{message:'unavailable'}}]){
  const {api}=setup(options);const response=await api.load();const data=await response.json();
  assert.equal(response.status,400);assert.equal(data.ok,false);assert.match(data.error,/shared CRM could not load/);
 }
});
