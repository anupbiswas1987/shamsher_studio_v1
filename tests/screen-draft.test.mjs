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
    maxScreens: 12,
    maxReelDuration: 45,
  });

  assert.equal(snapshot.maxScreens, 12);
  assert.equal(snapshot.maxReelDuration, 45);
  assert.equal(snapshot.screens[0].src, undefined);
  assert.equal(snapshot.audio.src, undefined);
  assert.equal(snapshot.screens[0].file, "image-file");
  assert.equal(snapshot.audio.file, "audio-file");
});
