import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleFreteBaratoQuote} from '../supabase/functions/_shared/fretebarato-quote-handler.ts';
const a='11111111-1111-1111-1111-111111111111',b='22222222-2222-2222-2222-222222222222',future='33333333-3333-3333-3333-333333333333';
const tenants=new Map([[a,{active:true,id:'account-A',token:'token-A',platform:'cartzy',origin:'01310100'}],[b,{active:true,id:'account-B',token:'token-B',platform:'nuvemshop',origin:'29102165'}]]);
function database(){return {rpc:async()=>({data:true,error:null}),from(table){const filters={};const q={select(){return q;},eq(k,v){filters[k]=v;return q;},async maybeSingle(){const row=tenants.get(filters.tenant_id??filters.id);if(table==='tenants')return {data:row?{is_active:row.active}:null,error:null};assert.equal(filters.provider,'fretebarato');assert.equal(filters.is_active,true);return {data:row?.active?{access_token:row.token,client_id:row.id,scope:row.platform,from_cep:row.origin}:null,error:null};}};return q;}};}
const req=id=>new Request('https://isolated.invalid',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tenant_id:id,to_postal_code:'01310100',products:[{id:'sku',quantity:1,weight:0.3,length:20,width:16,height:2,insurance_value:50}]})});
test('concurrent stores use distinct credentials, account paths and contracts',async()=>{
 const calls=[];
 const run=id=>handleFreteBaratoQuote(req(id),database(),async(url,init)=>{calls.push({url,token:init.headers.Authorization,body:JSON.parse(init.body)});return Response.json(url.includes('/nuvemshop/')?{rates:[{name:'Carrier B',code:'service-B',price:20,currency:'BRL',type:'ship',max_delivery_date:'2026-12-02T00:00:00-03:00'}]}:{quotes:[{id:1,name:'Carrier A',price:10,deadline:4}]});});
 const results=await Promise.all([run(a),run(b)]);const bodies=await Promise.all(results.map(r=>r.json()));
 assert.equal(bodies[0].success,true);assert.equal(bodies[1].success,true);
 assert.equal(calls.find(c=>c.url.endsWith('/account-A')).token,'Bearer token-A');
 assert.ok(calls.find(c=>c.url.endsWith('/account-A')).body.skus);
 assert.equal(calls.find(c=>c.url.endsWith('/account-B')).token,'Bearer token-B');
 assert.ok(calls.find(c=>c.url.endsWith('/account-B')).body.items);
 assert.equal(calls.find(c=>c.url.endsWith('/account-B')).body.origin.postal_code,'29102165');
 assert.ok(!JSON.stringify(bodies).includes('token-'));
});
test('future store works after registering its own integration without changing code',async()=>{
 tenants.set(future,{active:true,id:'future-account',token:'future-token',platform:'nuvemshop',origin:'70040900'});
 const response=await handleFreteBaratoQuote(req(future),database(),async(url,init)=>{assert.ok(url.endsWith('/future-account'));assert.equal(init.headers.Authorization,'Bearer future-token');return Response.json({rates:[]});});
 assert.equal((await response.json()).success,true);tenants.delete(future);
});
test('unconfigured new store never falls back to another store credentials',async()=>{
 let calls=0;const response=await handleFreteBaratoQuote(req(future),database(),async()=>{calls++;throw Error('must not call');});assert.equal((await response.json()).success,false);assert.equal(calls,0);
});
