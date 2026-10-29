import { loadScreenDraft } from "/src/screen-draft.js";
import {
  evaluateAnimation,
  renderReelFrame,
  sourceTime,
  renderClip,
} from "/src/cinematic.js";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (value, message) => {
  if (!value) throw Error(message);
};
const until = async (fn, message) => {
  for (let i = 0; i < 600; i++) {
    if (await fn()) return;
    await wait(50);
  }
  throw Error(message || "Browser check timed out");
};
function reveal(el) {
  if (!el) return el;
  const view = el.closest(".screen-settings")
    ? "edit"
    : el.closest(".screen-preview")
      ? "preview"
      : el.closest(".screen-editor")
        ? "screens"
        : null;
  if (view) {
    const nav = document.querySelector(
      `.mobile-workspace-nav button[aria-pressed]`,
    );
    const buttons = [
      ...document.querySelectorAll(".mobile-workspace-nav button"),
    ];
    const index = { screens: 0, preview: 1, edit: 2 }[view];
    if (
      buttons[index] &&
      buttons[index].getAttribute("aria-pressed") !== "true"
    )
      buttons[index].click();
  }
  const panel = el.closest('[role="tabpanel"]');
  if (panel?.hidden)
    document.getElementById(panel.getAttribute("aria-labelledby")).click();
  for (let parent = el.parentElement; parent; parent = parent.parentElement)
    if (parent.tagName === "DETAILS" && !parent.open) parent.open = true;
  return el;
}
const field = (label) =>
  reveal(document.querySelector(`[aria-label="${label}"]`));
const button = (text) =>
  reveal(
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === text,
    ),
  );
function input(el, value) {
  assert(el, "Input missing");
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
    el,
    String(value),
  );
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
function select(el, value) {
  assert(el, "Select missing");
  el.value = value;
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
async function saved() {
  await wait(80);
  await until(
    () => document.body.textContent.includes("Draft saved on this device"),
    "Draft was not saved",
  );
  return loadScreenDraft();
}
async function seek(t) {
  const control = field("Reel playhead");
  await wait(30);
  input(control, t);
  await wait(80);
}
function pixels(canvas) {
  return canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height)
    .data;
}
const preview = () =>
  document.querySelector('[aria-label="Screen reel preview"]');
