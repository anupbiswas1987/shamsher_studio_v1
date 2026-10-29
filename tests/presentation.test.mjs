import test from 'node:test';
import assert from 'node:assert/strict';
import {reelFrameAt,cameraAt,wrapDialogue,reorderPanel,defaultPresentation} from '../src/presentation.js';
import {panelsFromLooks} from '../src/comic.js';
import {makeScene,normalizeScene} from '../src/engine.js';
test('reel seeks across exact panel boundaries, clamps the end, and computes dissolves',()=>{
 const panels=[{duration:2},{duration:3,presentation:{transition:'dissolve'}},{duration:4}];
 assert.equal(reelFrameAt(panels,0).index,0);assert.equal(reelFrameAt(panels,2).index,1);assert.equal(reelFrameAt(panels,2).local,0);assert.ok(Math.abs(reelFrameAt(panels,2.15).blend-.5)<1e-8);assert.equal(reelFrameAt(panels,3).blend,1);assert.equal(reelFrameAt(panels,5).index,2);assert.equal(reelFrameAt(panels,30).local,4);assert.equal(reelFrameAt(panels,-4).local,0);assert.equal(reelFrameAt([],2),null);
});
test('comic panel generation freezes each different look and keeps first-panel dialogue/audio',()=>{
 const base={...makeScene(),duration:5,caption:'প্রথম সংলাপ',speaker:'শমশের',audio:[{id:'voice',duration:4}],props:[{id:'book'}]};
 const selected={id:'shomshar/looks',name:'Looks',src:'a.png',frames:['a.png','b.png','c.png']};
 const panels=panelsFromLooks(base,selected,[selected]);assert.equal(panels.length,3);assert.deepEqual(panels.map(p=>p.characterLook),['a.png','b.png','c.png']);assert.deepEqual(panels.map(p=>p.duration),[5,2,2]);assert.equal(panels[0].audio.length,1);assert.equal(panels[1].audio.length,0);assert.equal(panels[1].caption,'');assert.equal(panels[0].presentation.mode,'comic');assert.equal(new Set(panels.map(p=>p.id)).size,3);
 panels[0].props[0].id='changed';assert.equal(panels[1].props[0].id,'book');assert.equal(base.props[0].id,'book');
});
test('panel ordering preserves complete dialogue and returns unchanged data for invalid moves',()=>{
 const panels=[{id:'one',caption:'A'},{id:'two',caption:'B'},{id:'three',caption:'C'}];assert.deepEqual(reorderPanel(panels,0,2).map(p=>p.id),['two','three','one']);assert.equal(panels[0].id,'one');assert.equal(reorderPanel(panels,0,-1),panels);
});
test('Bengali speech bubble wrapping retains words and manual paragraphs',()=>{
 const ctx={measureText:s=>({width:s.length*10})},text='শমশের ভাই জীবনে সফল হতে হলে\nকী করতে হবে?';const lines=wrapDialogue(ctx,text,100);assert.equal(lines.join(' ').replaceAll(/\s+/g,' '),text.replaceAll(/\s+/g,' '));assert.ok(lines.length>2);assert.ok(lines.every(l=>l.length<=10));
});
test('camera movement and presentation survive legacy project normalization',()=>{
 const s=normalizeScene({keys:{},duration:4,presentation:{bubble:'bottom',tail:'left',transition:'dissolve'}});assert.equal(s.presentation.mode,'comic');assert.equal(s.presentation.bubble,'bottom');assert.equal(s.presentation.transition,'dissolve');assert.equal(cameraAt({...s,presentation:{camera:'none'}},3).scale,1);assert.ok(cameraAt(s,4).scale>cameraAt(s,0).scale);assert.equal(defaultPresentation().mode,'comic');
});
