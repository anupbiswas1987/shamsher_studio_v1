import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createAnimation,
  evaluateAnimation,
  evaluateTrack,
  evaluateClip,
  imageGeometry,
  trimClip,
  sourceDuration,
  copyAnimation,
  pasteAnimation,
  customAnimation,
  renderReelFrame,
  focalFromCanvas,
  PRESETS,
  analyzeFraming,
} from "../src/cinematic.js";
const clip = (preset = "zoom-in") => ({
  id: 1,
  start: 0,
  end: 3,
  src: "image",
  fit: "contain",
  animation: createAnimation(preset),
  entry: "None",
  exit: "None",
  transition: 0,
});
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
test("subtle zoom progresses smoothly and arbitrary seeks are deterministic", () => {
  const c = clip();
  near(evaluateAnimation(c, 0).scale, 0.94);
  near(evaluateAnimation(c, 1.5).scale, 0.97);
  near(evaluateAnimation(c, 3).scale, 1);
  let previous = 0;
  for (let frame = 0; frame <= 90; frame++) {
    const state = evaluateAnimation(c, frame / 30);
    assert.ok(state.scale >= previous);
    previous = state.scale;
  }
  assert.deepEqual(evaluateAnimation(c, 1.4), evaluateAnimation(c, 1.4));
});
test("all eleven presets have deterministic, finite states", () => {
  assert.equal(PRESETS.length, 11);
  for (const [name] of PRESETS) {
    const c = clip(name);
    for (const t of [0, 0.3, 1.5, 2.9, 3])
      for (const value of Object.values(evaluateAnimation(c, t)))
        assert.ok(Number.isFinite(value));
  }
});
test("multiple keys, segment easing, duplicate timestamps, opacity and rotation", () => {
  near(
    evaluateTrack(
      [
        { time: 0, value: 0, easing: "ease-in" },
        { time: 2, value: 100 },
        { time: 3, value: 50 },
      ],
      1,
      0,
    ),
    25,
  );
  near(
    evaluateTrack(
      [
        { time: 0, value: 0 },
        { time: 0, value: 10 },
        { time: 2, value: 20 },
      ],
      0,
      0,
    ),
    10,
  );
  const c = clip("custom");
  c.animation.keyframes = {
    rotation: [
      { time: 0, value: 0 },
      { time: 3, value: 30 },
    ],
    opacity: [
      { time: 0, value: 0 },
      { time: 3, value: 1 },
    ],
  };
  near(evaluateAnimation(c, 1.5).rotation, 15);
  near(evaluateAnimation(c, 1.5).opacity, 0.5);
});
test("trim preserves source keyframes and motion clock; move preserves local motion", () => {
  const c = clip("custom");
  c.animation.keyframes.x = [
    { time: 0, value: 0 },
    { time: 1, value: 10 },
    { time: 3, value: 30 },
  ];
  c.animation.easing = "linear";
  const trimmed = trimClip(c, 0.5, 0.5);
  assert.equal(trimmed.end, 2);
  assert.deepEqual(trimmed.animation, c.animation);
  near(evaluateAnimation(trimmed, 0).x, evaluateAnimation(c, 0.5).x);
  near(evaluateAnimation(trimmed, 1).x, evaluateAnimation(c, 1.5).x);
  const moved = { ...trimmed, start: 5, end: 7 };
  assert.deepEqual(evaluateAnimation(trimmed, 1), evaluateAnimation(moved, 6));
  near(sourceDuration(trimmed), 3);
});
test("focal point changes zoom direction and can be picked through inverse transform", () => {
  const c = clip("focal");
  c.animation.protectContent = false;
  const image = { width: 360, height: 640 };
  const center = evaluateClip(c, image, 3);
  c.animation.focal = { x: 0.85, y: 0.2 };
  const face = evaluateClip(c, image, 3);
  assert.ok(face.x < center.x);
  assert.ok(face.y > center.y);
  const point = focalFromCanvas(
    { ...c, animation: { ...c.animation, preset: "static" } },
    image,
    0,
    { x: 270, y: 160 },
  );
  near(point.x, 0.75);
  near(point.y, 0.25);
});
test("contain and cover preserve aspect ratio, custom crop remains bounded", () => {
  const image = { width: 800, height: 600 };
  const c = clip("static");
  const contain = imageGeometry(c, image, evaluateAnimation(c, 1));
  near(contain.bw / contain.bh, 800 / 600);
  assert.equal(contain.clipped, false);
  const cover = imageGeometry(
    { ...c, fit: "cover" },
    image,
    evaluateAnimation(c, 1),
  );
  near(cover.bw / cover.bh, 800 / 600);
  assert.ok(cover.clipped);
  const crop = imageGeometry(
    { ...c, fit: "crop", crop: { x: 0.8, y: 0, width: 0.8, height: 1 } },
    image,
    evaluateAnimation(c, 1),
  );
  near(crop.crop.width, 0.2);
  near(crop.bw / crop.bh, crop.sw / crop.sh);
});
test("content protection keeps rotated artwork inside frame; cover reports overscan", () => {
  const c = clip("custom");
  c.animation.start = { x: 15, y: 20, scale: 2, rotation: 12, opacity: 1 };
  const image = { width: 360, height: 640 };
  const g = evaluateClip(c, image, 1);
  assert.ok(g.protectedContent);
  assert.equal(g.clipped, false);
  const cover = evaluateClip(
    {
      ...c,
      fit: "cover",
      animation: { ...c.animation, start: { ...c.animation.start, scale: 1 } },
    },
    image,
    1,
  );
  assert.ok(cover.needsOverscan);
  assert.ok(cover.scale >= cover.overscanScale);
});
test("animation copy/paste scales source key times without mutating source", () => {
  const c = clip("custom");
  c.animation.keyframes.x = [
    { time: 0, value: 0 },
    { time: 3, value: 5 },
  ];
  const pasted = pasteAnimation({ ...clip(), end: 6 }, copyAnimation(c));
  assert.equal(pasted.animation.keyframes.x[1].time, 6);
  assert.equal(c.animation.keyframes.x[1].time, 3);
  assert.equal(customAnimation(clip()).keyframes.scale.length, 2);
});
test("reload serialization preserves animation and reduced motion suppresses movement", () => {
  const c = clip("handheld");
  assert.deepEqual(
    evaluateAnimation(c, 1.2),
    evaluateAnimation(JSON.parse(JSON.stringify(c)), 1.2),
  );
  assert.deepEqual(evaluateAnimation(c, 1.2, { reducedMotion: true }), {
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    opacity: 1,
  });
});
test("shared renderer composes camera and transition at the requested time", () => {
  const c = clip("diagonal");
  c.entry = "Fade";
  c.transition = 0.7;
  const image = { width: 720, height: 1280 },
    calls = [];
  const ctx = new Proxy(
    {},
    {
      set: (_, key, value) => {
        calls.push([key, value]);
        return true;
      },
      get:
        (_, key) =>
        (...args) =>
          calls.push([key, ...args]),
    },
  );
  renderReelFrame(ctx, [c], new Map([[1, image]]), 0.35);
  const g = evaluateClip(c, image, 0.35);
  assert.deepEqual(
    calls.find((c) => c[0] === "translate"),
    ["translate", g.x, g.y],
  );
  assert.deepEqual(
    calls.find((c) => c[0] === "scale"),
    ["scale", g.scale, g.scale],
  );
  near(calls.find((c) => c[0] === "globalAlpha")[1], 0.5);
  const imageCall = calls.find((c) => c[0] === "drawImage");
  assert.equal(imageCall[1], image);
  near(imageCall[8] / imageCall[9], 720 / 1280);
  const hidden = [];
  const hiddenCtx = new Proxy(
    {},
    {
      set: () => true,
      get:
        (_, key) =>
        (...args) =>
          hidden.push(key),
    },
  );
  renderReelFrame(hiddenCtx, [c], new Map([[1, image]]), 3.1);
  assert.ok(!hidden.includes("drawImage"));
});
test("cover overscan preserves subtle zoom instead of flattening its motion", () => {
  const c = { ...clip(), fit: "cover" },
    image = { width: 360, height: 640 };
  const start = evaluateClip(c, image, 0),
    end = evaluateClip(c, image, 3);
  near(start.scale, 1);
  assert.ok(end.scale > 1.06);
  assert.ok(start.needsOverscan);
  near(evaluateClip(c, image, 1, { reducedMotion: true }).scale, 1);
});

test("framing analysis reports future overscan before the risky frame is reached", () => {
  const c = clip("custom");
  c.fit = "cover";
  c.animation.keyframes.x = [
    { time: 0, value: 0 },
    { time: 3, value: 15 },
  ];
  assert.equal(
    evaluateClip(c, { width: 360, height: 640 }, 0).needsOverscan,
    false,
  );
  const report = analyzeFraming(c, { width: 360, height: 640 });
  assert.equal(report.needsOverscan, true);
  assert.ok(report.maxRequiredScale >= 1.3);
});
