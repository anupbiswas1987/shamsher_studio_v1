import { test } from "node:test";
import assert from "node:assert/strict";
import {
  updateVideoTiming,
  videoTimingFromSource,
} from "../src/screen-video.js";

test("video screen duration follows source duration and caps at reel limit", () => {
  assert.deepEqual(videoTimingFromSource(2, 5, 30), {
    start: 2,
    end: 7,
    sourceDuration: 5,
    trimIn: 0,
    trimOut: 0,
  });
  assert.deepEqual(videoTimingFromSource(28, 5, 30), {
    start: 28,
    end: 30,
    sourceDuration: 5,
    trimIn: 0,
    trimOut: 3,
  });
});

test("video crop and timeline edits stay in source and reel bounds", () => {
  const video = {
    id: 1,
    start: 2,
    end: 8,
    sourceDuration: 8,
    trimIn: 0,
    trimOut: 2,
  };
  assert.deepEqual(
    updateVideoTiming(video, { trimIn: 1, trimOut: 3 }, 30),
    { ...video, trimIn: 1, trimOut: 3, end: 6 },
  );
  assert.deepEqual(
    updateVideoTiming(video, { end: 5 }, 30),
    { ...video, end: 5, trimOut: 5 },
  );
  const moved = updateVideoTiming(video, { start: 10 }, 30);
  assert.equal(moved.start, 10);
  assert.equal(moved.end, 16);
  assert.equal(moved.trimOut, 2);

  const movedToReelEnd = updateVideoTiming(video, { start: 29.9 }, 30);
  assert.equal(movedToReelEnd.start, 29.9);
  assert.equal(movedToReelEnd.end, 30);
  assert.ok(Math.abs(movedToReelEnd.end - movedToReelEnd.start - 0.1) < 1e-9);
  assert.ok(Math.abs(movedToReelEnd.trimOut - 7.9) < 1e-9);
});
