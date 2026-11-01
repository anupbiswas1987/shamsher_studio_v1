import React, { useEffect, useRef, useState } from "react";
import { download } from "./engine";
import { LOGO_ALT, LOGO_SRC } from "./branding";
import "./screen-studio.css";
import "./screen-notice.css";
import "./screen-tabs.css";
import { resetScreenTiming } from "./screen-timing";
import {
  createAnimation,
  normalizeAnimation,
  renderReelFrame,
} from "./cinematic";
import {
  loadScreenDraft,
  saveScreenDraft,
  clearScreenDraft,
  draftSnapshot,
} from "./screen-draft";
import { SCREEN_EXPORT } from "./screen-export";
const DEFAULT_MAX_SCREENS = 30;
const DEFAULT_MAX_DURATION = 30;
const requiredDraftDuration = (screens, audioStart = 0) =>
  Math.max(
    0.1,
    Number.isFinite(audioStart) ? audioStart : 0,
    ...screens.map((screen) => screen.end || 0),
  );
const makeScreen = (i, maxDuration = DEFAULT_MAX_DURATION, id = i + 1) => {
  const start = Math.min(i * 3, Math.max(0, maxDuration - 0.1));
  return {
  id,
  start,
  end: Math.min(start + 3, maxDuration),
  entry: "None",
  exit: "None",
  transition: 0.7,
  fit: "cover",
  fitBackground: { mode: "blur", color: "#292630", blur: 18 },
  animation: createAnimation("static"),
  };
};
const styles = ["None", "Fade", "Slide left", "Slide right", "Slide up", "Slide down", "Zoom"];
export default function ScreenStudio() {
  const [activeTab, setActiveTab] = useState("Screen");
  const [expandedScreenFields, setExpandedScreenFields] = useState({});
  const [screens,setScreens]=useState(()=>[makeScreen(0)]),
    [maxScreens,setMaxScreens]=useState(DEFAULT_MAX_SCREENS),
    [maxScreensInput,setMaxScreensInput]=useState(String(DEFAULT_MAX_SCREENS)),
    [maxReelDuration,setMaxReelDuration]=useState(DEFAULT_MAX_DURATION),
    [maxReelDurationInput,setMaxReelDurationInput]=useState(String(DEFAULT_MAX_DURATION)),
    [time,setTime]=useState(0),
    [playing, setPlaying] = useState(false),
    [audio,setAudio]=useState(null),
    [audioStart,setAudioStart]=useState(0),
    [volume,setVolume]=useState(1),
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
  const canvas=useRef(),images=useRef(new Map()),sound=useRef(),live=useRef(),urls=useRef(new Set());
  const duration=Math.max(1,...screens.filter(s=>s.src).map(s=>s.end));
  const requiredDuration=Math.max(0.1,audioStart,...screens.map(s=>s.end||0));
  live.current={screens,time,duration};
  function notify(message, type = "info") {
    setNotice({ message, type });
  }
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 30000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  function resetTiming() {
    if (!draftReady || exporting) return;
    try {
      const next = resetScreenTiming(screens, maxReelDuration);
      setPlaying(false);
      setTime(0);
      setScreens(next);
      notify(
        `Timing reset in screen order within the ${maxReelDuration}s reel limit.`,
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
    if (screen.src?.startsWith("blob:")) {
      URL.revokeObjectURL(screen.src);
      urls.current.delete(screen.src);
    }
    images.current.delete(id);
    setPlaying(false);
    setTime(0);
    setScreens((current) => current.filter((item) => item.id !== id));
  }
  const update = (id, change) => {
    setPlaying(false);
    setScreens((ss) =>
      ss.map((s) => {
        if (s.id !== id) return s;
        const next = { ...s, ...change };
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
                animation: normalizeAnimation(
                  stored.animation || createAnimation("static"),
                ),
              };
              if (!screen.file) return screen;
              const src = URL.createObjectURL(screen.file);
              urls.current.add(src);
              const im = new Image();
              im.src = src;
              await im.decode();
              images.current.set(screen.id, im);
              return { ...screen, src };
            }),
          );
          if (!active) return;
          setScreens(restored);
          nextScreenId.current =
            Math.max(0, ...restored.map((screen) => screen.id)) + 1;
          const restoredMaxDuration = Math.max(
            requiredDraftDuration(restored, draft.audioStart),
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
          if(draft.audio?.file){const src=URL.createObjectURL(draft.audio.file);urls.current.add(src);setAudio({...draft.audio,src})}
          setAudioStart(draft.audioStart??0);setVolume(draft.volume??1);setFormat(draft.format||'mp4');
          notify("Your saved reel draft has been restored.", "success");
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
    if (!draftReady) return;
    if (skipNextDraftSave.current) {
      skipNextDraftSave.current = false;
      return;
    }
    const version = ++saveVersion.current;
    const snapshot=draftSnapshot({
      screens,
      audio,
      audioStart,
      volume,
      format,
      reducedMotion,
      maxScreens,
      maxReelDuration,
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
  }, [draftReady,screens,audio,audioStart,volume,format,reducedMotion,maxScreens,maxReelDuration]);
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
      setScreens([makeScreen(0)]);
      setExpandedScreenFields({});
      nextScreenId.current = 2;

      setAudio(null);setAudioStart(0);setVolume(1);setFormat("mp4");
      setReducedMotion(
        window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      );
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

  function draw(ctx, t, list) {
    return renderReelFrame(ctx,list,images.current,t,{reducedMotion});
  }
  useEffect(() => {
    draw(canvas.current.getContext("2d"), time, screens);
  }, [time, screens, playing, reducedMotion]);
  useEffect(()=>{
    if(!playing)return;const start=performance.now()-time*1000;let raf;
    function tick(){const t=Math.min(live.current.duration,(performance.now()-start)/1000);setTime(Math.min(live.current.duration,Math.floor(t*30)/30));if(t>=live.current.duration)setPlaying(false);else raf=requestAnimationFrame(tick)}
    raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf)
  },[playing]);
  useEffect(()=>{
    const el=sound.current;if(!el||!audio)return;el.volume=volume;const relative=time-audioStart;
    if(playing&&relative>=0&&relative<audio.duration){if(el.paused||Math.abs(el.currentTime-relative)>.25){el.currentTime=relative;el.play().catch(()=>{setPlaying(false);notify('Audio playback failed. Please replace the audio file.','error')})}}else el.pause()
  },[playing,time,audio,audioStart,volume]);
  async function upload(file, id) {
    if (!file) return;
    try {
      if (!file.type.startsWith("image/")) throw Error("Choose an image file.");
      const url = URL.createObjectURL(file);
      urls.current.add(url);
      const im = new Image();
      im.src = url;
      await im.decode();
      images.current.set(id, im);
      update(id, { src: url, file, name: file.name });
      const target = live.current.screens.find((s) => s.id === id);
      if (target) {
        setTime(target.start);

      }
      notify("Screen uploaded. Adjust its timing and animations below.", "success");
    } catch (e) {
      notify(e.message, "error");
    }
  }
  async function addAudio(file){
    if(!file)return;const url=URL.createObjectURL(file);urls.current.add(url);const el=new Audio(url);
    el.onloadedmetadata=()=>{setPlaying(false);setAudio({src:url,file,name:file.name,duration:el.duration})};el.onerror=()=>notify('Could not read this audio file. Try MP3 or WAV.','error')
  }
  async function exportVideo() {
    setPlaying(false);
    setExporting(true);
    setTime(0);
    let stream, ctx, source, silence, rec;
    try {
      if (format === "mp4") {
        const { renderScreenMp4 } = await import("./screen-offline-export");
        const blob = await renderScreenMp4({
          screens,
          images: images.current,
          duration,
          audio,
          audioStart,
          volume,
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
        draw(c, t, screens);
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
      if(audio){const response=await fetch(audio.src),buffer=await ctx.decodeAudioData(await response.arrayBuffer());source=ctx.createBufferSource();source.buffer=buffer;const gain=ctx.createGain();gain.gain.value=volume;source.connect(gain);gain.connect(dest)}
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
      source?.start(start+audioStart);
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
        source?.stop();
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
      <div className="screen-layout">
        <section className="screen-editor">
          <div className="screen-tabs" role="tablist" aria-label="Editor sections">
            {["Screen", "Audio", "Settings", "Timeline"].map((tab, index, tabs) => (
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
          <div className="screen-intro"><span className="eyebrow">IMAGE TO REEL</span><h1>Your screens. Your timeline.</h1><button
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
                      ),
                    ]);
                  }}
                >
                  Add screen ({screens.length}/{maxScreens})
              </button>{" "}
              <label className="screen-upload">
                Upload multiple screens
                <input
                  type="file"
                  accept="image/*"
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
                        ),
                      );
                    }
                    const targetIds = next
                      .slice(0, files.length)
                      .map((screen) => screen.id);
                    setScreens(next);
                    files.forEach((file, index) =>
                      upload(file, targetIds[index]),
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
            <legend>Screen layers · drag the handle to reorder · times stay unchanged</legend>
            {screens.map((s, position) => (
              <article
                className={
                  "screen-row" +
                  (draggedScreen === s.id ? " screen-dragging" : "") +
                  (dropScreen === s.id ? " screen-drop-target" : "")
                }
                key={s.id}
                onDragOver={(e) => {
                  if (draggedScreen === null || exporting) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDropScreen(s.id);
                }}
                onDrop={(e) => {
                  e.preventDefault();
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
                      e.dataTransfer.setData("text/plain", String(s.id));
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
                    <img src={s.src} alt={`Screen ${s.id}`} />
                  ) : (
                    <span>+ Upload</span>
                  )}
                  <input
                    aria-label={`Upload screen ${s.id}`}
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      upload(e.target.files[0], s.id);
                      e.target.value = "";
                    }}
                  />
                </label>
                <div className="screen-fields">
                  <div className="screen-fields-header">
                    <strong>
                      Screen {s.id} <small>{s.name || "No image uploaded"}</small>
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
                    <legend>Timeline</legend>
                    <div className="screen-time-values">
                      <span>
                        Start <output>{s.start.toFixed(1)}s</output>
                      </span>
                      <span>
                        End <output>{s.end.toFixed(1)}s</output>
                      </span>
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
                        max={Math.max(0, +(s.end - 0.1).toFixed(1))}
                        step=".1"
                        value={s.start}
                        aria-valuetext={`${s.start.toFixed(1)} seconds`}
                        onChange={(event) => {
                          const start = Number(event.target.value);
                          if (start >= 0 && start < s.end) {
                            update(s.id, { start });
                          }
                        }}
                      />
                      <input
                        aria-label={`Screen ${s.id} end`}
                        type="range"
                        min={+(s.start + 0.1).toFixed(1)}
                        max={maxReelDuration}
                        step=".1"
                        value={s.end}
                        aria-valuetext={`${s.end.toFixed(1)} seconds`}
                        onChange={(event) => {
                          const end = Number(event.target.value);
                          if (end > s.start && end <= maxReelDuration) {
                            update(s.id, { end });
                          }
                        }}
                      />
                    </div>
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
                            <output>{s.transition.toFixed(1)}s</output>
                          </span>
                          <input
                            aria-label={`Screen ${s.id} motion`}
                            type="range"
                            min="0"
                            max="5"
                            step=".1"
                            value={s.transition}
                            aria-valuetext={`${s.transition.toFixed(1)} seconds`}
                            onChange={(event) => {
                              const transition = Number(event.target.value);
                              if (transition >= 0 && transition <= 5) {
                                update(s.id, { transition });
                              }
                            }}
                          />
                        </label>
                      </div>
                    </fieldset>
                    <fieldset className="screen-control-group screen-fit-group">
                      <legend>Image fit</legend>
                      <div className="screen-fit-options">
                        {[
                          { value: "cover", label: "Fill frame, crop edges" },
                          { value: "contain", label: "Fit whole image" },
                          { value: "crop", label: "Custom crop" },
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
                              aria-label={`Screen ${s.id} image fit: ${option.label}`}
                              checked={s.fit === option.value}
                              onChange={() => update(s.id, { fit: option.value })}
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
                          images.current.delete(s.id);

                          update(s.id, {
                            src: null,
                            file: null,
                            name: null,
                          });
                        }}
                      >
                        Remove
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
                <h2>Audio layer</h2>
                <label className="screen-upload">
                  {audio?"Replace audio":"Upload audio"}
                  <input
                    type="file"
                    accept="audio/*"
                    disabled={!draftReady || exporting}
                    onChange={(e) => {
                      addAudio(e.target.files[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
                {audio && (
                  <>
                    <p>
                      {audio.name} · {audio.duration.toFixed(1)}s
                    </p>
                    <label>
                      Start (s)
                      <input
                        type="number"
                        min="0"
                        max={maxReelDuration}
                        step=".1"
                        disabled={!draftReady || exporting}
                        value={audioStart}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          if (
                            Number.isFinite(value) &&
                            value >= 0 &&
                            value <= maxReelDuration
                          ) {
                            setAudioStart(value);
                          }
                        }}
                      />
                    </label>
                    <label>
                      Volume {Math.round(volume * 100)}%
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step=".01"
                        disabled={!draftReady || exporting}
                        value={volume}
                        onChange={(e) => setVolume(+e.target.value)}
                      />
                    </label>
                    <button
                      disabled={!draftReady || exporting}
                      onClick={() => {
                        setPlaying(false);
                        setAudio(null);
                      }}
                    >
                      Remove audio
                    </button>
                  </>
                )}
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
                <button
                  disabled={!draftReady || exporting}
                  onClick={resetTiming}
                >
                  Reset timing by order
                </button>
                <p>
                  Screens are placed in order, up to 3 seconds each, within the configured reel duration.
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
                  Shorten screen timings or move the audio start before lowering the limit.
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
                      disabled={!screen.src || exporting}
                      aria-label={`Seek screen ${screen.id}`}
                      onClick={() => {
                        setPlaying(false);
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
                      {screen.src ? `${screen.start}–${screen.end}s` : ""}
                    </button>
                    <i
                      style={{
                        left: `${(time / maxReelDuration) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
              <div>
                <span>Audio</span>
                <div className="screen-lane audio-lane">
                  {audio && audioStart < maxReelDuration && (
                    <b
                      style={{
                        left: `${(audioStart / maxReelDuration) * 100}%`,
                        width: `${(Math.min(audio.duration, maxReelDuration - audioStart) / maxReelDuration) * 100}%`,
                      }}
                    >
                      Audio
                    </b>
                  )}
                  <i
                    style={{
                      left: `${(time / maxReelDuration) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </section>
        </section>
        <aside className="screen-preview">
          <h2>Reel preview <span>9:16</span></h2>
          <canvas ref={canvas} width="360" height="640" aria-label="Screen reel preview"/>
          <div className="screen-controls" role="group" aria-label="Reel preview controls">
            <button
              type="button"
              className="screen-transport-button"
              aria-label="Restart reel preview"
              title="Restart"
              disabled={!draftReady || exporting}
              onClick={() => {
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
              className="primary"
              aria-label={playing ? "Pause reel preview" : "Play reel preview"}
              title={playing ? "Pause" : "Play"}
              disabled={!draftReady || exporting || !screens.some((s) => s.src)}
              onClick={() => {
                if (!playing) {
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
      {audio&&<audio ref={sound} src={audio.src}/>}
    </div>
  );
}
