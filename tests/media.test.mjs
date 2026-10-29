import test from 'node:test';
import assert from 'node:assert/strict';
import {clipWindow,supportedFormats,mixProject} from '../src/media.js';
test('audio trims, seeks and stops at scene boundaries',()=>{
 const clip={start:2,trim:3,duration:12};
 assert.deepEqual(clipWindow(clip,8),{when:2,offset:3,duration:6});
 assert.deepEqual(clipWindow(clip,8,5),{when:0,offset:6,duration:3});
 assert.equal(clipWindow(clip,8,9).duration,0);
 assert.equal(clipWindow({start:10,duration:4},8).duration,0);
});
test('format detection handles unavailable recorder and supported formats',()=>{
 assert.deepEqual(supportedFormats(),[]);
 globalThis.MediaRecorder={isTypeSupported:m=>m==='video/webm'};
 assert.deepEqual(supportedFormats(),['video/webm']);
 delete globalThis.MediaRecorder;
});
test('project audio mix applies gain, mute, trim and sequential scene placement',async()=>{
 const starts=[],gains=[];
 globalThis.OfflineAudioContext=class {
  constructor(channels,frames,rate){assert.equal(channels,2);assert.equal(frames,12*48000);this.destination={};}
  createBufferSource(){return {connect(){},start(...args){starts.push(args)}}}
  createGain(){const gain={value:1};gains.push(gain);return {gain,connect(){}}}
  startRendering(){return 'mixed-buffer'}
 };
 const ctx={decodeAudioData:async()=>({})},data='data:audio/wav;base64,AA==';
 const scenes=[{duration:8,sfx:[],audio:[{data,name:'A',start:2,duration:12,trim:3,volume:.5},{data,start:0,duration:3,muted:true}]},{duration:4,sfx:[],audio:[{data,name:'B',start:1,duration:6}]}];
 assert.equal(await mixProject(scenes,ctx),'mixed-buffer');
 assert.deepEqual(starts,[[2,3,6],[9,0,3]]);
 assert.deepEqual(gains.map(g=>g.value),[.5,1]);
 delete globalThis.OfflineAudioContext;
});