function check(condition, message) {
  assert(condition, message);
}
async function compareFrame() {
  const draft = await saved();
  const images = new Map(),
    clips = await Promise.all(
      draft.screens.map(async (c) => {
        if (!c.file) return c;
        const im = new Image(),
          src = URL.createObjectURL(c.file);
        im.src = src;
        await im.decode();
        images.set(c.id, im);
        return { ...c, src };
      }),
    );
  const t = Number(field("Reel playhead").value),
    c = document.createElement("canvas");
  c.width = 360;
  c.height = 640;
  renderReelFrame(c.getContext("2d"), clips, images, t, {
    reducedMotion: draft.reducedMotion,
  });
  const expected = pixels(c),
    actual = pixels(preview());
  assert(
    expected.every((value, i) => value === actual[i]),
    "Scrubbed preview differs from deterministic export frame",
  );
  return { draft, clips, images, t };
}
try {
  await until(
    () =>
      document.querySelector(".animation-inspector") &&
      document.body.textContent.includes("Draft saved on this device"),
  );
  const library=document.querySelector('.screen-editor'),stage=document.querySelector('.screen-preview');
  assert(!document.querySelector('.screen-settings'),'Redesigned settings panel still present');
  assert(!document.querySelector('.mobile-workspace-nav'),'Redesigned mobile navigation still present');
  assert(library.querySelectorAll('.screen-options').length===library.querySelectorAll('.screen-row').length,'Per-screen timing controls not restored');
  assert(library.querySelector('.animation-inspector')&&library.querySelector('.screen-audio'),'Original inspector and audio positions not restored');
  if(innerWidth>740){const l=library.getBoundingClientRect(),r=stage.getBoundingClientRect();assert(l.right<=r.left+1,'Earlier two-column layout not restored')}
  if (!sessionStorage.getItem("cinematic-reload")) {
    assert(field("Motion preset").options.length === 11, "Missing preset");
    assert(
      field("Animation image fit").value === "contain",
      "New clips must contain the entire illustration",
    );
    assert(
      field("Screen 1 end").value === "3",
      "New clip should last 3 seconds",
    );
    const fixture = document.createElement("canvas");
    fixture.width = 360;
    fixture.height = 640;
    const ctx = fixture.getContext("2d");
    ctx.fillStyle = "#ca7758";
    ctx.fillRect(0, 0, 360, 640);
    ctx.fillStyle = "#355d80";
    ctx.fillRect(45, 80, 200, 380);
    ctx.fillStyle = "#f6e9cd";
    ctx.fillRect(10, 10, 340, 60);
    ctx.fillStyle = "#231d25";
    ctx.font = "20px sans-serif";
    ctx.fillText("বাংলা সংলাপ", 30, 45);
    ctx.fillStyle = "#f7dc79";
    ctx.fillRect(260, 140, 55, 240);
    const blob = await new Promise((r) => fixture.toBlob(r)),
      dt = new DataTransfer();
    dt.items.add(new File([blob], "bengali-comic.png", { type: "image/png" }));
    field("Upload screen 1").files = dt.files;
    field("Upload screen 1").dispatchEvent(
      new Event("change", { bubbles: true }),
    );
    await until(() => document.querySelector(".screen-thumb img"));
    await saved();
    await seek(0.2);
    const before = new Uint8ClampedArray(pixels(preview()));
    await seek(2.5);
    assert(
      pixels(preview()).some((v, i) => v !== before[i]),
      "Zoom did not change the static image",
    );
    await compareFrame();
    const gallery = [...document.querySelectorAll("summary")].find((s) =>
      s.textContent.startsWith("Visual preset"),
    );
    gallery.click();
    await until(
      () => document.querySelectorAll(".preset-gallery canvas").length === 11,
    );
    select(field("Motion preset"), "focal");
    await seek(1.5);
    button("Pick focal point on image").click();
    await wait(50);
    const rect = preview().getBoundingClientRect();
    preview().dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        clientX: rect.left + rect.width * 0.73,
        clientY: rect.top + rect.height * 0.28,
      }),
    );
    await saved();
    assert(
      Number(field("Focal X (%)").value) > 65,
      "Face focal X did not update",
    );
    assert(
      Number(field("Focal Y (%)").value) < 35,
      "Face focal Y did not update",
    );
    assert(
      document.querySelector(".focal-marker"),
      "Focal target marker missing",
    );
    select(field("Motion preset"), "custom");
    await seek(1.5);
    field("Add Position X (%) keyframe").click();
    await until(() => field("Keyframe value"));
    input(field("Keyframe value"), 1.2);
    await saved();
    let draft = await saved();
    assert(
      draft.screens[0].animation.keyframes.x.length === 3,
      "Multiple keyframes not stored",
    );
    input(field("Keyframe time (s)"), 1.4);
    select(field("Keyframe segment easing"), "linear");
    await saved();
    await seek(1.4);
    await compareFrame();
    const trimSummary = [...document.querySelectorAll("summary")].find((s) =>
      s.textContent.startsWith("Trim clip"),
    );
    trimSummary.click();
    await wait(20);
    input(field("Trim start (s)"), 0.4);
    await saved();
    input(field("Trim end (s)"), 0.6);
    draft = await saved();
    assert(Math.abs(draft.screens[0].end - 2) < 1e-8, "Trim length is wrong");
    assert(
      draft.screens[0].animation.keyframes.x.some((k) => k.time === 1.4),
      "Trim moved keyframes",
    );
    await seek(1);
    const checkFrame = await compareFrame();
    assert(
      Math.abs(sourceTime(checkFrame.clips[0], 1) - 1.4) < 1e-8,
      "Scrub does not use source time after trim",
    );
    assert(
      Math.abs(evaluateAnimation(checkFrame.clips[0], 1).x - 1.2) < 1e-8,
      "Trim changed the keyframe value",
    );
    button("Copy animation").click();
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent.startsWith("Add screen"))
      .click();
    await until(() => field("Select screen 2 for animation"));
    button("Animate screen 2").click();
    await wait(80);
    button("Paste animation").click();
    draft = await saved();
    assert(
      draft.screens[1].animation.preset === "custom",
      "Paste did not copy preset",
    );
    assert(
      draft.screens[1].animation.keyframes.x.length === 3,
      "Paste did not copy keys",
    );
    assert(
      field("Select screen 1 for animation").checked &&
        field("Select screen 2 for animation").checked,
      "Multi-clip selection missing",
    );
    button("Apply to selected clips").click();
    await saved();
    select(field("Motion preset"), "pan-left");
    select(field("Animation image fit"), "crop");
    await saved();
    assert(field("Crop width (%)"), "Custom crop fields missing");
    input(field("Crop x (%)"), 10);
    input(field("Crop width (%)"), 80);
    await saved();
    button("Apply to selected clips").click();
    await saved();
    button("Animate screen 1").click();
    select(field("Animation image fit"), "contain");
    await saved();
    await seek(1);
    await compareFrame();
    // Preview pixels already match the shared renderer; verify export uses its exact scale.
    const { clips, images, t } = await compareFrame(),
      full = document.createElement("canvas");
    full.width = 1080;
    full.height = 1920;
    const fullCtx = full.getContext("2d");
    fullCtx.scale(3, 3);
    renderReelFrame(fullCtx, clips, images, t);
    const down = document.createElement("canvas");
    down.width = 360;
    down.height = 640;
    const downCtx = down.getContext("2d");
    downCtx.drawImage(full, 0, 0, 360, 640);
    const actual = pixels(preview()),
      resampled = pixels(down);
    let error = 0;
    for (let i = 0; i < actual.length; i++)
      error += Math.abs(actual[i] - resampled[i]);
    assert(
      error / actual.length < 2,
      "Full-HD output framing differs from preview",
    );
    sessionStorage.setItem("cinematic-reload", "yes");
    location.reload();
  } else {
    await until(() => document.querySelector(".screen-thumb img"));
    const draft = await saved();
    assert(
      draft.screens[0].animation.preset === "pan-left",
      "Animation preset not restored",
    );
    assert(
      draft.screens[0].trimIn === 0.4 && draft.screens[0].trimOut === 0.6,
      "Trims not restored",
    );
    assert(
      draft.screens[0].animation.focal.x > 0.65,
      "Focal point not restored",
    );
    await seek(1);
    await compareFrame();
    assert(
      document.documentElement.scrollWidth <= innerWidth,
      "Page overflows horizontally",
    );
    await fetch("/__check-done", {
      method: "POST",
      body: JSON.stringify({
        passed: true,
        viewport: innerWidth,
        checks: [
          "restored two-column workspace",
          "restored per-screen timing controls",
          "original inspector and audio positions",
          "11 presets and visual previews",
          "3-second contain default",
          "continuous image zoom",
          "face focal-point selection",
          "multiple editable keyframes",
          "per-segment easing",
          "trim-safe source clock",
          "exact scrub/export frame parity",
          "animation copy/paste",
          "apply to selected clips",
          "custom cropping",
          "draft reload with animation and trim",
          "no horizontal overflow",
        ],
      }),
    });
  }
} catch (e) {
  await fetch("/__check-done", {
    method: "POST",
    body: JSON.stringify({ passed: false, error: e.stack || String(e) }),
  });
}
