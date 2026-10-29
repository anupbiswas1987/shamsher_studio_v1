import test from 'node:test';
import assert from 'node:assert/strict';
import {motionAt,sequenceAt,generateSequence,MOVEMENTS} from '../src/motion.js';
import {TRADEMARK_SRC} from '../src/branding.js';
import {makeScene,normalizeScene,loadCharacters} from '../src/engine.js';
test('still and zero intensity preserve artwork geometry',()=>{
 assert.deepEqual(motionAt({motion:{preset:'none'}},3),{x:0,y:0,r:0,sx:1,sy:1});
 for(const m of MOVEMENTS){const p=motionAt({motion:{preset:m.id,amount:0}},1);assert.equal(Math.abs(p.x)+Math.abs(p.y)+Math.abs(p.r),0);assert.equal(p.sx,1);assert.equal(p.sy,1)}
});
test('motion is deterministic for seeking and export; speed changes phase',()=>{
 const scene={motion:{preset:'idle',speed:1,amount:1}};
 assert.deepEqual(motionAt(scene,2),motionAt(scene,2));
 assert.deepEqual(motionAt({...scene,motion:{...scene.motion,speed:2}},1),motionAt(scene,2));
 assert.notDeepEqual(motionAt(scene,1),motionAt(scene,2));
});
test('speaking emphasis respects dialogue timing, trim, and mute',()=>{
 const scene={motion:{preset:'talking'},audio:[{start:1,duration:3,trim:1}]};
 const speaking=motionAt(scene,1.5),muted=motionAt({...scene,audio:[{...scene.audio[0],muted:true}]},1.5);
 assert.ok(Math.abs(speaking.r)>Math.abs(muted.r));
 assert.deepEqual(motionAt(scene,3),motionAt({...scene,audio:[]},3));
});
test('pose cues sort by time, blend on transition, hold last pose, ignore outside-scene cues',()=>{
 const s={character:'explaining',duration:8,poseTransition:.2,poseSequence:[{t:4,character:'thinking'},{t:0,character:'teacher'},{t:9,character:'back'}]};
 assert.deepEqual(sequenceAt(s,0),{current:'teacher',previous:'explaining',blend:1});
 const middle=sequenceAt(s,4.1);assert.equal(middle.current,'thinking');assert.equal(middle.previous,'teacher');assert.ok(Math.abs(middle.blend-.5)<.0001);
 assert.equal(sequenceAt(s,8).current,'thinking');assert.equal(sequenceAt(s,8).blend,1);
 assert.equal(sequenceAt({...s,poseTransition:0},4).blend,1);
});
test('generated sequence uses scene duration; legacy motion remains still',()=>{
 const scene=makeScene();assert.equal(scene.motion.preset,'idle');
 assert.deepEqual(generateSequence({...scene,duration:8}).map(c=>c.t),[0,2,4,6]);
 assert.equal(normalizeScene({keys:{}}).motion.preset,'none');
});
test('export preloads every sequenced pose',async()=>{
 const loaded=[];globalThis.Image=class {decode(){loaded.push(this.src);return Promise.resolve()}};
 await loadCharacters([{character:'teacher',poseSequence:[{t:2,character:'thinking'},{t:4,character:'teacher'}]}]);
 assert.deepEqual(loaded.sort(),[TRADEMARK_SRC,'/character/shomshar/teacher.png','/character/shomshar/thinking.png'].sort());
 delete globalThis.Image;
});
