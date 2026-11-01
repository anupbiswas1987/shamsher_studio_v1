// Deterministic camera evaluation. Positions are percentages of the 360 × 640 stage;
// rotation is degrees, scale is relative to the aspect-preserving image fit.
export const PROPERTIES = ["x", "y", "scale", "rotation", "opacity"];
export const EASINGS = {
  linear: (t) => t,
  "ease-in": (t) => t * t,
  "ease-out": (t) => 1 - (1 - t) ** 2,
  "ease-in-out": (t) => t * t * (3 - 2 * t),
};
export const PRESETS = [
  ["static", "Static"],
  ["zoom-in", "Slow zoom in"],
  ["zoom-out", "Slow zoom out"],
  ["pan-left", "Pan left"],
  ["pan-right", "Pan right"],
  ["pan-up", "Pan up"],
  ["pan-down", "Pan down"],
  ["focal", "Zoom toward focal point"],
  ["diagonal", "Diagonal cinematic drift"],
  ["handheld", "Gentle handheld camera"],
  ["custom", "Custom keyframes"],
];
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const finite = (v, fallback) => (Number.isFinite(v) ? v : fallback);
const identity = () => ({ x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 });
export function createAnimation(preset = "zoom-in") {
  let start = identity(),
    end = identity();
  if (preset === "zoom-in") {
    start.scale = 0.94;
    end.scale = 1;
  }
  if (preset === "zoom-out") {
    start.scale = 1;
    end.scale = 0.94;
  }
  if (preset.startsWith("pan-")) {
    start.scale = end.scale = 0.94;
    const key = ["pan-left", "pan-right"].includes(preset) ? "x" : "y",
      direction = ["pan-left", "pan-up"].includes(preset) ? -1 : 1;
    start[key] = -2 * direction;
    end[key] = 2 * direction;
  }
  if (preset === "focal") {
    start.scale = 0.94;
    end.scale = 1.06;
  }
  if (preset === "diagonal") {
    start = { ...start, x: -1.5, y: 1.5, scale: 0.94 };
    end = { ...end, x: 1.5, y: -1.5, scale: 0.98 };
  }
  if (preset === "handheld") start.scale = end.scale = 0.97;
  return {
    preset,
    duration: null,
    intensity: 1,
    easing: "ease-in-out",
    start,
    end,
    focal: { x: 0.5, y: 0.5 },
    protectContent: true,
    avoidEmpty: true,
    keyframes: {},
  };
}
export function normalizeAnimation(animation) {
  const defaults = createAnimation(animation?.preset || "zoom-in");
  return {
    ...defaults,
    ...animation,
    start: { ...defaults.start, ...animation?.start },
    end: { ...defaults.end, ...animation?.end },
    focal: { ...defaults.focal, ...animation?.focal },
    keyframes: { ...animation?.keyframes },
  };
}
export function sourceDuration(clip) {
  return Math.max(
    0.1,
    finite(
      clip.sourceDuration,
      clip.end - clip.start + (clip.trimIn || 0) + (clip.trimOut || 0),
    ),
  );
}
export function sourceTime(clip, timelineTime) {
  return (
    clamp(timelineTime - clip.start, 0, clip.end - clip.start) +
    (clip.trimIn || 0)
  );
}
export function evaluateTrack(keys, time, fallback, easing = "linear") {
  const ordered = (keys || [])
    .filter((k) => Number.isFinite(k.time) && Number.isFinite(k.value))
    .map((k, i) => ({ ...k, i }))
    .sort((a, b) => a.time - b.time || a.i - b.i);
  if (!ordered.length) return fallback;
  if (time < ordered[0].time) return ordered[0].value;
  let left = ordered[0];
  for (const right of ordered) {
    if (right.time <= time) {
      left = right;
      continue;
    }
    const p = clamp((time - left.time) / (right.time - left.time), 0, 1),
      ease = EASINGS[left.easing || easing] || EASINGS.linear;
    return left.value + (right.value - left.value) * ease(p);
  }
  return left.value;
}
export function evaluateAnimation(
  clip,
  timelineTime,
  { reducedMotion = false } = {},
) {
  const a = normalizeAnimation(clip.animation),
    length = sourceDuration(clip),
    t = sourceTime(clip, timelineTime),
    duration = a.duration == null ? length : Math.max(0.01, a.duration),
    progress = clamp(t / duration, 0, 1),
    ease = (EASINGS[a.easing] || EASINGS.linear)(progress);
  let state = identity();
  if (a.preset === "custom") {
    for (const key of PROPERTIES)
      state[key] = evaluateTrack(a.keyframes[key], t, a.start[key], a.easing);
  } else if (a.preset !== "static") {
    for (const key of PROPERTIES)
      state[key] = a.start[key] + (a.end[key] - a.start[key]) * ease;
    if (a.preset === "handheld") {
      // Analytic bounded movement: no random numbers or frame-history dependence.
      const envelope = Math.sin(Math.PI * progress);
      state.x +=
        envelope * (0.3 * Math.sin(t * 2.1) + 0.12 * Math.sin(t * 4.7));
      state.y += envelope * 0.25 * Math.sin(t * 1.7);
      state.rotation += envelope * 0.18 * Math.sin(t * 2.3);
    }
  }
  const intensity = clamp(finite(a.intensity, 1), 0, 2);
  for (const key of ["x", "y", "rotation"]) state[key] *= intensity;
  state.scale = 1 + (state.scale - 1) * intensity;
  state.scale = clamp(finite(state.scale, 1), 0.05, 5);
  state.opacity = clamp(finite(state.opacity, 1), 0, 1);
  state.x = finite(state.x, 0);
  state.y = finite(state.y, 0);
  state.rotation = finite(state.rotation, 0);
  if (reducedMotion) return { ...identity(), opacity: state.opacity };
  return state;
}
export function customAnimation(clip) {
  const a = normalizeAnimation(clip.animation),
    duration = sourceDuration(clip);
  if (a.preset === "custom") return a;
  const times =
    a.preset === "handheld"
      ? Array.from({ length: 31 }, (_, i) => (duration * i) / 30)
      : [0, Math.min(duration, a.duration ?? duration), duration];
  const ordered = [...new Set(times)].sort((x, y) => x - y),
    keyframes = {};
  for (const property of PROPERTIES)
    keyframes[property] = ordered.map((time) => ({
      time,
      value: evaluateAnimation(
        { ...clip, trimIn: 0, trimOut: 0, end: clip.start + duration },
        clip.start + time,
      )[property],
      easing: a.easing,
    }));
  return { ...a, preset: "custom", intensity: 1, keyframes };
}
export function copyAnimation(clip) {
  return {
    animation: structuredClone(normalizeAnimation(clip.animation)),
    duration: sourceDuration(clip),
  };
}
export function pasteAnimation(clip, copied) {
  const animation = structuredClone(copied.animation),
    ratio = sourceDuration(clip) / copied.duration;
  for (const key of PROPERTIES)
    if (animation.keyframes[key])
      animation.keyframes[key] = animation.keyframes[key].map((frame) => ({
        ...frame,
        time: frame.time * ratio,
      }));
  if (animation.duration != null) animation.duration *= ratio;
  return { ...clip, animation };
}
// Trimming preserves the source clock and every keyframe; moving a clip just changes start/end.
export function trimClip(clip, trimIn, trimOut) {
  const length = sourceDuration(clip);
  trimIn = clamp(finite(trimIn, 0), 0, length - 0.1);
  trimOut = clamp(finite(trimOut, 0), 0, length - trimIn - 0.1);
  const duration = length - trimIn - trimOut;
  if (clip.start + duration > 30)
    throw Error("Trimmed clip would exceed the 30-second reel limit.");
  return {
    ...clip,
    sourceDuration: length,
    trimIn,
    trimOut,
    end: clip.start + duration,
  };
}
export function normalizeCrop(crop) {
  const x = clamp(finite(crop?.x, 0), 0, 0.99),
    y = clamp(finite(crop?.y, 0), 0, 0.99);
  return {
    x,
    y,
    width: clamp(finite(crop?.width, 1), 0.01, 1 - x),
    height: clamp(finite(crop?.height, 1), 0.01, 1 - y),
  };
}
export function imageGeometry(
  clip,
  image,
  state,
  width = 360,
  height = 640,
  options = {},
) {
  const a = normalizeAnimation(clip.animation),
    crop =
      clip.fit === "crop"
        ? normalizeCrop(clip.crop)
        : { x: 0, y: 0, width: 1, height: 1 },
    sw = image.width * crop.width,
    sh = image.height * crop.height,
    fit = clip.fit === "cover" || clip.fit === "crop" ? "cover" : "contain",
    base = (fit === "cover" ? Math.max : Math.min)(width / sw, height / sh),
    bw = sw * base,
    bh = sh * base,
    angle = (state.rotation * Math.PI) / 180,
    cos = Math.cos(angle),
    sin = Math.sin(angle);
  // A constant overscan baseline preserves zoom movement in Cover mode. Merely
  // clamping every sub-1 scale to 1 would flatten a 0.94 → 1 zoom into a still.
  let baseline = 1;
  if (fit === "cover" && a.avoidEmpty && !options.reducedMotion) {
    const candidates = [
      evaluateAnimation(clip, clip.start).scale,
      evaluateAnimation(clip, clip.end).scale,
    ];
    if (a.preset === "custom")
      for (const key of a.keyframes.scale || []) {
        if (
          key.time >= (clip.trimIn || 0) &&
          key.time <= sourceDuration(clip) - (clip.trimOut || 0)
        )
          candidates.push(clamp(1 + (key.value - 1) * a.intensity, 0.05, 5));
      }
    baseline = 1 / Math.min(1, ...candidates);
  }
  let scale = state.scale * baseline,
    x = width / 2 + (state.x * width) / 100,
    y = height / 2 + (state.y * height) / 100;
  // Anchor zoom to an image-space focal point, after translating it into the crop.
  const fx = clamp((a.focal.x - crop.x) / crop.width, 0, 1) - 0.5,
    fy = clamp((a.focal.y - crop.y) / crop.height, 0, 1) - 0.5;
  x -= fx * bw * (scale - 1);
  y -= fy * bh * (scale - 1);
  const requested = { x, y, scale };
  let protectedContent = false;
  if (fit === "contain" && a.protectContent) {
    const rw = Math.abs(bw * cos) + Math.abs(bh * sin),
      rh = Math.abs(bw * sin) + Math.abs(bh * cos),
      maxScale = Math.min(width / rw, height / rh);
    scale = Math.min(scale, maxScale);
    const halfW = (rw * scale) / 2,
      halfH = (rh * scale) / 2;
    const before = { x, y };
    x = clamp(x, halfW, width - halfW);
    y = clamp(y, halfH, height - halfH);
    protectedContent =
      Math.abs(scale - requested.scale) > 1e-6 ||
      Math.abs(x - before.x) > 1e-6 ||
      Math.abs(y - before.y) > 1e-6;
  }
  const requiredScale = () =>
    Math.max(
      ...[
        [0, 0],
        [width, 0],
        [width, height],
        [0, height],
      ].flatMap(([cx, cy]) => {
        const dx = cx - x,
          dy = cy - y;
        return [
          Math.abs(dx * cos + dy * sin) / (bw / 2),
          Math.abs(-dx * sin + dy * cos) / (bh / 2),
        ];
      }),
    );
  const overscanScale = Math.max(requiredScale(), baseline > 1 ? scale : 0),
    needsOverscan =
      fit === "cover" && (baseline > 1 + 1e-6 || overscanScale > scale + 1e-6);
  if (fit === "cover" && a.avoidEmpty) scale = Math.max(scale, overscanScale);
  const corners = [
    [-bw / 2, -bh / 2],
    [bw / 2, -bh / 2],
    [bw / 2, bh / 2],
    [-bw / 2, bh / 2],
  ].map(([px, py]) => ({
    x: x + scale * (px * cos - py * sin),
    y: y + scale * (px * sin + py * cos),
  }));
  const clipped = corners.some(
    (p) =>
      p.x < -0.01 || p.x > width + 0.01 || p.y < -0.01 || p.y > height + 0.01,
  );
  return {
    x,
    y,
    scale,
    rotation: state.rotation,
    opacity: state.opacity,
    bw,
    bh,
    base,
    crop,
    sx: crop.x * image.width,
    sy: crop.y * image.height,
    sw,
    sh,
    requested,
    protectedContent,
    needsOverscan,
    overscanScale,
    clipped,
    corners,
  };
}
export function transitionState(clip,time,{reducedMotion=false}={}){
 const local=time-clip.start,d=Math.min(clip.transition||0,(clip.end-clip.start)/2);let style='None',p=1,exit=false;
 if(d>0&&local<d){style=clip.entry;p=local/d}else if(d>0&&time>clip.end-d){style=clip.exit;p=(clip.end-time)/d;exit=true}
 const q=1-clamp(p,0,1),direction=exit?-1:1;if(reducedMotion)return {x:0,y:0,scale:1,opacity:1};
 return {x:style==='Slide left'?q*360*direction:style==='Slide right'?-q*360*direction:0,y:style==='Slide up'?q*640*direction:style==='Slide down'?-q*640*direction:0,scale:style==='Zoom'?1+q*.3:1,opacity:!style||style==='None'?1:1-q};
}
export function evaluateClip(clip, image, time, options = {}) {
  const motion = evaluateAnimation(clip, time, options),
    geometry = imageGeometry(clip, image, motion, 360, 640, options),
    transition = transitionState(clip, time, options);
  return {
    ...geometry,
    x: geometry.x + transition.x,
    y: geometry.y + transition.y,
    scale: geometry.scale * transition.scale,
    opacity: geometry.opacity * transition.opacity,
  };
}
export function renderClip(ctx, clip, image, time, options = {}) {
  const g = evaluateClip(clip, image, time, options);
  ctx.save();
  ctx.globalAlpha = g.opacity;
  if (clip.fit === "contain") {
    const background = clip.fitBackground || {};
    if (background.mode === "color") {
      ctx.fillStyle = background.color || "#292630";
      ctx.fillRect(0, 0, 360, 640);
    } else {
      const blur = clamp(finite(background.blur, 18), 0, 32);
      const scale = Math.max(360 / image.width, 640 / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      ctx.save();
      ctx.filter = `blur(${blur}px)`;
      ctx.drawImage(
        image,
        (360 - width) / 2,
        (640 - height) / 2,
        width,
        height,
      );
      ctx.restore();
    }
  }
  ctx.translate(g.x, g.y);
  ctx.rotate((g.rotation * Math.PI) / 180);
  ctx.scale(g.scale, g.scale);
  ctx.drawImage(
    image,
    g.sx,
    g.sy,
    g.sw,
    g.sh,
    -g.bw / 2,
    -g.bh / 2,
    g.bw,
    g.bh,
  );
  ctx.restore();
  return g;
}
export function renderReelFrame(ctx, clips, images, time, options = {}) {
  ctx.fillStyle = "#101115";
  ctx.fillRect(0, 0, 360, 640);
  const lastEnd = Math.max(
    0,
    ...clips.filter((c) => c.src && images.has(c.id)).map((c) => c.end),
  );
  for (const clip of clips) {
    const image = images.get(clip.id);
    if (
      clip.src &&
      image &&
      time >= clip.start &&
      (time < clip.end || (time === lastEnd && clip.end === lastEnd))
    )
      renderClip(ctx, clip, image, time, options);
  }
}
// Image-space focal picking uses the inverse of exactly the transform used to render.
export function focalFromCanvas(clip, image, time, point, options = {}) {
  const g = evaluateClip(clip, image, time, options),
    angle = (-g.rotation * Math.PI) / 180,
    dx = (point.x - g.x) / g.scale,
    dy = (point.y - g.y) / g.scale;
  return {
    x: clamp(
      g.crop.x +
        ((dx * Math.cos(angle) - dy * Math.sin(angle)) / g.bw + 0.5) *
          g.crop.width,
      0,
      1,
    ),
    y: clamp(
      g.crop.y +
        ((dx * Math.sin(angle) + dy * Math.cos(angle)) / g.bh + 0.5) *
          g.crop.height,
      0,
      1,
    ),
  };
}
// Inspect the same 30 FPS camera samples used by MP4, including exact key times.
export function analyzeFraming(clip, image) {
  const duration = clip.end - clip.start,
    animation = normalizeAnimation(clip.animation),
    times = new Set([clip.start, clip.end]);
  for (let frame = 0; frame <= Math.ceil(duration * 30); frame++)
    times.add(clip.start + Math.min(duration, frame / 30));
  for (const keys of Object.values(animation.keyframes))
    for (const key of keys) {
      const t = clip.start + key.time - (clip.trimIn || 0);
      if (t >= clip.start && t <= clip.end) times.add(t);
    }
  const summary = {
    needsOverscan: false,
    protectedContent: false,
    clipped: false,
    maxRequiredScale: 1,
  };
  for (const t of times) {
    const g = imageGeometry(clip, image, evaluateAnimation(clip, t));
    summary.needsOverscan ||= g.needsOverscan;
    summary.protectedContent ||= g.protectedContent;
    summary.clipped ||= g.clipped;
    summary.maxRequiredScale = Math.max(
      summary.maxRequiredScale,
      g.overscanScale,
    );
  }
  return summary;
}
