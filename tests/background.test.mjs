import test from 'node:test';
import assert from 'node:assert/strict';
import {backgroundRect,defaultBackground,normalizeScene,makeScene} from '../src/engine.js';
test('background cover fills portrait stage and centers crop',()=>{
 assert.deepEqual(backgroundRect(1000,500,defaultBackground()),{x:-460,y:0,w:1280,h:640});
});
test('background contain preserves image ratio and applies placement',()=>{
 assert.deepEqual(backgroundRect(1000,500,{fit:'contain',scale:1,x:10,y:-20}),{x:10,y:210,w:360,h:180});
 const r=backgroundRect(360,640,{fit:'cover',scale:2,x:0,y:0});
 assert.deepEqual(r,{x:-180,y:-320,w:720,h:1280});
});
test('legacy scenes gain an independent background layer and keep saved settings',()=>{
 const first=makeScene(),second=makeScene(2);
 first.background.x=20;assert.equal(second.background.x,0);
 const migrated=normalizeScene({keys:{},bg:'#123456'});
 assert.equal(migrated.bg,'#123456');assert.equal(migrated.background.visible,true);assert.equal(migrated.background.grid,true);
 const restored=normalizeScene({...first,background:{src:'data:image/png;base64,AA==',fit:'contain',opacity:.5}});
 assert.equal(restored.background.fit,'contain');assert.equal(restored.background.opacity,.5);assert.equal(restored.background.x,0);
});
