import { test } from "node:test";
import assert from "node:assert/strict";
import { draftSnapshot } from "../src/screen-draft.js";

test("draft snapshots persist reel limits without storing object URLs", () => {
  const snapshot = draftSnapshot({
    screens: [{ id: 1, start: 0, end: 4, src: "blob:screen", file: "image-file" }],
    audio: { src: "blob:audio", file: "audio-file" },
    audioStart: 2,
    volume: 0.8,
    format: "mp4",
    reducedMotion: false,
    autoOverlap: false,
    maxScreens: 12,
    maxReelDuration: 45,
    maxScreenDuration: 2.5,
    maxMotionDuration: 0.8,
    maxOverlayDuration: 0.3,
    defaultEntry: "Fade",
    defaultExit: "Slide right",
  });

  assert.equal(snapshot.maxScreens, 12);
  assert.equal(snapshot.maxReelDuration, 45);
  assert.equal(snapshot.autoOverlap, false);
  assert.equal(snapshot.maxScreenDuration, 2.5);
  assert.equal(snapshot.maxMotionDuration, 0.8);
  assert.equal(snapshot.maxOverlayDuration, 0.3);
  assert.equal(snapshot.defaultEntry, "Fade");
  assert.equal(snapshot.defaultExit, "Slide right");
  assert.equal(snapshot.screens[0].src, undefined);
  assert.equal(snapshot.audio.src, undefined);
  assert.equal(snapshot.screens[0].file, "image-file");
  assert.equal(snapshot.audio.file, "audio-file");
});
