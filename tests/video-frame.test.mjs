import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seekVideoFrame } from '../src/video-frame.js';

class Video extends EventTarget {
  readyState = 2;
  seeking = false;
  position = 0;
  seeks = [];
  pause() {}
  get currentTime() { return this.position; }
  set currentTime(value) { this.seeks.push(value); this.position = value; this.seeking = true; }
  decoded() { this.seeking = false; this.dispatchEvent(new Event('seeked')); }
}
test('nearby source frames still seek and wait for decode before drawing', async () => {
  const video = new Video();
  let ready = false;
  const pending = seekVideoFrame(video, 0.01).then(() => { ready = true; });
  await Promise.resolve();
  assert.equal(ready, false);
  assert.deepEqual(video.seeks, [0.01]);
  video.decoded();
  await pending;
  assert.equal(ready, true);
  await seekVideoFrame(video, 0.01);
  assert.equal(video.seeks.length, 1);
});
test('decoder errors reject rather than exporting a stale frame', async () => {
  const video = new Video();
  const pending = seekVideoFrame(video, 1);
  video.dispatchEvent(new Event('error'));
  await assert.rejects(pending, /Could not decode/);
});
