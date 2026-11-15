import {test} from 'node:test';
import assert from 'node:assert/strict';
import {olistRequest,getOlistAccessToken} from '../supabase/functions/_shared/olist.ts';
const rows=new Map([['store-A',{is_active:true,access_token:'token-A'}],['store-B',{is_active:true,access_token:'token-B'}]]);
function database(){return {from(table){assert.equal(table,'integration_olist');let tenant;const q={select(){return q;},eq(k,v){assert.equal(k,'tenant_id');tenant=v;return q;},async maybeSingle(){const r=rows.get(tenant);return {data:r?{...r,token_expires_at:new Date(Date.now()+3600000).toISOString()}:null,error:null};}};return q;}};}
test('Olist concurrent requests use the credentials of each store',async()=>{
 const previous=globalThis.fetch,calls=[];
 try{globalThis.fetch=async(url,init)=>{calls.push({url,token:init.headers.Authorization});return Response.json({ok:true});};
  const result=await Promise.all(['store-A','store-B'].map(id=>olistRequest(database(),id,'GET','/pedidos?limit=1')));
  assert.ok(result.every(r=>r.ok));assert.deepEqual(calls.map(c=>c.token).sort(),['Bearer token-A','Bearer token-B']);
 }finally{globalThis.fetch=previous;}
});
test('future Olist store uses its newly configured account without code changes',async()=>{
 rows.set('future-store',{is_active:true,access_token:'future-token'});
 assert.equal(await getOlistAccessToken(database(),'future-store'),'future-token');rows.delete('future-store');
});
test('unconnected or inactive store never inherits another Olist token',async()=>{
 assert.equal(await getOlistAccessToken(database(),'unconnected'),null);
 rows.set('disabled',{is_active:false,access_token:'disabled-token'});
 assert.equal(await getOlistAccessToken(database(),'disabled'),null);rows.delete('disabled');
});
