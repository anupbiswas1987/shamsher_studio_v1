import test from 'node:test';
import assert from 'node:assert/strict';
import { videoAudioClips } from '../src/screen-video-audio.js';

test('video audio follows crop and reel timing without repeating', () => {
  const screen = { mediaType: 'video', src: 'blob:video', start: 2, end: 5, sourceDuration: 10, trimIn: 1 };
  const [clip] = videoAudioClips([screen]);
  assert.equal(clip.start, 2);
  assert.equal(clip.trimStart, 1);
  assert.equal(clip.trimEnd, 6);
  assert.equal(clip.duration - clip.trimStart - clip.trimEnd, screen.end - screen.start);
  assert.equal(clip.repeatToEnd, false);
  assert.equal(videoAudioClips([{ ...screen, useVideoAudio: false }]).length, 0);
  assert.equal(videoAudioClips([{ ...screen, mediaType: 'image' }]).length, 0);
  assert.equal(videoAudioClips([{ ...screen, src: undefined, asset: 'uploaded.mp4' }]).length, 1);
});
