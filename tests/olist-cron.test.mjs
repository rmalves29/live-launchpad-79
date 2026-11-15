import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ts=require(process.env.TYPESCRIPT_PATH || 'typescript');
const source=fs.readFileSync(new URL('../supabase/functions/olist-orders/index.ts',import.meta.url),'utf8');
function harness({rpcData=false,rpcError=null,throws=false,stores=[],settings={}}={}){
 const calls={rpc:[],reads:[],writes:[],guard:0};let handler;
 const db={rpc:async(name,args)=>{calls.rpc.push({name,args});if(throws)throw Error('db unavailable');return {data:rpcData,error:rpcError};},from(table){
  const filters=[];let updateValues,max=Infinity;const ordering=[];
  const run=()=>{
   if(updateValues){calls.writes.push({table,filters,values:updateValues});Object.assign(settings[filters.find(([k])=>k==='tenant_id')?.[1]]??{},updateValues);return {data:null,error:null};}
   calls.reads.push({table,filters,ordering});
   const selected=[...stores].sort((a,b)=>(settings[a.tenant_id]?.orders_last_sweep_at??'').localeCompare(settings[b.tenant_id]?.orders_last_sweep_at??'')||a.tenant_id.localeCompare(b.tenant_id));
   return {data:table==='integration_olist'?selected.slice(0,max):[],error:null};
  };
  const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},or(v){filters.push(['or',v]);return q;},limit(n){max=n;return q;},order(k,v){ordering.push([k,v]);return q;},update(v){updateValues=v;return q;},
   async maybeSingle(){calls.reads.push({table,filters});return {data:settings[filters.find(([k])=>k==='tenant_id')?.[1]]??null,error:null};},then(resolve,reject){return Promise.resolve(run()).then(resolve,reject);}};return q;
 }};
 const ctx=vm.createContext({console:{log(){},error(){},warn(){}},Response,Request,Headers,Date,JSON,Number,String,Boolean,Promise,Set,Map,setTimeout,clearTimeout,
  Deno:{env:{get:k=>({SUPABASE_URL:'https://isolated.invalid',SUPABASE_SERVICE_ROLE_KEY:'test-service'})[k]},serve:fn=>{handler=fn;}}});
 const fakeRequire=spec=>{
  if(spec.includes('supabase-js'))return {createClient:()=>db};
  if(spec.includes('auth-guard'))return {authorizeTenantCaller:async()=>{calls.guard++;return {ok:false,status:403,error:'denied'};},guardResponse:()=>Response.json({error:'denied'},{status:403})};
  if(spec.includes('postage-confirmation'))return {};
  if(spec.includes('olist.ts'))return {olistRequest:()=>{calls.writes.push('provider');throw Error('Unexpected provider call');},olistErrorMessage:()=>''};
  throw Error('Unexpected import');
 };
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInContext(`(function(require,exports){${js}\n})`,ctx)(fakeRequire,{});
 return {calls,async request({token,secret,body={action:'auto_sweep',dry_run:true},method='POST'}={}){
  return handler(new Request('https://isolated.invalid',{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(secret?{'x-olist-cron-secret':secret}:{})},...(method==='POST'?{body:JSON.stringify(body)}:{})}));
 }};
}
for(const [name,input] of [['missing',{}],['public key',{token:'anon'}],['user session',{token:'user-jwt'}],['malformed secret',{secret:'short'}]]){
 test(name+' cannot run global maintenance',async()=>{const h=harness();const r=await h.request(input);assert.equal(r.status,403);assert.equal(h.calls.reads.length,0);assert.equal(h.calls.writes.length,0);assert.equal(h.calls.rpc.length,0);});
}
for(const [name,options] of [['wrong secret',{}],['database error',{rpcData:true,rpcError:{message:'unavailable'}}],['non-boolean approval',{rpcData:'true'}],['database exception',{throws:true}]]){
 test(name+' fails closed',async()=>{const h=harness(options);const r=await h.request({secret:'a'.repeat(64)});assert.ok([403,500].includes(r.status));assert.equal(h.calls.reads.length,0);assert.equal(h.calls.writes.length,0);});
}
test('scoped secret authorizes a dry run without business reads or writes',async()=>{const h=harness({rpcData:true});const r=await h.request({secret:'a'.repeat(64)});assert.deepEqual(await r.json(),{success:true,dry_run:true,authorized:true});assert.equal(h.calls.rpc[0].name,'olist_cron_authorized');assert.equal(h.calls.reads.length,0);assert.equal(h.calls.writes.length,0);});
test('existing internal service credentials stay compatible',async()=>{const h=harness();const r=await h.request({token:'test-service'});assert.equal(r.status,200);assert.equal(h.calls.rpc.length,0);});
test('new stores join the generic sweep without a tenant allowlist',async()=>{const h=harness({rpcData:true,stores:[{tenant_id:'store-A'},{tenant_id:'future-store-B'}],settings:{'store-A':{is_active:true,send_orders:true},'future-store-B':{is_active:true,send_orders:true}}});const r=await h.request({secret:'a'.repeat(64),body:{action:'auto_sweep'}});const b=await r.json();assert.deepEqual(b.tenants.map(t=>t.tenant_id).sort(),['future-store-B','store-A']);assert.equal(h.calls.reads.filter(x=>x.table==='integration_olist').length,3);assert.equal(h.calls.writes.length,2);assert.deepEqual(h.calls.writes.map(w=>w.filters.find(([k])=>k==='tenant_id')[1]).sort(),['future-store-B','store-A']);});
test('disabled stores remain excluded even after enumeration',async()=>{const h=harness({rpcData:true,stores:[{tenant_id:'off'}],settings:{off:{is_active:false,send_orders:true}}});const r=await h.request({secret:'a'.repeat(64),body:{action:'auto_sweep'}});assert.deepEqual((await r.json()).tenants,[]);});
test('cron secret does not authorize tenant settings',async()=>{const h=harness({rpcData:true});const r=await h.request({secret:'a'.repeat(64),body:{action:'settings',tenant_id:'other-store'}});assert.equal(r.status,403);assert.equal(h.calls.guard,1);assert.equal(h.calls.rpc.length,0);assert.equal(h.calls.reads.length,0);});
test('OPTIONS stays available without reading credentials or data',async()=>{const h=harness();assert.equal((await h.request({method:'OPTIONS'})).status,200);assert.equal(h.calls.reads.length,0);assert.equal(h.calls.rpc.length,0);});
test('more than 50 stores rotate across sweeps and a newly configured store gets priority',async()=>{
 const stores=Array.from({length:51},(_,i)=>({tenant_id:'store-'+String(i).padStart(2,'0')}));const settings=Object.fromEntries(stores.map(s=>[s.tenant_id,{is_active:true,send_orders:true}]));
 const h=harness({rpcData:true,stores,settings});const input={secret:'a'.repeat(64),body:{action:'auto_sweep'}};
 const first=await (await h.request(input)).json();assert.equal(first.tenants.length,50);assert.ok(!first.tenants.some(t=>t.tenant_id==='store-50'));
 const second=await (await h.request(input)).json();assert.equal(second.tenants[0].tenant_id,'store-50');
 stores.push({tenant_id:'future-store'});settings['future-store']={is_active:true,send_orders:true};
 const third=await (await h.request(input)).json();assert.equal(third.tenants[0].tenant_id,'future-store');
 const order=h.calls.reads.find(r=>r.ordering?.length)?.ordering;assert.equal(order[0][0],'orders_last_sweep_at');assert.equal(order[0][1].nullsFirst,true);
 assert.ok(h.calls.writes.every(w=>w.table==='integration_olist'&&Object.keys(w.values).length===1));
});
