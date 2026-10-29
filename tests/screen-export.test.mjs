import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SCREEN_EXPORT,SCREEN_MP4_TYPES,screenExportMime} from '../src/screen-export.js';
test('vertical Full HD export profile uses 30 FPS',()=>{
 assert.equal(SCREEN_EXPORT.width,1080);assert.equal(SCREEN_EXPORT.height,1920);
 assert.equal(SCREEN_EXPORT.width/SCREEN_EXPORT.height,9/16);assert.equal(SCREEN_EXPORT.fps,30);
});
test('MP4 requires explicit H.264 and AAC support',()=>{
 const supported=SCREEN_MP4_TYPES[2];
 assert.equal(screenExportMime({isTypeSupported:t=>t===supported}),supported);
 assert.equal(screenExportMime({isTypeSupported:t=>t==='video/mp4'||t==='video/webm'}),null);
 assert.equal(screenExportMime(null),null);
});
test('recording fallback accepts WebM for later MP4 conversion',async()=>{
 const {screenRecordingMime}=await import('../src/screen-export.js');
 assert.equal(screenRecordingMime({isTypeSupported:t=>t==='video/webm'}),'video/webm');
 assert.equal(screenRecordingMime(null),null);
});
