import test from 'node:test';
import assert from 'node:assert/strict';
import {createSuccessStory,STORY_TITLE} from '../src/story.js';
import {CHARACTER_ASSETS} from '../src/engine.js';
test('success story preserves all dialogue in order and uses existing artwork',()=>{
 const story=createSuccessStory(),scenes=story.scenes;
 assert.equal(story.title,STORY_TITLE);assert.equal(scenes.length,8);
 const dialogue=scenes.filter(s=>s.speaker).map(s=>s.caption.replaceAll('\n',' '));
 assert.deepEqual(dialogue,['শমশের ভাই, জীবনে সফল হতে হলে কী করতে হবে?','প্রথমে একটা লক্ষ্য ঠিক করবেন!','তারপর?','তারপর লক্ষ্যটা এমন জায়গায় রাখবেন,','যেন ব্যর্থ হলেও বলতে পারেন—','লক্ষ্যটা অনেক উঁচুতে ছিল!']);
 assert.equal(scenes.reduce((n,s)=>n+s.duration,0),29.5);
 for(const s of scenes){assert.ok(CHARACTER_ASSETS.some(a=>a.id===s.character));assert.equal(s.captionEnd,s.duration);assert.equal(s.audio.length,0);assert.ok(s.caption.split('\n').every(line=>line.length<35));}
 assert.ok(scenes[6].sfx.length>0);
});
