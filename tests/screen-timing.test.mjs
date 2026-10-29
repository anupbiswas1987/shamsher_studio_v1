import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resetScreenTiming} from '../src/screen-timing.js';
test('reset follows reordered screens and preserves artwork and animations',()=>{
 const screens=[{id:3,start:8,end:10,entry:'Fade',file:'image'},{id:1,start:0,end:2,exit:'Zoom'}];
 const result=resetScreenTiming(screens);
 assert.deepEqual(result,[{...screens[0],start:0,end:3},{...screens[1],start:3,end:6}]);
 assert.equal(screens[0].start,8);
});
test('three second slots respect the thirty second reel limit',()=>{
 assert.equal(resetScreenTiming(Array.from({length:10},(_,id)=>({id})))[9].end,30);
 assert.throws(()=>resetScreenTiming(Array.from({length:11},(_,id)=>({id}))),/30-second/);
});
