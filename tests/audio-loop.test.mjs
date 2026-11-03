import { test } from "node:test";
import assert from "node:assert/strict";
import {
  audioPlaybackPosition,
  audioShouldLoop,
} from "../src/audio-loop.js";

test("audio playback position repeats from the configured start", () => {
  assert.equal(audioPlaybackPosition(0.4, 0.5, 1), null);
  assert.equal(audioPlaybackPosition(0.5, 0.5, 1), 0);
  assert.equal(audioPlaybackPosition(1.2, 0.5, 1), 0.7);
  assert.equal(audioPlaybackPosition(2.5, 0.5, 1), 0);
});

test("audio only repeats when its available span is shorter than the reel", () => {
  assert.equal(audioShouldLoop(1, 5, 0.5), true);
  assert.equal(audioShouldLoop(4.5, 5, 0.5), false);
  assert.equal(audioShouldLoop(5, 5, 0), false);
  assert.equal(audioShouldLoop(1, 5, 5), false);
  assert.equal(audioShouldLoop(0, 5, 0), false);
});

test("cropped audio repeats only when enabled and plays within its crop", () => {
  assert.equal(audioPlaybackPosition(2, 1, 8, 2, 2, false), 3);
  assert.equal(audioPlaybackPosition(5, 1, 8, 2, 2, false), null);
  assert.equal(audioPlaybackPosition(5, 1, 8, 2, 2, true), 2);
  assert.equal(audioShouldLoop(8, 10, 1, 2, 2, true), true);
  assert.equal(audioShouldLoop(8, 10, 1, 2, 2, false), false);
});
