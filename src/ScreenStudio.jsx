import React, { useEffect, useRef, useState } from "react";
import { download } from "./engine";
import { LOGO_ALT, LOGO_SRC } from "./branding";
import "./screen-studio.css";
import "./screen-notice.css";
import "./screen-tabs.css";
import {
  DEFAULT_MOTION_DURATION,
  DEFAULT_OVERLAY_DURATION,
  DEFAULT_SCREEN_DURATION,
  defaultScreenDuration,
  maxScreenMotionDuration,
  resetScreenTiming,
  screenMotionDuration,
} from "./screen-timing";
import {
  createAnimation,
  evaluateAnimation,
  evaluateClip,
  normalizeCrop,
  normalizeAnimation,
  renderReelFrame,
  transitionState,
} from "./cinematic";
import {
  loadScreenDraft,
  saveScreenDraft,
  clearScreenDraft,
  draftSnapshot,
} from "./screen-draft";
import { SCREEN_EXPORT } from "./screen-export";
import { updateVideoTiming, videoTimingFromSource } from "./screen-video.js";
import PromptLibrary from "./PromptLibrary.jsx";
import { audioPlaybackPosition, audioShouldLoop } from "./audio-loop.js";
const DEFAULT_MAX_SCREENS = 30;
const DEFAULT_MAX_DURATION = 30;
const SCREEN_DRAG_TYPE = "application/x-screen-studio-screen";
const isScreenDrag = (dataTransfer) =>
  Array.from(dataTransfer.types).includes(SCREEN_DRAG_TYPE);
const clampDraftSetting = (value, fallback, min, max) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
const requiredDraftDuration = (screens, audioStart = 0) =>
  Math.max(
    0.1,
    Number.isFinite(audioStart) ? audioStart : 0,
    ...screens.map((screen) => screen.end || 0),
  );
const makeScreen = (
  i,
  maxDuration = DEFAULT_MAX_DURATION,
  id = i + 1,
  screenDuration = DEFAULT_SCREEN_DURATION,
  entry = "None",
  exit = "None",
) => {
  const start = Math.min(
    i * screenDuration,
    Math.max(0, maxDuration - 0.1),
  );
  return {
    id,
    start,
    end: Math.min(start + screenDuration, maxDuration),
    entry,
    exit,
    transition: 0.7,
    fit: "cover",
    fitBackground: { mode: "blur", color: "#292630", blur: 18 },
    animation: createAnimation("static"),
  };
};
function inferMediaType(file) {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return /\.(mp4|m4v|mov|webm|ogv|ogg)$/i.test(file.name) ? "video" : null;
}
function VideoTimelineField({ id, label, value, min, max, onChange }) {
  const [draft, setDraft] = useState(value.toFixed(1));
  useEffect(() => setDraft(value.toFixed(1)), [value]);

  function commit() {
    const parsed = Number(draft);
    if (!draft.trim() || !Number.isFinite(parsed)) {
      setDraft(value.toFixed(1));
      return;
    }
    const next = Math.min(max, Math.max(min, parsed));
    setDraft(next.toFixed(1));
    onChange(next);
  }

  return (
    <label className="screen-time-input">
      {label}
      <input
        aria-label={`Screen ${id} ${label.toLowerCase()} time`}
        type="number"
        min={min}
        max={max}
        step=".1"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
  );
}
function loadScreenVisual(src, mediaType) {
  if (mediaType !== "video") {
    const image = new Image();
    image.src = src;
    return image.decode().then(() => image);
  }
  const video = document.createElement("video");
  video.src = src;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  return new Promise((resolve, reject) => {
    video.onloadeddata = () => {
      video.width = video.videoWidth;
      video.height = video.videoHeight;
      resolve(video);
    };
    video.onerror = () => reject(Error("Could not read this video. Try MP4 or WebM."));
  });
}
function pointInPolygon(point, corners) {
  let inside = false;
  for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
    const a = corners[i];
    const b = corners[j];
    const crosses =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}
