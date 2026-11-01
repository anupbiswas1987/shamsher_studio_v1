import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resetScreenTiming} from '../src/screen-timing.js';
test('reset follows reordered screens and preserves artwork and animations',()=>{
 const screens=[{id:3,start:8,end:10,entry:'Fade',file:'image'},{id:1,start:0,end:2,exit:'Zoom'}];
 const result=resetScreenTiming(screens);
 assert.deepEqual(result,[{...screens[0],start:0,end:3},{...screens[1],start:3,end:6}]);
 assert.equal(screens[0].start,8);
});
test('three second slots fit exactly within the default limit',()=>{
 assert.equal(resetScreenTiming(Array.from({length:10},(_,id)=>({id})))[9].end,30);
});
test('shortens slots to fit screens within a configured duration',()=>{
 const result=resetScreenTiming(Array.from({length:2},(_,id)=>({id})),5);
 assert.deepEqual(result.map(({start,end})=>({start,end})),[
  {start:0,end:2.5},
  {start:2.5,end:5},
 ]);
});
test('fits more than ten screens by sharing the configured duration',()=>{
 const result=resetScreenTiming(Array.from({length:11},(_,id)=>({id})));
 assert.equal(result.at(-1).end,30);
 assert.ok(result.every(({start,end})=>end>start&&end-start<=3));
});
test('rejects a duration too short to give every screen a usable slot',()=>{
 assert.throws(()=>resetScreenTiming(Array.from({length:2},(_,id)=>({id})),0.19),/at least 0.1 seconds/);
});
test('rejects non-positive or non-finite durations',()=>{
 assert.throws(()=>resetScreenTiming([{id:1}],0),/greater than zero/);
 assert.throws(()=>resetScreenTiming([{id:1}],Infinity),/greater than zero/);
});
