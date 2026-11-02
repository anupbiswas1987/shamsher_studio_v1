import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_MOTION_DURATION,DEFAULT_OVERLAY_DURATION,defaultScreenDuration,maxScreenMotionDuration,resetScreenTiming,screenMotionDuration} from '../src/screen-timing.js';
test('default Motion timing is half a second',()=>{
 assert.equal(DEFAULT_MOTION_DURATION,.5);
 assert.equal(DEFAULT_OVERLAY_DURATION,.3);
 assert.equal(maxScreenMotionDuration(0,4),.5);
 assert.equal(screenMotionDuration({start:0,end:4,transition:1.2}),.5);
});
test('default screen duration follows reel duration divided by screen limit',()=>{
 assert.equal(defaultScreenDuration(30,30),1);
 assert.equal(defaultScreenDuration(30,15),2);
 assert.equal(defaultScreenDuration(24,15),1.6);
 assert.equal(defaultScreenDuration(1,30),.1);
});
test('reset follows reordered screens and preserves artwork and animations',()=>{
 const screens=[{id:3,start:8,end:10,entry:'Fade',file:'image'},{id:1,start:0,end:2,exit:'Zoom'}];
 const result=resetScreenTiming(screens);
 assert.deepEqual(result,[{...screens[0],start:0,end:1},{...screens[1],start:1,end:2}]);
 assert.equal(screens[0].start,8);
});
test('one second default slots fit all default screen slots exactly',()=>{
 assert.equal(resetScreenTiming(Array.from({length:30},(_,id)=>({id}))).at(-1).end,30);
});
test('reset applies configured Entry and Exit animation defaults to every screen',()=>{
 const screens=[
  {id:1,start:8,end:10,entry:'Zoom',exit:'Slide left',transition:.6},
  {id:2,start:10,end:12,entry:'Fade',exit:'Zoom',transition:.8},
 ];
 const result=resetScreenTiming(screens,5,true,{
  maxScreenDuration:3,
  maxMotionDuration:5,
  maxOverlayDuration:5,
  defaultEntry:'Slide right',
  defaultExit:'Fade',
 });
 assert.deepEqual(result.map(({entry,exit})=>({entry,exit})),[
  {entry:'Slide right',exit:'Fade'},
  {entry:'Slide right',exit:'Fade'},
 ]);
 assert.equal(result[0].transition,.6);
 assert.equal(result[1].transition,.8);
});
test('shortens slots to fit screens within a configured duration',()=>{
 const result=resetScreenTiming(Array.from({length:2},(_,id)=>({id})),5,true,{maxScreenDuration:3});
 assert.deepEqual(result.map(({start,end})=>({start,end})),[
  {start:0,end:2.5},
  {start:2.5,end:5},
 ]);
});
test('overlaps adjacent screens only when both sides have animations',()=>{
 const screens=[
  {id:1,exit:'Fade',transition:.6},
  {id:2,entry:'Slide left',transition:.8},
 ];
 const result=resetScreenTiming(screens,5,true,{maxScreenDuration:3,maxMotionDuration:5,maxOverlayDuration:5});
 assert.deepEqual(result.map(({start,end})=>({start,end})),[
  {start:0,end:2.8},
  {start:2.2,end:5},
 ]);
 const withoutEntry=resetScreenTiming([
  screens[0],
  {...screens[1],entry:'None'},
 ],5,true,{maxScreenDuration:3,maxMotionDuration:5,maxOverlayDuration:5});
 assert.deepEqual(withoutEntry.map(({start,end})=>({start,end})),[
  {start:0,end:2.5},
  {start:2.5,end:5},
 ]);
});
test('disables animation overlap when reset overlap is turned off',()=>{
 const result=resetScreenTiming([
  {id:1,exit:'Fade',transition:.6},
  {id:2,entry:'Slide left',transition:.8},
 ],30,false,{maxScreenDuration:3,maxMotionDuration:5});
 assert.deepEqual(result.map(({start,end})=>({start,end})),[
  {start:0,end:3},
  {start:3,end:6},
 ]);
});
test('caps overlap to each screen’s available motion duration',()=>{
 const result=resetScreenTiming([
  {id:1,exit:'Fade',transition:5},
  {id:2,entry:'Fade',transition:5},
 ],.3);
 assert.deepEqual(result.map(({start,end})=>({start,end})),[
  {start:0,end:.2},
  {start:.1,end:.3},
 ]);
});
test('limits each reset screen to the configured duration',()=>{
 assert.equal(resetScreenTiming([{id:1}])[0].end,1);
 const result=resetScreenTiming([{id:1},{id:2}],30,true,{maxScreenDuration:1.5});
 assert.deepEqual(result.map(({start,end})=>({start,end})),[
  {start:0,end:1.5},
  {start:1.5,end:3},
 ]);
});
test('caps motion and adjacent overlay with the configured settings',()=>{
 const screens=[
  {id:1,exit:'Fade',transition:.8},
  {id:2,entry:'Fade',transition:.7},
 ];
 const motionLimited=resetScreenTiming(screens,30,true,{maxScreenDuration:3,maxMotionDuration:.5,maxOverlayDuration:.5});
 assert.equal(motionLimited[1].start,2.5);
 const overlayLimited=resetScreenTiming(screens,30,true,{maxScreenDuration:3,maxOverlayDuration:.2});
 assert.equal(overlayLimited[1].start,2.8);
});
test('dynamically caps motion duration at half the screen duration',()=>{
 assert.equal(maxScreenMotionDuration(0,4,5),2);
 assert.equal(maxScreenMotionDuration(1,1.4),.2);
 assert.equal(maxScreenMotionDuration(1,1.1),0);
 const screen={start:0,end:.4,transition:1.2};
 assert.equal(screenMotionDuration(screen),.2);
 assert.equal(screenMotionDuration({...screen,end:4},5),1.2);
 assert.equal(maxScreenMotionDuration(0,4,.5),.5);
 assert.equal(screenMotionDuration({...screen,end:4},.5),.5);
});
test('fits more than ten screens by sharing the configured duration',()=>{
 const result=resetScreenTiming(Array.from({length:11},(_,id)=>({id})),30,true,{maxScreenDuration:3});
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
