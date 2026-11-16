import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildFreteBaratoCheckoutPackage as build} from '../src/lib/fretebarato-checkout.ts';
test('one T001 and multiple orders preserve value and sum unit weights in one package',()=>{
 const settings={default_weight_kg:'0.01',default_width_cm:13,default_height_cm:6,default_length_cm:16};
 assert.deepEqual(build([{qty:1,unit_price:1}],settings),[{id:'consolidated',quantity:1,width:13,height:6,length:16,weight:0.01,insurance_value:1}]);
 const p=build([{qty:2,unit_price:12.5},{qty:1,unit_price:3}],settings)[0];
 assert.equal(p.quantity,1);assert.equal(p.weight,0.03);assert.equal(p.insurance_value,28);
});
test('zero price is preserved; invalid quantities and prices do not create a misleading quote',()=>{
 assert.equal(build([{qty:1,unit_price:0}],null)[0].insurance_value,0);
 for(const items of [[],[{qty:0,unit_price:1}],[{qty:1,unit_price:-1}],[{qty:1.5,unit_price:1}]])assert.throws(()=>build(items,null));
});
