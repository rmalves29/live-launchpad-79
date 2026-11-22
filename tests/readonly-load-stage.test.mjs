import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runReadonlyStage} from '../supabase/functions/_shared/readonly-load-stage.ts';

test('bounded runner reports metrics and never exceeds the requested operation cap',async()=>{
 let calls=0;
 const result=await runReadonlyStage({concurrency:4,seconds:1,maxRequests:12},async()=>{calls++;return {ok:true,status:200,bytes:100};});
 assert.equal(calls,12);assert.equal(result.requests,12);assert.equal(result.errorRate,0);assert.equal(result.requestCapReached,true);assert.equal(result.bytes,1200);
});
test('business failures even with HTTP 200 trip the circuit breaker',async()=>{
 const result=await runReadonlyStage({concurrency:10,seconds:12,maxRequests:600},async()=>({ok:false,status:200,bytes:0}));
 assert.equal(result.stopReason,'error_rate_above_2_percent');assert.ok(result.requests<40);assert.equal(result.errorRate,1);
});