function transformedCorners(geometry) {
  const angle = (geometry.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [
    [-geometry.bw / 2, -geometry.bh / 2],
    [geometry.bw / 2, -geometry.bh / 2],
    [geometry.bw / 2, geometry.bh / 2],
    [-geometry.bw / 2, geometry.bh / 2],
  ].map(([x, y]) => ({
    x: geometry.x + geometry.scale * (x * cos - y * sin),
    y: geometry.y + geometry.scale * (x * sin + y * cos),
  }));
}
function customTransformFor(screen, media, time, options) {
  if (screen.fit === "custom" && screen.customTransform)
    return screen.customTransform;
  const geometry = evaluateClip(screen, media, time, options);
  const motion = evaluateAnimation(screen, time, options);
  const transition = transitionState(screen, time, options);
  const crop =
    screen.fit === "crop"
      ? normalizeCrop(screen.crop)
      : { x: 0, y: 0, width: 1, height: 1 };
  const sourceWidth = media.width * crop.width;
  const sourceHeight = media.height * crop.height;
  const base = Math.min(360 / sourceWidth, 640 / sourceHeight);
  const baseWidth = sourceWidth * base;
  const baseHeight = sourceHeight * base;
  const scale = Math.max(
    0.1,
    Math.min(
      8,
      (geometry.bw * geometry.scale) /
        (baseWidth * motion.scale * transition.scale),
    ),
  );
  const totalScale = motion.scale * scale;
  const animation = normalizeAnimation(screen.animation);
  const fx =
    (Math.max(0, Math.min(1, (animation.focal.x - crop.x) / crop.width)) - 0.5) *
    baseWidth;
  const fy =
    (Math.max(0, Math.min(1, (animation.focal.y - crop.y) / crop.height)) - 0.5) *
    baseHeight;
  return {
    scale,
    x:
      geometry.x -
      transition.x -
      (180 + motion.x * 3.6 - fx * (totalScale - 1)),
    y:
      geometry.y -
      transition.y -
      (320 + motion.y * 6.4 - fy * (totalScale - 1)),
  };
}
const styles = ["None", "Fade", "Slide left", "Slide right", "Slide up", "Slide down", "Zoom"];
export default function ScreenStudio() {
  const [activeTab, setActiveTab] = useState("Screen");
  const [selectedScreenId, setSelectedScreenId] = useState(null);
  const [canvasEditing, setCanvasEditing] = useState(false);
  const [expandedScreenFields, setExpandedScreenFields] = useState({});
  const [screens,setScreens]=useState(()=>[makeScreen(0)]),
    [maxScreens,setMaxScreens]=useState(DEFAULT_MAX_SCREENS),
    [maxScreensInput,setMaxScreensInput]=useState(String(DEFAULT_MAX_SCREENS)),
    [maxReelDuration,setMaxReelDuration]=useState(DEFAULT_MAX_DURATION),
    [maxReelDurationInput,setMaxReelDurationInput]=useState(String(DEFAULT_MAX_DURATION)),
    [time,setTime]=useState(0),
    [playing, setPlaying] = useState(false),
    [audioClips,setAudioClips]=useState([]),
    [previewingAudioId,setPreviewingAudioId]=useState(null),
    [audioPreviewPositions,setAudioPreviewPositions]=useState({}),
    [autoOverlap,setAutoOverlap]=useState(true),
    [maxScreenDuration,setMaxScreenDuration]=useState(DEFAULT_SCREEN_DURATION),
    [maxMotionDuration,setMaxMotionDuration]=useState(DEFAULT_MOTION_DURATION),
    [maxOverlayDuration,setMaxOverlayDuration]=useState(DEFAULT_OVERLAY_DURATION),
    [defaultEntry,setDefaultEntry]=useState("None"),
    [defaultExit,setDefaultExit]=useState("None"),
    [notice, setNotice] = useState(null),
    [exporting, setExporting] = useState(false),
    [exportStatus, setExportStatus] = useState(""),
    [result, setResult] = useState(null),
    [format,setFormat]=useState("mp4"),
    [draftReady, setDraftReady] = useState(false),
    [draftStatus, setDraftStatus] = useState("Loading draft…"),
    [draggedScreen, setDraggedScreen] = useState(null),
    [dropScreen, setDropScreen] = useState(null),
    [reducedMotion,setReducedMotion]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const saveQueue = useRef(Promise.resolve()),
    saveVersion = useRef(0);
  const skipNextDraftSave = useRef(false);
  const nextScreenId = useRef(2);
  const maxScreensValue = useRef(DEFAULT_MAX_SCREENS);
  const maxReelDurationValue = useRef(DEFAULT_MAX_DURATION);
  const previousDefaultScreenDuration = useRef(DEFAULT_SCREEN_DURATION);
  const calculatedDefaultScreenDuration = defaultScreenDuration(
    maxReelDuration,
    maxScreens,
  );
  const canvas=useRef(),images=useRef(new Map()),audioElements=useRef(new Map()),audioPreview=useRef(null),live=useRef(),urls=useRef(new Set()),canvasDrag=useRef(null);
  const nextAudioId=useRef(1);
  const duration=Math.max(1,...screens.filter(s=>s.src).map(s=>s.end));
  const requiredDuration=Math.max(0.1,...screens.map(s=>s.end||0),...audioClips.map((clip)=>clip.start||0));
  live.current={screens,time,duration,playing};
  function attachVideoRedraw(video) {
    const redraw = () => {
      requestAnimationFrame(() => {
        const ctx = canvas.current?.getContext("2d");
        if (ctx) {
          draw(ctx, live.current.time, live.current.screens, live.current.playing);
          drawSelection(ctx, live.current.time, live.current.screens);
        }
      });
    };
    video.onseeked = redraw;
    video.onloadeddata = redraw;
  }
  function notify(message, type = "info") {
    setNotice({ message, type });
  }
  function selectScreen(id) {
    const screen = screens.find((item) => item.id === id);
    if (!screen) return;
    setSelectedScreenId(id);
    setExpandedScreenFields((current) => ({ ...current, [id]: true }));
    setActiveTab("Screen");
    setTime((current) =>
      current < screen.start || current > screen.end ? screen.start : current,
    );
  }
  function setScreenFit(screen, fit) {
    if (fit !== "custom") {
      update(screen.id, { fit });
      return;
    }
    const media = images.current.get(screen.id);
    update(screen.id, {
      fit,
      customTransform: media
        ? customTransformFor(screen, media, time, { reducedMotion })
        : { scale: 1, x: 0, y: 0 },
      ...(screen.fit === "crop" ? { crop: screen.crop } : {}),
    });
  }
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 30000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (
      Math.abs(maxScreenDuration - previousDefaultScreenDuration.current) <
      1e-8
    ) {
      setMaxScreenDuration(calculatedDefaultScreenDuration);
    }
    previousDefaultScreenDuration.current = calculatedDefaultScreenDuration;
  }, [calculatedDefaultScreenDuration, maxScreenDuration]);
  function resetTiming() {
    if (!draftReady || exporting) return;
    try {
      const next = resetScreenTiming(screens, maxReelDuration, autoOverlap, {
        maxScreenDuration,
        maxMotionDuration,
        maxOverlayDuration,
        defaultEntry,
        defaultExit,
      });
      const durationAdjusted = next.map((screen) => {
        if (screen.mediaType !== "video") return screen;
        const trimIn = screen.trimIn || 0;
        const available = screen.sourceDuration - trimIn - (screen.trimOut || 0);
        const end = Math.min(maxReelDuration, screen.start + available);
        return {
          ...screen,
          end,
          trimOut:
            (screen.trimOut || 0) +
            Math.max(0, screen.start + available - end),
        };
      });
      setPlaying(false);
      setTime(0);
      setScreens(durationAdjusted);
      notify(
        autoOverlap
          ? `Timing and animation types reset within the ${maxReelDuration}s reel limit. Screens are capped at ${maxScreenDuration.toFixed(1)}s each with up to ${maxOverlayDuration.toFixed(1)}s overlap.`
          : `Timing and animation types reset without overlap within the ${maxReelDuration}s reel limit. Screens are capped at ${maxScreenDuration.toFixed(1)}s each.`,
        "success",
      );
    } catch (e) {
      notify(e.message, "error");
    }
  }
  function moveScreen(id, targetId) {
    if (!draftReady || exporting || id === targetId) return;
    setPlaying(false);
    setScreens((list) => {
      const from = list.findIndex((s) => s.id === id),
        to = list.findIndex((s) => s.id === targetId);
      if (from < 0 || to < 0) return list;
      const next = [...list];
      const [screen] = next.splice(from, 1);
      next.splice(to, 0, screen);
      return next;
    });
    setDraggedScreen(null);
    setDropScreen(null);
  }
  function removeScreen(id) {
    const screen = screens.find((item) => item.id === id);
    if (!screen || screens.length <= 1) return;
    if (!window.confirm(`Remove screen ${id} from this reel?`)) return;
    releaseScreenVisual(screen);
    setPlaying(false);
    setTime(0);
    setScreens((current) => current.filter((item) => item.id !== id));
  }
  function releaseScreenVisual(screen) {
    images.current.get(screen.id)?.pause?.();
    images.current.delete(screen.id);
    if (screen.src?.startsWith("blob:")) {
      URL.revokeObjectURL(screen.src);
      urls.current.delete(screen.src);
    }
  }
  const update = (id, change) => {
    setPlaying(false);
    setScreens((ss) =>
      ss.map((s) => {
        if (s.id !== id) return s;
        if (s.mediaType === "video" && Number.isFinite(s.sourceDuration)) {
          return {
            ...updateVideoTiming(s, change, maxReelDuration),
            ...(change.fit != null ? { fitManuallySet: true } : {}),
          };
        }
        const next = {
          ...s,
          ...change,
          ...(change.fit != null ? { fitManuallySet: true } : {}),
        };
        if (
          s.sourceDuration &&
          (change.start != null || change.end != null) &&
          change.trimIn == null &&
          change.trimOut == null
        ) {
          next.sourceDuration = Math.max(
            s.sourceDuration,
            next.end - next.start + (s.trimIn || 0),
          );
          next.trimOut = Math.max(
            0,
            next.sourceDuration - (next.end - next.start) - (s.trimIn || 0),
          );
        }
        return next;
      }),
    );
  };
  useEffect(
    () => () => {
      audioPreview.current?.pause();
      audioElements.current.forEach((element) => element.pause());
      urls.current.forEach((u) => URL.revokeObjectURL(u));
    },
    [],
  );
  useEffect(() => {
    let active = true;
    async function restore() {
      try {
        const draft = await loadScreenDraft();
        if (!active) return;
        if (draft) {
          const restored = await Promise.all(
            draft.screens.map(async (stored) => {
              const screen = {
                ...stored,
                mediaType: stored.mediaType || "image",
                fit:
                  stored.mediaType === "video" &&
                  !stored.fitManuallySet &&
                  stored.fit === "cover"
                    ? "contain"
                    : stored.fit || "cover",
                animation: normalizeAnimation(
                  stored.animation || createAnimation("static"),
                ),
              };
              if (!screen.file) return screen;
              const src = URL.createObjectURL(screen.file);
              urls.current.add(src);
              const visual = await loadScreenVisual(src, screen.mediaType);
              if (screen.mediaType === "video") attachVideoRedraw(visual);
              images.current.set(screen.id, visual);
              return {
                ...screen,
                src,
                sourceWidth: screen.sourceWidth ?? visual.videoWidth,
                sourceHeight: screen.sourceHeight ?? visual.videoHeight,
              };
            }),
          );
          if (!active) return;
          setScreens(restored);
          nextScreenId.current =
            Math.max(0, ...restored.map((screen) => screen.id)) + 1;
          const restoredAudioClips = draft.audioClips?.length
            ? draft.audioClips
            : draft.audio
              ? [{
                  ...draft.audio,
                  id: 1,
                  start: draft.audioStart ?? draft.audio.start ?? 0,
                  trimStart: draft.audio.trimStart ?? 0,
                  trimEnd: draft.audio.trimEnd ?? 0,
                  repeatToEnd: draft.audio.repeatToEnd ?? true,
                  volume: draft.volume ?? draft.audio.volume ?? 1,
                }]
              : [];
          const restoredAudioStart = Math.max(
            0,
            ...restoredAudioClips.map((clip) => clip.start || 0),
          );
          const restoredMaxDuration = Math.max(
            requiredDraftDuration(restored, restoredAudioStart),
            Number.isFinite(draft.maxReelDuration) && draft.maxReelDuration > 0
              ? draft.maxReelDuration
              : DEFAULT_MAX_DURATION,
          );
          const restoredMaxScreens = Math.max(
            restored.length,
            Number.isInteger(draft.maxScreens) && draft.maxScreens > 0
              ? draft.maxScreens
              : DEFAULT_MAX_SCREENS,
          );
          maxScreensValue.current = restoredMaxScreens;
          setMaxScreens(restoredMaxScreens);
          setMaxScreensInput(String(restoredMaxScreens));
          maxReelDurationValue.current = restoredMaxDuration;
          setMaxReelDuration(restoredMaxDuration);
          setMaxReelDurationInput(String(restoredMaxDuration));

          if(typeof draft.reducedMotion==='boolean')setReducedMotion(draft.reducedMotion);
          if(typeof draft.autoOverlap==='boolean')setAutoOverlap(draft.autoOverlap);
          setMaxScreenDuration(
            clampDraftSetting(
              draft.maxScreenDuration,
              DEFAULT_SCREEN_DURATION,
              0.1,
              10,
            ),
          );
          const restoredMaxMotionDuration = clampDraftSetting(
            draft.maxMotionDuration,
            DEFAULT_MOTION_DURATION,
            0,
            5,
          );
          setMaxMotionDuration(restoredMaxMotionDuration);
          setMaxOverlayDuration(
            clampDraftSetting(
              draft.maxOverlayDuration,
              Math.min(
                DEFAULT_OVERLAY_DURATION,
                restoredMaxMotionDuration,
              ),
              0,
              restoredMaxMotionDuration,
            ),
          );
          setDefaultEntry(
            styles.includes(draft.defaultEntry) ? draft.defaultEntry : "None",
          );
          setDefaultExit(
            styles.includes(draft.defaultExit) ? draft.defaultExit : "None",
          );
          let missingAudioTracks = 0;
          const audioWithUrls = restoredAudioClips.flatMap((clip, index) => {
            const duration = Number(clip.duration);
            if (!clip.file || !Number.isFinite(duration) || duration <= 0) {
              missingAudioTracks += 1;
              return [];
            }
            const id = Number.isInteger(clip.id) ? clip.id : index + 1;
            nextAudioId.current = Math.max(nextAudioId.current, id + 1);
            const src = URL.createObjectURL(clip.file);
            urls.current.add(src);
            const maxTrim = Math.max(0, duration - 0.1);
            const trimStart = Math.min(
              maxTrim,
              Math.max(0, Number(clip.trimStart) || 0),
            );
            const trimEnd = Math.min(
              Math.max(0, maxTrim - trimStart),
              Math.max(0, Number(clip.trimEnd) || 0),
            );
            return [{
              ...clip,
              id,
              src,
              name: clip.name || clip.file.name,
              duration,
              start: clampDraftSetting(clip.start, 0, 0, restoredMaxDuration),
              trimStart,
              trimEnd,
              repeatToEnd: clip.repeatToEnd ?? false,
              volume: clampDraftSetting(clip.volume, 1, 0, 1),
            }];
          });
          setAudioClips(audioWithUrls);
          setFormat(draft.format||'mp4');
          notify(
            missingAudioTracks
              ? `${missingAudioTracks} saved audio track(s) could not be restored. Upload those files again.`
              : "Your saved reel draft has been restored.",
            missingAudioTracks ? "error" : "success",
          );
        }
        setDraftReady(true);
      } catch {
        setDraftStatus("Draft could not be restored.");
        notify(
          "Could not open the local draft. Reload to retry, or clear the draft to start again.",
          "error",
        );
      }
    }
    restore();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!draftReady || canvasEditing) return;
    if (skipNextDraftSave.current) {
      skipNextDraftSave.current = false;
      return;
    }
    const version = ++saveVersion.current;
    const snapshot=draftSnapshot({
      screens,
      audioClips,
      format,
      reducedMotion,
      autoOverlap,
      maxScreens,
      maxReelDuration,
      maxScreenDuration,
      maxMotionDuration,
      maxOverlayDuration,
      defaultEntry,
      defaultExit,
    });
    setDraftStatus("Saving draft…");
    saveQueue.current = saveQueue.current
      .catch(() => {})
      .then(() => saveScreenDraft(snapshot));
    saveQueue.current.then(
      () => {
        if (saveVersion.current === version)
          setDraftStatus("Draft saved on this device");
      },
      () => {
        if (saveVersion.current === version)
          setDraftStatus("Draft save failed — device storage may be full");
      },
    );
  }, [draftReady,canvasEditing,screens,audioClips,format,reducedMotion,autoOverlap,maxScreens,maxReelDuration,maxScreenDuration,maxMotionDuration,maxOverlayDuration,defaultEntry,defaultExit]);
  async function discardDraft() {
    if (!window.confirm("Clear this draft and all uploaded screens and audio?"))
      return;
    setPlaying(false);
    try {
      saveVersion.current += 1;
      await saveQueue.current.catch(() => {});
      await clearScreenDraft();
      skipNextDraftSave.current = true;
      images.current.clear();
      audioClips.forEach((clip) => {
        if (clip.src?.startsWith("blob:")) {
          URL.revokeObjectURL(clip.src);
          urls.current.delete(clip.src);
        }
      });
      setScreens([makeScreen(0)]);
      setExpandedScreenFields({});
      nextScreenId.current = 2;

      audioPreview.current?.pause();
      audioPreview.current = null;
      audioElements.current.forEach((element) => element.pause());
      audioElements.current.clear();
      setAudioClips([]);
      setPreviewingAudioId(null);
      setAudioPreviewPositions({});
      nextAudioId.current = 1;
      setFormat("mp4");
      setReducedMotion(
        window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      );
      setAutoOverlap(true);
      setMaxScreenDuration(DEFAULT_SCREEN_DURATION);
      previousDefaultScreenDuration.current = DEFAULT_SCREEN_DURATION;
      setMaxMotionDuration(DEFAULT_MOTION_DURATION);
      setMaxOverlayDuration(DEFAULT_OVERLAY_DURATION);
      setDefaultEntry("None");
      setDefaultExit("None");
      maxScreensValue.current = DEFAULT_MAX_SCREENS;
      setMaxScreens(DEFAULT_MAX_SCREENS);
      setMaxScreensInput(String(DEFAULT_MAX_SCREENS));
      maxReelDurationValue.current = DEFAULT_MAX_DURATION;
      setMaxReelDuration(DEFAULT_MAX_DURATION);
      setMaxReelDurationInput(String(DEFAULT_MAX_DURATION));
      setTime(0);
      setResult(null);
      setDraftReady(true);
      setDraftStatus("Draft cleared on this device");
      notify("Draft cleared. You can start a new reel.", "success");
    } catch {
      notify("Could not clear the draft. Please try again.", "error");
    }
  }

  function draw(ctx, t, list, playVideos = playing) {
    list.forEach((screen) => {
      if (screen.mediaType !== "video") return;
      const video = images.current.get(screen.id);
      if (!(video instanceof HTMLVideoElement)) return;
      const isActive = t >= screen.start && t < screen.end;
      const sourceTime = Math.min(
        screen.sourceDuration - (screen.trimOut || 0),
        (screen.trimIn || 0) + Math.max(0, t - screen.start),
      );
      if (playVideos && isActive) {
        if (video.paused) {
          if (Math.abs(video.currentTime - sourceTime) > 0.12)
            video.currentTime = sourceTime;
          video.play().catch(() => {
            setPlaying(false);
            notify(`Could not play video ${screen.name}. Please replace the file.`, "error");
          });
        } else if (Math.abs(video.currentTime - sourceTime) > 0.4) {
          video.currentTime = sourceTime;
        }
      } else {
        video.pause();
        if (Math.abs(video.currentTime - sourceTime) > 0.04)
          video.currentTime = sourceTime;
      }
    });
    const motionLimitedScreens = list.map((screen) => ({
      ...screen,
      transition: screenMotionDuration(screen, maxMotionDuration),
    }));
    return renderReelFrame(
      ctx,
      motionLimitedScreens,
      images.current,
      t,
      { reducedMotion },
    );
  }
  function drawSelection(ctx, t, list) {
    const selected = list.find((screen) => screen.id === selectedScreenId);
    const media = selected && images.current.get(selected.id);
    if (
      !selected?.src ||
      !media ||
      t < selected.start ||
      t > selected.end ||
      (media.videoWidth && media.readyState < 2)
    )
      return;
    const geometry = evaluateClip(
      { ...selected, transition: screenMotionDuration(selected, maxMotionDuration) },
      media,
      t,
      { reducedMotion },
    );
    const corners = transformedCorners(geometry);
    ctx.save();
    ctx.beginPath();
    corners.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.closePath();
    ctx.strokeStyle = "#e4c9ff";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    const handle = corners[2];
    ctx.beginPath();
    ctx.arc(handle.x, handle.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = "#9c79c3";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
  function canvasPoint(event) {
    const rect = canvas.current.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * 360,
      y: ((event.clientY - rect.top) / rect.height) * 640,
    };
  }
  function onCanvasPointerDown(event) {
    if (exporting || !draftReady) return;
    const point = canvasPoint(event);
    const selected = screens.find((screen) => screen.id === selectedScreenId);
    const selectedMedia = selected && images.current.get(selected.id);
    const selectedGeometry =
      selectedMedia && time >= selected.start && time <= selected.end
        ? evaluateClip(
            { ...selected, transition: screenMotionDuration(selected, maxMotionDuration) },
            selectedMedia,
            time,
            { reducedMotion },
          )
        : null;
    const resizeHandle = selectedGeometry
      ? transformedCorners(selectedGeometry)[2]
      : null;
    let hit = null;
    let mode = "move";
    if (
      resizeHandle &&
      Math.hypot(point.x - resizeHandle.x, point.y - resizeHandle.y) <= 14
    ) {
      hit = selected;
      mode = "resize";
    } else {
      for (const screen of [...screens].reverse()) {
        const media = images.current.get(screen.id);
        if (!screen.src || !media || time < screen.start || time > screen.end)
          continue;
        const geometry = evaluateClip(
          { ...screen, transition: screenMotionDuration(screen, maxMotionDuration) },
          media,
          time,
          { reducedMotion },
        );
        if (pointInPolygon(point, transformedCorners(geometry))) {
          hit = screen;
          break;
        }
      }
    }
    if (!hit) {
      hit =
        [...screens].reverse().find(
          (screen) =>
            screen.src && time >= screen.start && time <= screen.end,
        ) || null;
    }
    if (!hit) {
      setSelectedScreenId(null);
      return;
    }
    setPlaying(false);
    selectScreen(hit.id);
    const media = images.current.get(hit.id);
    const geometry = evaluateClip(
      { ...hit, transition: screenMotionDuration(hit, maxMotionDuration) },
      media,
      time,
      { reducedMotion },
    );
    canvasDrag.current = {
      id: hit.id,
      mode,
      pointerId: event.pointerId,
      start: point,
      center: { x: geometry.x, y: geometry.y },
      initialDistance: Math.max(1, Math.hypot(point.x - geometry.x, point.y - geometry.y)),
      transform: customTransformFor(hit, media, time, { reducedMotion }),
      moved: false,
    };
    if (event.isTrusted) canvas.current.setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  function onCanvasPointerMove(event) {
    const drag = canvasDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = canvasPoint(event);
    const dx = point.x - drag.start.x;
    const dy = point.y - drag.start.y;
    if (!drag.moved && Math.hypot(dx, dy) < 2) return;
    drag.moved = true;
    setCanvasEditing(true);
    setPlaying(false);
    setScreens((current) =>
      current.map((screen) => {
        if (screen.id !== drag.id) return screen;
        if (drag.mode === "resize") {
          const distance = Math.max(
            1,
            Math.hypot(point.x - drag.center.x, point.y - drag.center.y),
          );
          return {
            ...screen,
            fit: "custom",
            fitManuallySet: true,
            ...(screen.fit === "crop" ? { crop: screen.crop } : {}),
            customTransform: {
              ...drag.transform,
              scale: Math.max(
                0.1,
                Math.min(8, drag.transform.scale * (distance / drag.initialDistance)),
              ),
            },
          };
        }
        return {
          ...screen,
          fit: "custom",
          fitManuallySet: true,
          ...(screen.fit === "crop" ? { crop: screen.crop } : {}),
          customTransform: {
            ...drag.transform,
            x: drag.transform.x + dx,
            y: drag.transform.y + dy,
          },
        };
      }),
    );
  }
  function onCanvasPointerUp(event) {
    if (canvasDrag.current?.pointerId !== event.pointerId) return;
    canvasDrag.current = null;
    setCanvasEditing(false);
  }
  function onCanvasKeyDown(event) {
    if (!selectedScreenId || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key))
      return;
    if (!images.current.get(selectedScreenId)) return;
    event.preventDefault();
    const distance = event.shiftKey ? 0.05 : 2;
    setScreens((current) =>
      current.map((screen) => {
        if (screen.id !== selectedScreenId) return screen;
        const transform = screen.customTransform || { scale: 1, x: 0, y: 0 };
        const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
        const customTransform =
          screen.fit === "custom"
            ? transform
            : customTransformFor(
                screen,
                images.current.get(screen.id),
                time,
                { reducedMotion },
              );
        if (event.shiftKey) {
          return {
            ...screen,
            fit: "custom",
            fitManuallySet: true,
            ...(screen.fit === "crop" ? { crop: screen.crop } : {}),
            customTransform: {
              ...customTransform,
              scale: Math.max(0.1, Math.min(8, customTransform.scale + direction * distance)),
            },
          };
        }
        return {
          ...screen,
          fit: "custom",
          fitManuallySet: true,
          ...(screen.fit === "crop" ? { crop: screen.crop } : {}),
          customTransform: {
            ...customTransform,
            x: customTransform.x + (event.key === "ArrowLeft" ? -distance : event.key === "ArrowRight" ? distance : 0),
            y: customTransform.y + (event.key === "ArrowUp" ? -distance : event.key === "ArrowDown" ? distance : 0),
          },
        };
      }),
    );
  }
  useEffect(() => {
    const ctx = canvas.current.getContext("2d");
    draw(ctx, time, screens);
    drawSelection(ctx, time, screens);
  }, [time, screens, playing, reducedMotion, maxMotionDuration, selectedScreenId]);
  useEffect(()=>{
    if(!playing)return;const start=performance.now()-time*1000;let raf;
    function tick(){const t=Math.min(live.current.duration,(performance.now()-start)/1000);setTime(Math.min(live.current.duration,Math.floor(t*30)/30));if(t>=live.current.duration)setPlaying(false);else raf=requestAnimationFrame(tick)}
    raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf)
  },[playing]);
  useEffect(()=>{
    audioClips.forEach((clip) => {
      const el = audioElements.current.get(clip.id);
      if (!el) return;
      el.volume = clip.volume ?? 1;
      el.loop =
        (clip.trimStart ?? 0) === 0 &&
        (clip.trimEnd ?? 0) === 0 &&
        audioShouldLoop(
          clip.duration,
          duration,
          clip.start,
          0,
          0,
          clip.repeatToEnd,
        );
      const position = audioPlaybackPosition(
        time,
        clip.start,
        clip.duration,
        clip.trimStart ?? 0,
        clip.trimEnd ?? 0,
        clip.repeatToEnd,
      );
      if (playing && position !== null && time < duration) {
        if (el.paused || Math.abs(el.currentTime - position) > .25) {
          el.currentTime = position;
          el.play().catch(() => {
            setPlaying(false);
            notify(`Audio playback failed for ${clip.name}. Please replace the file.`, "error");
          });
        }
      } else {
        el.pause();
      }
    });
  },[playing,time,audioClips,duration]);
  async function upload(file, id, targetOverride) {
    if (!file) return;
    const mediaType = inferMediaType(file);
    if (!mediaType) {
      notify("Choose an image or video file.", "error");
      return;
    }
    const url = URL.createObjectURL(file);
    urls.current.add(url);
    try {
      const target =
        targetOverride || live.current.screens.find((s) => s.id === id);
      if (!target) throw Error("This screen is no longer available. Add a screen and try again.");
      const visual = await loadScreenVisual(url, mediaType);
      const mediaDetails =
        mediaType === "video"
          ? {
              ...videoTimingFromSource(
                target.start,
                visual.duration,
                maxReelDuration,
              ),
              mediaType,
              sourceWidth: visual.videoWidth,
              sourceHeight: visual.videoHeight,
              fit: target.mediaType === "video" ? target.fit : "contain",
            }
          : {
              mediaType,
              sourceDuration: undefined,
              trimIn: undefined,
              trimOut: undefined,
              sourceWidth: undefined,
              sourceHeight: undefined,
            };
      if (mediaType === "video") attachVideoRedraw(visual);
      releaseScreenVisual(target);
      images.current.set(id, visual);
      setPlaying(false);
      setScreens((current) =>
        current.map((screen) =>
          screen.id === id
            ? {
                ...screen,
                ...mediaDetails,
                src: url,
                file,
                name: file.name,
              }
            : screen,
        ),
      );
      setTime(mediaDetails.start ?? target.start);
      notify(
        mediaType === "video"
          ? `Video added. Its ${visual.duration.toFixed(1)}s duration set the screen timing; trim it to fit the reel if needed.`
          : "Image uploaded. Its existing screen timing is unchanged.",
        "success",
      );
    } catch (e) {
      URL.revokeObjectURL(url);
      urls.current.delete(url);
      notify(e.message, "error");
    }
  }
  function addAudio(file) {
    if (!file) return;
    if (file.type && !file.type.startsWith("audio/")) {
      notify("Choose an audio file.", "error");
      return;
    }
    const url = URL.createObjectURL(file);
    urls.current.add(url);
    const probe = new Audio(url);
    probe.onloadedmetadata = () => {
      if (!Number.isFinite(probe.duration) || probe.duration <= 0) {
        URL.revokeObjectURL(url);
        urls.current.delete(url);
        notify(`Could not read the duration of ${file.name}. Try MP3 or WAV.`, "error");
        return;
      }
      const id = nextAudioId.current++;
      probe.onloadedmetadata = null;
      probe.onerror = null;
      setAudioClips((clips) => [
        ...clips,
        {
          id,
          src: url,
          file,
          name: file.name,
          duration: probe.duration,
          start: 0,
          trimStart: 0,
          trimEnd: 0,
          repeatToEnd: true,
          volume: 1,
        },
      ]);
      setPlaying(false);
      notify(`${file.name} added as an audio track.`, "success");
    };
    probe.onerror = () => {
      URL.revokeObjectURL(url);
      urls.current.delete(url);
      notify(`Could not read ${file.name}. Try MP3 or WAV.`, "error");
    };
    probe.preload = "metadata";
  }
  function updateAudioClip(id, changes) {
    setAudioClips((clips) =>
      clips.map((clip) => {
        if (clip.id !== id) return clip;
        const next = { ...clip, ...changes };
        const maxTrim = Math.max(0, clip.duration - 0.1);
        next.trimStart = Math.min(maxTrim, Math.max(0, Number(next.trimStart) || 0));
        next.trimEnd = Math.min(
          Math.max(0, maxTrim - next.trimStart),
          Math.max(0, Number(next.trimEnd) || 0),
        );
        next.start = Math.max(0, Math.min(maxReelDuration, Number(next.start) || 0));
        next.volume = Math.max(0, Math.min(1, Number(next.volume) || 0));
        return next;
      }),
    );
    if (
      previewingAudioId === id &&
      (changes.trimStart !== undefined || changes.trimEnd !== undefined)
    ) {
      const preview = audioPreview.current;
      const start = changes.trimStart ?? clip.trimStart ?? 0;
      const end = clip.duration - (changes.trimEnd ?? clip.trimEnd ?? 0);
      const position = Math.min(end, Math.max(start, preview?.currentTime ?? start));
      preview?.pause();
      audioPreview.current = null;
      setPreviewingAudioId(null);
      setAudioPreviewPositions((positions) => ({ ...positions, [id]: position }));
    }
    if (previewingAudioId === id && changes.volume !== undefined) {
      if (audioPreview.current) {
        audioPreview.current.volume = Math.max(0, Math.min(1, changes.volume));
      }
    }
  }
  function removeAudioClip(clip) {
    if (previewingAudioId === clip.id) {
      audioPreview.current?.pause();
      audioPreview.current = null;
      setPreviewingAudioId(null);
    }
    audioElements.current.get(clip.id)?.pause();
    audioElements.current.delete(clip.id);
    if (clip.src?.startsWith("blob:")) {
      URL.revokeObjectURL(clip.src);
      urls.current.delete(clip.src);
    }
    setAudioPreviewPositions((positions) => {
      const next = { ...positions };
      delete next[clip.id];
      return next;
    });
    setPlaying(false);
    setAudioClips((clips) => clips.filter((item) => item.id !== clip.id));
  }
  async function toggleAudioPreview(clip) {
    if (previewingAudioId === clip.id) {
      audioPreview.current?.pause();
      audioPreview.current = null;
      setPreviewingAudioId(null);
      return;
    }
    audioPreview.current?.pause();
    const preview = new Audio(clip.src);
    audioPreview.current = preview;
    preview.volume = clip.volume ?? 1;
    preview.onloadedmetadata = async () => {
      if (audioPreview.current !== preview) return;
      const end = clip.duration - (clip.trimEnd ?? 0);
      const savedPosition = audioPreviewPositions[clip.id] ?? clip.trimStart ?? 0;
      const position = Math.min(end, Math.max(clip.trimStart ?? 0, savedPosition));
      preview.currentTime = position;
      setAudioPreviewPositions((positions) => ({ ...positions, [clip.id]: position }));
      try {
        await preview.play();
        setPreviewingAudioId(clip.id);
      } catch {
        if (audioPreview.current !== preview) return;
        setPreviewingAudioId(null);
        notify(`Could not play ${clip.name}. Try replacing the audio file.`, "error");
      }
    };
    preview.ontimeupdate = () => {
      if (audioPreview.current !== preview) return;
      const end = clip.duration - (clip.trimEnd ?? 0);
      if (preview.currentTime >= end) {
        preview.pause();
        audioPreview.current = null;
        setPreviewingAudioId(null);
        setAudioPreviewPositions((positions) => ({ ...positions, [clip.id]: clip.trimStart ?? 0 }));
      } else {
        setAudioPreviewPositions((positions) => ({ ...positions, [clip.id]: preview.currentTime }));
      }
    };
    preview.onerror = () => {
      if (audioPreview.current !== preview) return;
      setPreviewingAudioId(null);
      notify(`Could not play ${clip.name}. Try replacing the audio file.`, "error");
    };
    setPlaying(false);
    setPreviewingAudioId(clip.id);
  }
  function seekAudioPreview(clip, value) {
    const end = clip.duration - (clip.trimEnd ?? 0);
    const position = Math.min(end, Math.max(clip.trimStart ?? 0, value));
    setAudioPreviewPositions((positions) => ({ ...positions, [clip.id]: position }));
    if (audioPreview.current && previewingAudioId === clip.id) {
      audioPreview.current.currentTime = position;
    }
  }
  async function exportVideo() {
    setPlaying(false);
    audioPreview.current?.pause();
    audioPreview.current = null;
    setPreviewingAudioId(null);
    setExporting(true);
    setTime(0);
    let stream, ctx, sources = [], silence, rec;
    try {
      if (format === "mp4") {
        const { renderScreenMp4 } = await import("./screen-offline-export");
        const blob = await renderScreenMp4({
          screens: screens.map((screen) => ({
            ...screen,
            transition: screenMotionDuration(screen, maxMotionDuration),
          })),
          images: images.current,
          duration,
          audioClips,
          reducedMotion,
          onProgress: setExportStatus,
        });
        const url = URL.createObjectURL(blob);
        urls.current.add(url);
        setResult({ url, format });
        download(blob, "shomshar-screens.mp4");
        notify("MP4 ready. Use Download MP4 if the download did not start.", "success");
        return;
      }
      setExportStatus("Preparing video…");
      const mime = ["video/webm;codecs=vp8,opus", "video/webm"].find((type) =>
        globalThis.MediaRecorder?.isTypeSupported(type),
      );
      if (!mime) throw Error("Video recording is unavailable in this browser.");
      const out = document.createElement("canvas");
      out.width = SCREEN_EXPORT.width;
      out.height = SCREEN_EXPORT.height;
      const c = out.getContext("2d");
      const render = (t) => {
        c.save();
        c.scale(SCREEN_EXPORT.width / 360, SCREEN_EXPORT.height / 640);
        draw(c, t, screens, true);
        c.restore();
        stream?.getVideoTracks()[0]?.requestFrame?.();
      };
      render(0);
      stream = out.captureStream(SCREEN_EXPORT.fps);
      ctx = new AudioContext({ sampleRate: 48000 });
      await ctx.resume();
      const dest = ctx.createMediaStreamDestination();
      silence = ctx.createConstantSource();
      silence.offset.value = 0;
      silence.connect(dest);
      silence.start();
      for (const clip of audioClips) {
        if (clip.start >= duration) continue;
        const response = await fetch(clip.src);
        if (!response.ok) throw Error(`Could not read the audio track ${clip.name}.`);
        const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
        const trimStart = clip.trimStart ?? 0;
        const trimEnd = clip.trimEnd ?? 0;
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        source.buffer = buffer;
        source.loop = audioShouldLoop(
          buffer.duration,
          duration,
          clip.start,
          trimStart,
          trimEnd,
          clip.repeatToEnd,
        );
        source.loopStart = trimStart;
        source.loopEnd = buffer.duration - trimEnd;
        gain.gain.value = clip.volume ?? 1;
        source.connect(gain);
        gain.connect(dest);
        sources.push({ source, clip, trimStart });
      }
      dest.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
      const chunks = [];
      rec = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: SCREEN_EXPORT.videoBitsPerSecond,
        audioBitsPerSecond: SCREEN_EXPORT.audioBitsPerSecond,
      });
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      const done = new Promise((resolve, reject) => {
        rec.onstop = resolve;
        rec.onerror = () => reject(Error("Video recording failed."));
      });
      const start = ctx.currentTime;
      rec.start(250);
      sources.forEach(({ source, clip, trimStart }) => {
        const remaining = duration - clip.start;
        const playable = source.buffer.duration - trimStart - (clip.trimEnd ?? 0);
        source.start(
          start + clip.start,
          trimStart,
          source.loop ? remaining : Math.min(remaining, playable),
        );
      });
      await new Promise((resolve) => {
        function frame() {
          const t = Math.min(duration, ctx.currentTime - start);
          render(t);
          setTime(t);
          setExportStatus(`Rendering… ${Math.round((t / duration) * 100)}%`);
          if (t < duration) requestAnimationFrame(frame);
          else resolve();
        }
        frame();
      });
      rec.stop();
      await done;
      let blob = new Blob(chunks, { type: mime });
      if (!blob.size)
        throw Error("Video recording was empty. Please try again.");
      const url = URL.createObjectURL(blob);
      urls.current.add(url);
      setResult({ url, format });
      download(blob, `shomshar-screens.${format}`);
      notify(
        `${format.toUpperCase()} ready. Use the download link if the download did not start.`,
        "success",
      );
    } catch (e) {
      notify(e.message, "error");
    } finally {
      if (rec?.state === "recording") rec.stop();
      try {
        sources.forEach(({ source }) => source.stop());
        silence?.stop();
      } catch {}
      stream?.getTracks().forEach((t) => t.stop());
      await ctx?.close();
      setExporting(false);
    }
  }
  return (
    <div className="screen-studio">
      <header>
        <a className="brand" href="/" aria-label="Shomshar Animation Studio home">
          <img
            className="brand-logo"
            src={LOGO_SRC}
            alt={LOGO_ALT}
            width="2172"
            height="724"
          />
        </a>
        <button
          className="primary"
          disabled={!draftReady || exporting || !screens.some((s) => s.src)}
          onClick={exportVideo}
        >
          {exporting ? exportStatus : "Export video with audio"}
        </button>
      </header>
      <div
        className={`screen-layout${activeTab === "Prompts" ? " screen-layout-prompts" : ""}`}
      >
        <section className="screen-editor">
          <div className="screen-tabs" role="tablist" aria-label="Editor sections">
            {["Screen", "Audio", "Settings", "Timeline", "Prompts"].map((tab, index, tabs) => (
              <button
                key={tab}
                id={`screen-tab-${tab.toLowerCase()}`}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                aria-controls={`screen-panel-${tab.toLowerCase()}`}
                tabIndex={activeTab === tab ? 0 : -1}
                onClick={() => setActiveTab(tab)}
                onKeyDown={(event) => {
                  const direction =
                    event.key === "ArrowRight"
                      ? 1
                      : event.key === "ArrowLeft"
                        ? -1
                        : 0;
                  if (!direction) return;
                  event.preventDefault();
                  const next = (index + direction + tabs.length) % tabs.length;
                  setActiveTab(tabs[next]);
                  event.currentTarget.parentElement
                    ?.querySelectorAll('[role="tab"]')
                    [next]?.focus();
                }}
              >
                {tab}
              </button>
            ))}
          </div>
          <section
            id="screen-panel-screen"
            className="screen-tab-panel"
            role="tabpanel"
            aria-labelledby="screen-tab-screen"
            tabIndex={0}
            hidden={activeTab !== "Screen"}
          >
          <div className="screen-intro"><span className="eyebrow">IMAGE & VIDEO TO REEL</span><h1>Your screens. Your timeline.</h1><button
                className="primary"
                  disabled={!draftReady || exporting || screens.length >= maxScreens}
                  onClick={() => {
                    if (screens.length >= maxScreens) return;
                    setPlaying(false);
                    setScreens((current) => [
                      ...current,
                      makeScreen(
                        current.length,
                        maxReelDuration,
                        nextScreenId.current++,
                        maxScreenDuration,
                        defaultEntry,
                        defaultExit,
                      ),
                    ]);
                  }}
                >
                  Add screen ({screens.length}/{maxScreens})
              </button>{" "}
              <label className="screen-upload">
                Upload images or videos
                <input
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  disabled={!draftReady || exporting}
                  onChange={(e) => {
                    const selectedFiles = Array.from(e.target.files);
                    const files = selectedFiles.slice(0, maxScreens);
                    setPlaying(false);
                    const next = [...screens];
                    while (next.length < files.length) {
                      next.push(
                        makeScreen(
                          next.length,
                          maxReelDuration,
                          nextScreenId.current++,
                          maxScreenDuration,
                          defaultEntry,
                          defaultExit,
                        ),
                      );
                    }
                    const targetIds = next
                      .slice(0, files.length)
                      .map((screen) => screen.id);
                    setScreens(next);
                    files.forEach((file, index) =>
                      upload(file, targetIds[index], next[index]),
                    );
                    if (selectedFiles.length > files.length) {
                      notify(
                        `Only the first ${maxScreens} files were selected to match the screen limit.`,
                        "info",
                      );
                    }
                    e.target.value = "";
                  }}
                />
              </label>
              </div>
          <fieldset disabled={!draftReady || exporting}>
            <legend>Screen layers · images keep their timing; video duration sets its timing · drag to reorder</legend>
            {screens.map((s, position) => (
              <article
                className={
                  "screen-row" +
                  (selectedScreenId === s.id ? " screen-row-selected" : "") +
                  (draggedScreen === s.id ? " screen-dragging" : "") +
                  (dropScreen === s.id ? " screen-drop-target" : "")
                }
                key={s.id}
                onDragStart={(e) => {
                  if (!e.target.closest(".screen-drag-handle")) {
                    e.preventDefault();
                  }
                }}
                onDragOver={(e) => {
                  if (
                    draggedScreen === null ||
                    exporting ||
                    !isScreenDrag(e.dataTransfer)
                  ) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDropScreen(s.id);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!isScreenDrag(e.dataTransfer)) return;
                  if (draggedScreen !== null) moveScreen(draggedScreen, s.id);
                }}
              >
                <div className="screen-sort-controls">
                  <button
                    type="button"
                    className="screen-drag-handle"
                    draggable={draftReady && !exporting}
                    aria-label={`Drag screen ${s.id} to reorder`}
                    title="Drag to reorder"
                    onDragStart={(e) => {
                      setDraggedScreen(s.id);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData(SCREEN_DRAG_TYPE, String(s.id));
                    }}
                    onDragEnd={() => {
                      setDraggedScreen(null);
                      setDropScreen(null);
                    }}
                  >
                    ⠿
                  </button>
                  <button
                    type="button"
                    disabled={position === 0}
                    aria-label={`Move screen ${s.id} up`}
                    onClick={() => moveScreen(s.id, screens[position - 1].id)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={position === screens.length - 1}
                    aria-label={`Move screen ${s.id} down`}
                    onClick={() => moveScreen(s.id, screens[position + 1].id)}
                  >
                    ↓
                  </button>
                </div>
                <label className="screen-thumb">
                  {s.src ? (
                    s.mediaType === "video" ? (
                      <video
                        src={s.src}
                        muted
                        playsInline
                        preload="metadata"
                        aria-hidden="true"
                        tabIndex={-1}
                      />
                    ) : (
                      <img src={s.src} alt={`Screen ${s.id}`} />
                    )
                  ) : (
                    <span>+ Upload</span>
                  )}
                  <input
                    aria-label={`Upload image or video for screen ${s.id}`}
                    type="file"
                    accept="image/*,video/*"
                    onChange={(e) => {
                      upload(e.target.files[0], s.id);
                      e.target.value = "";
                    }}
                  />
                </label>
                <div className="screen-fields">
                  <div className="screen-fields-header">
                    <strong>
                      Screen {s.id}{" "}
                      <button
                        type="button"
                        className="screen-select-preview"
                        draggable={false}
                        aria-pressed={selectedScreenId === s.id}
                        onClick={() => selectScreen(s.id)}
                      >
                        {selectedScreenId === s.id ? "Selected" : "Select preview"}
                      </button>{" "}
                      <small>
                        {s.name
                          ? `${s.mediaType === "video" ? `Video${s.sourceWidth && s.sourceHeight ? ` · ${s.sourceWidth} × ${s.sourceHeight}px` : ""}` : "Image"} · ${s.name}`
                          : "No media uploaded"}
                      </small>
                    </strong>
                    <button
                      type="button"
                      className="screen-fields-toggle"
                      aria-label={`Show or hide settings for screen ${s.id}`}
                      aria-expanded={Boolean(expandedScreenFields[s.id])}
                      aria-controls={`screen-extra-fields-${s.id}`}
                      onClick={() =>
                        setExpandedScreenFields((current) => ({
                          ...current,
                          [s.id]: !current[s.id],
                        }))
                      }
                    >
                      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                        <path d="m6 3 5 5-5 5" />
                      </svg>
                    </button>
                  </div>
                  <fieldset className="screen-control-group screen-time-group">
                    <legend>
                      {s.mediaType === "video"
                        ? "Timeline · reel seconds"
                        : "Timeline"}
                    </legend>
                    <div className="screen-time-values">
                      {s.mediaType === "video" ? (
                        <>
                          <VideoTimelineField
                            id={s.id}
                            label="Start"
                            value={s.start}
                            min={0}
                            max={Math.max(0, maxReelDuration - 0.1)}
                            onChange={(start) => update(s.id, { start })}
                          />
                          <VideoTimelineField
                            id={s.id}
                            label="End"
                            value={s.end}
                            min={s.start + 0.1}
                            max={Math.min(
                              maxReelDuration,
                              s.start + s.sourceDuration - (s.trimIn || 0),
                            )}
                            onChange={(end) => update(s.id, { end })}
                          />
                        </>
                      ) : (
                        <>
                          <span>
                            Start <output>{s.start.toFixed(1)}s</output>
                          </span>
                          <span>
                            End <output>{s.end.toFixed(1)}s</output>
                          </span>
                        </>
                      )}
                    </div>
                    <div
                      className="screen-dual-range"
                      style={{
                        "--range-start": `${(s.start / maxReelDuration) * 100}%`,
                        "--range-end": `${(s.end / maxReelDuration) * 100}%`,
                      }}
                    >
                      <input
                        aria-label={`Screen ${s.id} start`}
                        type="range"
                        min="0"
                        max={
                          s.mediaType === "video"
                            ? Math.max(0, maxReelDuration - 0.1)
                            : maxReelDuration
                        }
                        aria-valuemin="0"
                        aria-valuemax={
                          s.mediaType === "video"
                            ? Math.max(0, maxReelDuration - 0.1)
                            : Math.max(0, +(s.end - 0.1).toFixed(1))
                        }
                        step=".1"
                        value={s.start}
                        aria-valuetext={`${s.start.toFixed(1)} seconds`}
                        onChange={(event) => {
                          update(s.id, {
                            start: +Number(event.target.value).toFixed(1),
                          });
                        }}
                      />
                      <input
                        aria-label={`Screen ${s.id} end`}
                        type="range"
                        min="0"
                        max={maxReelDuration}
                        aria-valuemin={+(s.start + 0.1).toFixed(1)}
                        aria-valuemax={
                          s.mediaType === "video"
                            ? Math.min(
                                maxReelDuration,
                                s.start + s.sourceDuration - (s.trimIn || 0),
                              )
                            : maxReelDuration
                        }
                        step=".1"
                        value={s.end}
                        aria-valuetext={`${s.end.toFixed(1)} seconds`}
                        onChange={(event) => {
                          const end = Math.max(
                            Number(event.target.value),
                            s.start + 0.1,
                          );
                          update(s.id, { end: +end.toFixed(1) });
                        }}
                      />
                    </div>
                    {s.mediaType === "video" && (
                      <fieldset className="screen-video-trim">
                        <legend>
                          Video crop · {(s.end - s.start).toFixed(1)}s selected of{" "}
                          {s.sourceDuration.toFixed(1)}s
                        </legend>
                        <label>
                          Crop in (source seconds)
                          <input
                            type="number"
                            min="0"
                            max={Math.max(
                              0,
                              s.sourceDuration - (s.trimOut || 0) - 0.1,
                            )}
                            step=".1"
                            value={(s.trimIn || 0).toFixed(1)}
                            onChange={(event) =>
                              update(s.id, { trimIn: Number(event.target.value) })
                            }
                          />
                        </label>
                        <label>
                          Crop out (source seconds)
                          <input
                            type="number"
                            min={(s.trimIn || 0) + 0.1}
                            max={s.sourceDuration}
                            step=".1"
                            value={(s.sourceDuration - (s.trimOut || 0)).toFixed(1)}
                            onChange={(event) =>
                              update(s.id, {
                                trimOut: s.sourceDuration - Number(event.target.value),
                              })
                            }
                          />
                        </label>
                      </fieldset>
                    )}
                  </fieldset>
                  <div
                    className="screen-extra-fields"
                    id={`screen-extra-fields-${s.id}`}
                    hidden={!expandedScreenFields[s.id]}
                  >
                    <fieldset className="screen-control-group screen-animation-group">
                      <legend>Animation</legend>
                      <div className="screen-options">
                        {["entry", "exit"].map((key) => (
                          <label key={key}>
                            {key === "entry" ? "Entry" : "Exit"}
                            <select
                              value={s[key]}
                              onChange={(e) =>
                                update(s.id, { [key]: e.target.value })
                              }
                            >
                              {styles.map((v) => (
                                <option key={v}>{v}</option>
                              ))}
                            </select>
                          </label>
                        ))}
                        <label className="screen-range-field">
                          <span>
                            Motion (s)
                            <output>
                              {screenMotionDuration(s, maxMotionDuration).toFixed(1)}s
                            </output>
                          </span>
                          <input
                            aria-label={`Screen ${s.id} motion`}
                            type="range"
                            min="0"
                            max={maxScreenMotionDuration(
                              s.start,
                              s.end,
                              maxMotionDuration,
                            )}
                            step=".1"
                            value={screenMotionDuration(s, maxMotionDuration)}
                            aria-valuetext={`${screenMotionDuration(s, maxMotionDuration).toFixed(1)} seconds`}
                            onChange={(event) => {
                              const transition = Number(event.target.value);
                              if (
                                transition >= 0 &&
                                transition <= maxMotionDuration
                              ) {
                                update(s.id, { transition });
                              }
                            }}
                          />
                        </label>
                      </div>
                    </fieldset>
                    <fieldset className="screen-control-group screen-fit-group">
                      <legend>{s.mediaType === "video" ? "Video frame fit" : "Image fit"}</legend>
                      <div className="screen-fit-options">
                        {[
                          { value: "cover", label: "Fill frame, crop edges" },
                          {
                            value: "contain",
                            label: s.mediaType === "video" ? "Fit whole video" : "Fit whole image",
                          },
                          { value: "crop", label: "Custom crop" },
                          { value: "custom", label: "Custom size and position" },
                        ].map((option) => (
                          <label
                            className="screen-fit-option"
                            key={option.value}
                            title={option.label}
                          >
                            <input
                              type="radio"
                              name={`screen-${s.id}-fit`}
                              value={option.value}
                              aria-label={`Screen ${s.id} ${s.mediaType === "video" ? "video" : "image"} fit: ${option.label}`}
                              checked={s.fit === option.value}
                              onChange={() => setScreenFit(s, option.value)}
                            />
                            <svg
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                              focusable="false"
                            >
                              {option.value === "cover" && (
                                <>
                                  <rect x="3" y="4" width="18" height="16" rx="2" />
                                  <path d="M3 9h18M8 4v5m8-5v5M7 16h10" />
                                </>
                              )}
                              {option.value === "contain" && (
                                <>
                                  <rect x="3" y="4" width="18" height="16" rx="2" />
                                  <rect x="8" y="6" width="8" height="12" rx="1" />
                                </>
                              )}
                              {option.value === "crop" && (
                                <path d="M8 4v12a2 2 0 0 0 2 2h10M4 8h12a2 2 0 0 1 2 2v10M8 8l8 8" />
                              )}
                              {option.value === "custom" && (
                                <>
                                  <rect x="5" y="5" width="14" height="14" rx="1" />
                                  <path d="M5 10h14M10 5v14M2 2l4 4m16-4-4 4m4 16-4-4M2 22l4-4" />
                                </>
                              )}
                            </svg>
                            <span className="screen-visually-hidden">{option.label}</span>
                          </label>
                        ))}
                      </div>
                      {s.fit === "contain" && (
                        <div className="screen-fit-background">
                          <span className="screen-fit-background-label">
                            Fill empty space with
                          </span>
                          <div className="screen-fit-background-modes">
                            {[
                              { value: "blur", label: "Blurred image" },
                              { value: "color", label: "Solid color" },
                            ].map((mode) => (
                              <label key={mode.value}>
                                <input
                                  type="radio"
                                  name={`screen-${s.id}-background`}
                                  value={mode.value}
                                  checked={
                                    (s.fitBackground?.mode || "blur") ===
                                    mode.value
                                  }
                                  onChange={() =>
                                    update(s.id, {
                                      fitBackground: {
                                        ...s.fitBackground,
                                        mode: mode.value,
                                      },
                                    })
                                  }
                                />
                                {mode.label}
                              </label>
                            ))}
                          </div>
                          {s.fitBackground?.mode === "color" ? (
                            <label className="screen-fit-background-detail">
                              Background color
                              <input
                                type="color"
                                aria-label={`Screen ${s.id} background color`}
                                value={s.fitBackground.color || "#292630"}
                                onChange={(event) =>
                                  update(s.id, {
                                    fitBackground: {
                                      ...s.fitBackground,
                                      mode: "color",
                                      color: event.target.value,
                                    },
                                  })
                                }
                              />
                            </label>
                          ) : (
                            <label className="screen-fit-background-detail">
                              Blur strength
                              <input
                                type="range"
                                min="4"
                                max="32"
                                step="1"
                                aria-label={`Screen ${s.id} background blur`}
                                aria-valuetext={`${s.fitBackground?.blur ?? 18} pixels`}
                                value={s.fitBackground?.blur ?? 18}
                                onChange={(event) =>
                                  update(s.id, {
                                    fitBackground: {
                                      ...s.fitBackground,
                                      mode: "blur",
                                      blur: Number(event.target.value),
                                    },
                                  })
                                }
                              />
                            </label>
                          )}
                        </div>
                      )}
                    </fieldset>
                    {s.src && (
                      <button
                        className="remove-screen-image"
                        onClick={() => {
                          releaseScreenVisual(s);
                          setPlaying(false);
                          setScreens((current) =>
                            current.map((screen) =>
                              screen.id === s.id
                                ? {
                                    ...screen,
                                    src: null,
                                    file: null,
                                    name: null,
                                    mediaType: "image",
                                    sourceDuration: undefined,
                                    trimIn: undefined,
                                    trimOut: undefined,
                                  }
                                : screen,
                            ),
                          );
                        }}
                      >
                        Remove media
                      </button>
                    )}
                    {screens.length > 1 && (
                      <button
                        type="button"
                        className="remove-screen"
                        aria-label={`Remove screen ${s.id}`}
                        onClick={() => removeScreen(s.id)}
                      >
                        Remove screen
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </fieldset>
          </section>
          <section
            id="screen-panel-audio"
            className="screen-tab-panel"
            role="tabpanel"
            aria-labelledby="screen-tab-audio"
            tabIndex={0}
            hidden={activeTab !== "Audio"}
          >
            <section className="screen-audio">
                <h2>Audio tracks</h2>
                <div className="screen-audio-help">
                  Add multiple tracks, trim each one, and choose where it sits on the reel.
                </div>
                <label className="screen-upload">
                  Add audio tracks
                  <input
                    type="file"
                    accept="audio/*"
                    multiple
                    disabled={!draftReady || exporting}
                    onChange={(e) => {
                      Array.from(e.target.files).forEach(addAudio);
                      e.target.value = "";
                    }}
                  />
                </label>
                {!audioClips.length && (
                  <div className="screen-audio-empty">
                    No tracks yet. Choose one or more audio files to begin.
                  </div>
                )}
                {audioClips.map((clip, index) => {
                  const trimStart = clip.trimStart ?? 0;
                  const trimEnd = clip.trimEnd ?? 0;
                  const trimmedDuration = clip.duration - trimStart - trimEnd;
                  const previewEnd = clip.duration - trimEnd;
                  const previewPosition = Math.min(
                    previewEnd,
                    Math.max(
                      trimStart,
                      audioPreviewPositions[clip.id] ?? trimStart,
                    ),
                  );
                  const isPreviewing = previewingAudioId === clip.id;
                  return (
                    <article className="screen-audio-clip" key={clip.id}>
                      <div className="screen-audio-clip-heading">
                        <div>
                          <h3>Track {index + 1}</h3>
                          <p>
                            {clip.name} · {trimmedDuration.toFixed(1)}s selected of {clip.duration.toFixed(1)}s
                            {audioShouldLoop(
                              clip.duration,
                              duration,
                              clip.start,
                              trimStart,
                              trimEnd,
                              clip.repeatToEnd,
                            ) &&
                              ` · Repeats to fill the remaining ${(duration - clip.start).toFixed(1)}s`}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="screen-audio-remove"
                          disabled={!draftReady || exporting}
                          onClick={() => removeAudioClip(clip)}
                        >
                          Remove
                        </button>
                      </div>
                      <div className="screen-audio-clip-controls">
                        <label>
                          Start on reel (s)
                          <input
                            type="number"
                            min="0"
                            max={maxReelDuration}
                            step=".1"
                            disabled={!draftReady || exporting}
                            value={clip.start}
                            onChange={(event) => updateAudioClip(clip.id, { start: +event.target.value })}
                          />
                        </label>
                        <label>
                          Crop in point (s)
                          <input
                            type="number"
                            min="0"
                            max={Math.max(0, clip.duration - trimEnd - .1)}
                            step=".1"
                            disabled={!draftReady || exporting}
                            value={trimStart}
                            onChange={(event) => updateAudioClip(clip.id, { trimStart: +event.target.value })}
                          />
                        </label>
                        <label>
                          Crop out point (s)
                          <input
                            type="number"
                            min={trimStart + .1}
                            max={clip.duration}
                            step=".1"
                            disabled={!draftReady || exporting}
                            value={clip.duration - trimEnd}
                            onChange={(event) => updateAudioClip(clip.id, { trimEnd: clip.duration - +event.target.value })}
                          />
                        </label>
                        <label className="screen-audio-repeat">
                          <input
                            type="checkbox"
                            disabled={!draftReady || exporting}
                            checked={clip.repeatToEnd ?? false}
                            onChange={(event) => updateAudioClip(clip.id, { repeatToEnd: event.target.checked })}
                          />
                          Repeat to end of reel
                        </label>
                        <label className="screen-audio-volume">
                          Volume {Math.round((clip.volume ?? 1) * 100)}%
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step=".01"
                            disabled={!draftReady || exporting}
                            value={clip.volume ?? 1}
                            onChange={(event) => updateAudioClip(clip.id, { volume: +event.target.value })}
                          />
                        </label>
                      </div>
                      <div className="screen-audio-preview">
                        <button
                          type="button"
                          disabled={!draftReady || exporting}
                          aria-label={`${isPreviewing ? "Pause" : "Play"} preview for ${clip.name}`}
                          onClick={() => toggleAudioPreview(clip)}
                        >
                          {isPreviewing ? "Pause" : "Play"}
                        </button>
                        <label className="screen-audio-seek">
                          <span className="screen-visually-hidden">{clip.name} preview timeline</span>
                          <input
                            type="range"
                            min={trimStart}
                            max={previewEnd}
                            step=".01"
                            disabled={!draftReady || exporting}
                            value={Math.min(previewEnd, Math.max(trimStart, previewPosition))}
                            onChange={(event) => seekAudioPreview(clip, +event.target.value)}
                          />
                        </label>
                        <output>{previewPosition.toFixed(1)} / {previewEnd.toFixed(1)}s</output>
                      </div>
                    </article>
                  );
                })}
            </section>
          </section>
          <section
            id="screen-panel-settings"
            className="screen-tab-panel screen-settings"
            role="tabpanel"
            aria-labelledby="screen-tab-settings"
            tabIndex={0}
            hidden={activeTab !== "Settings"}
          >
              <h2>Settings</h2>
              <section className="screen-settings-group" aria-labelledby="draft-settings-heading">
                <h3 id="draft-settings-heading">Draft</h3>
                <p role="status">{draftStatus}</p>
                <button
                  disabled={!draftReady || exporting}
                  onClick={discardDraft}
                >
                  Clear draft
                </button>
              </section>
              <section className="screen-settings-group" aria-labelledby="output-settings-heading">
                <h3 id="output-settings-heading">Video output</h3>
                <label className="screen-setting-field">
                  Video type
                  <select
                    aria-label="Export video type"
                    disabled={!draftReady || exporting}
                    value={format}
                    onChange={(event) => setFormat(event.target.value)}
                  >
                    <option value="mp4">MP4 (H.264 + AAC)</option>
                    <option
                      value="webm"
                      disabled={!globalThis.MediaRecorder?.isTypeSupported("video/webm")}
                    >
                      WebM (VP8 + Opus)
                    </option>
                  </select>
                </label>
                <label className="screen-setting-toggle">
                  <input
                    type="checkbox"
                    disabled={!draftReady || exporting}
                    checked={reducedMotion}
                    onChange={(event) => setReducedMotion(event.target.checked)}
                  />
                  Reduce motion in preview and export
                </label>
              </section>
              <section className="screen-settings-group" aria-labelledby="timing-settings-heading">
                <h3 id="timing-settings-heading">Screen timing</h3>
                <label className="screen-setting-range">
                  <span>
                    Screens use up to{" "}
                    <output>{maxScreenDuration.toFixed(1)}s</output> seconds each
                  </span>
                  <input
                    aria-label="Screens use up to (seconds each)"
                    type="range"
                    min="0.1"
                    max={Math.max(
                      10,
                      maxScreenDuration,
                      calculatedDefaultScreenDuration,
                    )}
                    step="0.1"
                    value={maxScreenDuration}
                    disabled={!draftReady || exporting}
                    onChange={(event) =>
                      setMaxScreenDuration(Number(event.target.value))
                    }
                  />
                </label>
                <label className="screen-setting-range">
                  <span>
                    Motion timing up to{" "}
                    <output>{maxMotionDuration.toFixed(1)}s</output>
                  </span>
                  <input
                    aria-label="Motion timing maximum (seconds)"
                    type="range"
                    min="0"
                    max="5"
                    step="0.1"
                    value={maxMotionDuration}
                    disabled={!draftReady || exporting}
                    onChange={(event) => {
                      const nextMotionDuration = Number(event.target.value);
                      setMaxMotionDuration(nextMotionDuration);
                      setMaxOverlayDuration((current) =>
                        Math.min(current, nextMotionDuration),
                      );
                    }}
                  />
                </label>
                <label className="screen-setting-range">
                  <span>
                    Screen overlaying time{" "}
                    <output>{maxOverlayDuration.toFixed(1)}s</output>
                  </span>
                  <input
                    aria-label="Screen overlaying time (seconds)"
                    type="range"
                    min="0"
                    max={maxMotionDuration}
                    step="0.1"
                    value={maxOverlayDuration}
                    disabled={!draftReady || exporting}
                    onChange={(event) =>
                      setMaxOverlayDuration(Number(event.target.value))
                    }
                  />
                </label>
                <div className="screen-setting-animation-defaults">
                  <label className="screen-setting-field">
                    Entry animation type
                    <select
                      aria-label="Default entry animation"
                      disabled={!draftReady || exporting}
                      value={defaultEntry}
                      onChange={(event) => setDefaultEntry(event.target.value)}
                    >
                      {styles.map((style) => (
                        <option key={style}>{style}</option>
                      ))}
                    </select>
                  </label>
                  <label className="screen-setting-field">
                    Exit animation type
                    <select
                      aria-label="Default exit animation"
                      disabled={!draftReady || exporting}
                      value={defaultExit}
                      onChange={(event) => setDefaultExit(event.target.value)}
                    >
                      {styles.map((style) => (
                        <option key={style}>{style}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="screen-setting-toggle">
                  <input
                    aria-label="Overlap adjacent animated screens"
                    type="checkbox"
                    disabled={!draftReady || exporting}
                    checked={autoOverlap}
                    onChange={(event) => setAutoOverlap(event.target.checked)}
                  />
                  Overlap adjacent animated screens
                </label>
                <button
                  disabled={!draftReady || exporting}
                  onClick={resetTiming}
                >
                  Reset timing by order
                </button>
                <p>
                  The default is Maximum reel duration ÷ Maximum screens. This adjusts with project limits until changed manually. Screen duration sets the maximum for new screens and Reset timing. Motion timing caps each screen’s Motion in preview and export.                   When overlap is enabled, Reset timing only overlaps adjacent screens with animated Exit and Entry types, capped by both Motion durations, half of each screen’s duration, and the overlay setting. Entry and Exit defaults apply to new screens and are applied to all screens when Reset timing by order is used.
                </p>
              </section>
              <section
                className="screen-settings-group"
                aria-labelledby="limits-settings-heading"
              >
                <h3 id="limits-settings-heading">Project limits</h3>
                <label className="screen-setting-field">
                  Maximum screens
                  <input
                    aria-label="Maximum screens"
                    type="number"
                    min={screens.length}
                    step="1"
                    value={maxScreensInput}
                    disabled={!draftReady || exporting}
                    onChange={(event) => {
                      const input = event.target.value;
                      setMaxScreensInput(input);
                      const value = Number(input);
                      const minimum = Number(event.currentTarget.min);
                      if (
                        input !== "" &&
                        Number.isInteger(value) &&
                        value >= minimum
                      ) {
                        maxScreensValue.current = value;
                        setMaxScreens(value);
                      }
                    }}
                    onBlur={() =>
                      setMaxScreensInput(String(maxScreensValue.current))
                    }
                  />
                </label>
                <p>
                  Current screens: {screens.length}. Remove screens before lowering this limit.
                </p>
                <label className="screen-setting-field">
                  Maximum reel duration (seconds)
                  <input
                    aria-label="Maximum reel duration (seconds)"
                    type="number"
                    min={requiredDuration}
                    step="0.1"
                    value={maxReelDurationInput}
                    disabled={!draftReady || exporting}
                    onChange={(event) => {
                      const value = event.target.value;
                      setMaxReelDurationInput(value);
                      const durationLimit = Number(value);
                      const minimum = Number(event.currentTarget.min);
                      if (
                        value !== "" &&
                        Number.isFinite(durationLimit) &&
                        durationLimit >= minimum
                      ) {
                        maxReelDurationValue.current = durationLimit;
                        setMaxReelDuration(durationLimit);
                        setTime((current) => Math.min(current, durationLimit));
                      }
                    }}
                    onBlur={() =>
                      setMaxReelDurationInput(
                        String(maxReelDurationValue.current),
                      )
                    }
                  />
                </label>
                <p>
                  Shorten screen timings or move audio tracks earlier before lowering the limit.
                  Current minimum: {requiredDuration.toFixed(1)}s.
                </p>
              </section>
          </section>
          <section
            id="screen-panel-timeline"
            className="screen-tab-panel screen-timeline"
            role="tabpanel"
            aria-labelledby="screen-tab-timeline"
            tabIndex={0}
            hidden={activeTab !== "Timeline"}
          >
            <div className="screen-timeline-heading">
              <div>
                <h2>Timeline</h2>
                <p>One row per screen · select a clip to seek the preview.</p>
              </div>
              <span>{time.toFixed(1)} / {maxReelDuration.toFixed(1)}s</span>
            </div>
            <input
              aria-label="Reel playhead"
              type="range"
              min="0"
              max={maxReelDuration}
              step=".01"
              value={time}
              disabled={!draftReady || exporting}
              onChange={(event) => {
                setPlaying(false);
                setTime(+event.target.value);
              }}
            />
            <div className="screen-tracks">
              {screens.map((screen) => (
                <div key={screen.id}>
                  <span>{screen.id}</span>
                  <div className="screen-lane">
                    <button
                      className={screen.mediaType === "video" ? "video-lane-clip" : undefined}
                      disabled={!screen.src || exporting}
                      aria-label={`Seek screen ${screen.id}`}
                      onClick={() => {
                        setPlaying(false);
                        selectScreen(screen.id);
                        setTime(screen.start);
                      }}
                      style={{
                        left: `${Math.min((screen.start / maxReelDuration) * 100, 100)}%`,
                        width: `${(Math.max(
                          0,
                          Math.min(screen.end, maxReelDuration) - screen.start,
                        ) / maxReelDuration) * 100}%`,
                      }}
                    >
                      {screen.src
                        ? `${screen.mediaType === "video" ? "Video · " : ""}${screen.start}–${screen.end}s`
                        : ""}
                    </button>
                    <i
                      style={{
                        left: `${(time / maxReelDuration) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
              {audioClips.map((clip, index) => {
                const trimDuration = clip.duration - (clip.trimStart ?? 0) - (clip.trimEnd ?? 0);
                const clipEnd = clip.repeatToEnd
                  ? duration
                  : Math.min(duration, clip.start + trimDuration);
                return (
                  <div key={clip.id}>
                    <span>Audio {index + 1}</span>
                    <div className="screen-lane audio-lane">
                      {clip.start < duration && (
                        <button
                          type="button"
                          aria-label={`Seek to ${clip.name} audio track start${clip.repeatToEnd ? ", repeats to the end of the reel" : ""}`}
                          onClick={() => {
                            setPlaying(false);
                            setTime(clip.start);
                          }}
                          style={{
                            left: `${Math.min((clip.start / maxReelDuration) * 100, 100)}%`,
                            width: `${Math.max(0, (clipEnd - clip.start) / maxReelDuration * 100)}%`,
                          }}
                        >
                          {clip.name}{clip.repeatToEnd ? " · repeats" : ""}
                        </button>
                      )}
                      <i
                        style={{
                          left: `${(time / maxReelDuration) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
          <section
            id="screen-panel-prompts"
            className="screen-tab-panel"
            role="tabpanel"
            aria-labelledby="screen-tab-prompts"
            tabIndex={0}
            hidden={activeTab !== "Prompts"}
          >
            <PromptLibrary />
          </section>
        </section>
        <aside className="screen-preview">
          <h2>Reel preview <span>9:16</span></h2>
          <canvas
            ref={canvas}
            width="360"
            height="640"
            aria-label="Screen reel preview. Select a visible screen, drag to move it, or drag the lower-right handle to resize."
            aria-describedby="screen-preview-edit-help"
            tabIndex={0}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={onCanvasPointerUp}
            onPointerCancel={onCanvasPointerUp}
            onLostPointerCapture={onCanvasPointerUp}
            onKeyDown={onCanvasKeyDown}
          />
          <div className="screen-controls" role="group" aria-label="Reel preview controls">
            <button
              type="button"
              className="screen-transport-button"
              aria-label="Restart reel preview"
              title="Restart"
              disabled={!draftReady || exporting}
              onClick={() => {
                audioPreview.current?.pause();
                audioPreview.current = null;
                setPreviewingAudioId(null);
                setPlaying(false);
                setTime(0);
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M3 11a9 9 0 1 1 2.64 6.36L3 15.5" />
                <path d="M3 4v5h5" />
              </svg>
            </button>
            <button
              type="button"
              className="screen-transport-button primary"
              aria-label={playing ? "Pause reel preview" : "Play reel preview"}
              title={playing ? "Pause" : "Play"}
              disabled={!draftReady || exporting || !screens.some((s) => s.src)}
              onClick={() => {
                if (!playing) {
                  audioPreview.current?.pause();
                  audioPreview.current = null;
                  setPreviewingAudioId(null);
                  if (time >= duration) setTime(0);
                  setActiveTab("Timeline");
                }
                setPlaying(!playing);
              }}
            >
              {playing ? (
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M7 5h4v14H7zM15 5h4v14h-4z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="m8 5 12 7-12 7z" />
                </svg>
              )}
            </button>
            <output aria-label="Preview time">
              {time.toFixed(1)} / {duration.toFixed(1)}s
            </output>
          </div>
          <p id="screen-preview-edit-help" className="screen-preview-edit-help">
            {selectedScreenId
              ? `Screen ${selectedScreenId} selected · drag to move · drag the lower-right handle to resize · arrow keys move · Shift + arrows resize`
              : "Click a visible image or video to select it. Choose Custom to resize and move it in the preview."}
          </p>
            <p>
              1080 × 1920 · 9:16 · 30 FPS
              <br />
              {format === "mp4"
                ? "MP4 · H.264 video · AAC audio"
                : "WebM · VP8 video · Opus audio"}
            </p>

          {result && (
            <p>
              <a
                href={result.url}
                download={`shomshar-screens.${result.format}`}
              >
                Download {result.format.toUpperCase()}
              </a>
            </p>
          )}
          {exporting && <p role="status">{exportStatus}</p>}

            <p>
              MP4 renders every frame at 30 FPS, then encodes H.264 + AAC. WebM
              records in real time. Keep this tab open until the download is
              ready.
            </p>

        </aside>
      </div>
      {notice && (
        <div
          className={`screen-notice screen-notice-${notice.type}`}
          role={notice.type === "error" ? "alert" : "status"}
        >
          <strong>{notice.type === "error" ? "Error" : notice.type === "success" ? "Success" : "Notice"}</strong>
          <span>{notice.message}</span>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setNotice(null)}
          >
            ×
          </button>
        </div>
      )}
      {audioClips.map((clip) => (
        <audio
          key={clip.id}
          ref={(element) => {
            if (element) audioElements.current.set(clip.id, element);
            else audioElements.current.delete(clip.id);
          }}
          src={clip.src}
          preload="metadata"
        />
      ))}
    </div>
  );
}
