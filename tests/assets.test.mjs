import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {scanAssetCatalog} from '../scripts/asset-catalog.mjs';
import {frameAt,resolveCharacterAsset,canonicalCharacterId} from '../src/assets.js';
import {normalizeScene} from '../src/engine.js';
test('folder scan groups characters and sequences, orders frames numerically and maps all four tabs',async()=>{
 const root=await mkdtemp(join(tmpdir(),'studio-assets-'));
 try{const files=['character/hero/idle.png','character/hero/walk/frame10.png','character/hero/walk/frame2.png','character/hero/walk/frame1.png','character/friend/001.png','character/friend/002.png','character/hero/notes.txt','character/loose.png','character/.hidden/001.png','props/tea cup.png','audio/dialogue/বাংলা কথা.mp3','background/park.webp'];
 for(const file of files){await mkdir(join(root,file,'..'),{recursive:true});await writeFile(join(root,file),'fixture')}
 const catalog=await scanAssetCatalog(root);assert.deepEqual(catalog.characters.map(c=>c.id),['friend','hero']);
 const hero=catalog.characters.find(c=>c.id==='hero');assert.equal(hero.assets.length,2);
 assert.deepEqual(hero.assets.find(a=>a.id==='hero/walk').frames,['/character/hero/walk/frame1.png','/character/hero/walk/frame2.png','/character/hero/walk/frame10.png']);
 assert.equal(catalog.characters[0].assets[0].id,'friend/default');assert.equal(catalog.characters[0].assets[0].frames.length,2);
 assert.equal(catalog.props[0].src,'/props/tea%20cup.png');assert.equal(catalog.audio[0].src,'/audio/dialogue/'+encodeURIComponent('বাংলা কথা.mp3'));assert.equal(catalog.backgrounds[0].src,'/background/park.webp');
 }finally{await rm(root,{recursive:true,force:true})}
});
test('missing or empty asset folders produce usable empty libraries',async()=>{
 const root=await mkdtemp(join(tmpdir(),'studio-empty-'));try{assert.deepEqual(await scanAssetCatalog(root),{version:1,characters:[],props:[],audio:[],backgrounds:[]})}finally{await rm(root,{recursive:true,force:true})}
});
test('frame playback follows FPS, loops, holds last frame, and resets at cue start',()=>{
 const asset={src:'a',frames:['a','b','c'],fps:4};assert.equal(frameAt(asset,0),'a');assert.equal(frameAt(asset,.25),'b');assert.equal(frameAt(asset,.5),'c');assert.equal(frameAt(asset,.75),'a');assert.equal(frameAt(asset,10,{loop:false}),'c');assert.equal(frameAt(asset,2.25,{start:2}),'b');assert.equal(frameAt(asset,-3),'a');assert.equal(frameAt(null,1),null);
});
test('saved legacy character references migrate without dropping timeline or unknown future assets',()=>{
 assert.equal(resolveCharacterAsset('teacher').id,'shomshar/teacher');assert.equal(canonicalCharacterId('another-character/walk'),'another-character/walk');
 const keys={Character:[{t:1,x:8,y:9,r:10}]},scene=normalizeScene({keys,character:'teacher',poseSequence:[{t:2,character:'thinking'}]});assert.equal(scene.character,'shomshar/teacher');assert.equal(scene.poseSequence[0].character,'shomshar/thinking');assert.deepEqual(scene.keys,keys);assert.deepEqual(scene.characterPlayback,{fps:.5,loop:true});
});

test('different looks are held for two seconds by default',()=>{
 const looks={src:'thinking.png',frames:['thinking.png','speaking.png','laughing.png']};
 assert.equal(frameAt(looks,1.99),'thinking.png');assert.equal(frameAt(looks,2),'speaking.png');assert.equal(frameAt(looks,4),'laughing.png');assert.equal(frameAt(looks,6),'thinking.png');
 assert.equal(frameAt(looks,12,{loop:false}),'laughing.png');
});
