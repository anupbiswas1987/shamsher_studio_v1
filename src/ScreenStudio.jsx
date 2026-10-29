import React, { useEffect, useRef, useState } from "react";
import { download } from "./engine";
import {LOGO_SRC,LOGO_ALT} from "./branding";
import "./screen-studio.css";
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
const makeScreen = (i) => ({
  id: i + 1,
  start: Math.min(i * 3, 27),
  end: Math.min((i + 1) * 3, 30),
  entry: "None",
  exit: "None",
  transition: 0.7,
  fit: "cover",
  animation: createAnimation("static"),
});
const styles = ["None", "Fade", "Slide left", "Slide right", "Slide up", "Slide down", "Zoom"];
export default function ScreenStudio() {
  const [screens,setScreens]=useState(()=>[makeScreen(0)]),
    [time,setTime]=useState(0),
    [playing, setPlaying] = useState(false),
    [audio,setAudio]=useState(null),
    [audioStart,setAudioStart]=useState(0),
    [volume,setVolume]=useState(1),
    [notice, setNotice] = useState(""),
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
  const canvas=useRef(),images=useRef(new Map()),sound=useRef(),live=useRef(),urls=useRef(new Set());
  const duration=Math.max(1,...screens.filter(s=>s.src).map(s=>s.end));
  live.current={screens,time,duration};
  function resetTiming() {
    if (!draftReady || exporting) return;
    try {
      const next = resetScreenTiming(screens);
      setPlaying(false);
      setTime(0);
      setScreens(next);
      setNotice(
        "Timing reset to screen order: 3 seconds per screen, with no overlap.",
      );
    } catch (e) {
      setNotice(e.message);
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

          if(typeof draft.reducedMotion==='boolean')setReducedMotion(draft.reducedMotion);
          if(draft.audio?.file){const src=URL.createObjectURL(draft.audio.file);urls.current.add(src);setAudio({...draft.audio,src})}
          setAudioStart(draft.audioStart??0);setVolume(draft.volume??1);setFormat(draft.format||'mp4');
          setNotice("Your saved reel draft has been restored.");
        }
        setDraftReady(true);
      } catch {
        setDraftStatus("Draft could not be restored.");
        setNotice(
          "Could not open the local draft. Reload to retry, or clear the draft to start again.",
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
    const version = ++saveVersion.current;
    const snapshot=draftSnapshot({screens,audio,audioStart,volume,format,reducedMotion});
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
  }, [draftReady,screens,audio,audioStart,volume,format,reducedMotion]);
  async function discardDraft() {
    if (!window.confirm("Clear this draft and all uploaded screens and audio?"))
      return;
    setPlaying(false);
    try {
      await saveQueue.current.catch(() => {});
      await clearScreenDraft();
      images.current.clear();
      setScreens([makeScreen(0)]);

      setAudio(null);setAudioStart(0);setVolume(1);setFormat("mp4");
      setTime(0);
      setResult(null);
      setDraftReady(true);
      setNotice("Draft cleared. You can start a new reel.");
    } catch {
      setNotice("Could not clear the draft. Please try again.");
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
    if(playing&&relative>=0&&relative<audio.duration){if(el.paused||Math.abs(el.currentTime-relative)>.25){el.currentTime=relative;el.play().catch(()=>{setPlaying(false);setNotice('Audio playback failed. Please replace the audio file.')})}}else el.pause()
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
      setNotice("Screen uploaded. Adjust its timing and animations below.");
    } catch (e) {
      setNotice(e.message);
    }
  }
  async function addAudio(file){
    if(!file)return;const url=URL.createObjectURL(file);urls.current.add(url);const el=new Audio(url);
    el.onloadedmetadata=()=>{setPlaying(false);setAudio({src:url,file,name:file.name,duration:el.duration})};el.onerror=()=>setNotice('Could not read this audio file. Try MP3 or WAV.')
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
        setNotice("MP4 ready. Use Download MP4 if the download did not start.");
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
      setNotice(
        `${format.toUpperCase()} ready. Use the download link if the download did not start.`,
      );
    } catch (e) {
      setNotice(e.message);
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
        <a className="brand" href="/" aria-label="Shomshar Animation Studio home"><img className="brand-logo" src={LOGO_SRC} alt={LOGO_ALT} width="2172" height="724"/></a>
        <a href="/">Back to animation studio</a>
        <label className="screen-export-format">
          Video type
          <select
            aria-label="Export video type"
            disabled={!draftReady || exporting}
            value={format}
            onChange={(e) => setFormat(e.target.value)}
          >
            <option value="mp4">MP4 (H.264 + AAC)</option>
            <option
              value="webm"
              disabled={
                !globalThis.MediaRecorder?.isTypeSupported("video/webm")
              }
            >
              WebM (VP8 + Opus)
            </option>
          </select>
        </label>
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
          <div className="screen-intro"><div className="screen-draft-bar"><span role="status">{draftStatus}</span><button disabled={exporting} onClick={discardDraft}>Clear draft</button></div><span className="eyebrow">IMAGE TO REEL</span><h1>Your screens. Your timeline.</h1><p>Start with one screen and add up to 30 screens. Keep your reel within 30 seconds. Set their time ranges and choose how each enters and exits. Overlapping screens play together; the screen lower in the layer list appears on top.</p>              <button
                className="primary"
                disabled={!draftReady || exporting || screens.length >= 30}
                onClick={()=>{setPlaying(false);setScreens(ss=>ss.length<30?[...ss,makeScreen(ss.length)]:ss)}}
              >
                Add screen ({screens.length}/30)
              </button>{" "}
              <label className="screen-upload">
                Upload multiple screens
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={!draftReady || exporting}
                  onChange={(e) => {
                    const files=Array.from(e.target.files).slice(0,30);setPlaying(false);setScreens(ss=>{const next=[...ss];while(next.length<files.length)next.push(makeScreen(next.length));return next});files.forEach((file,i)=>upload(file,i+1));
                  e.target.value = "";
                  }}
                />
              </label>
              <div className="screen-timing-actions">
                <button
                  disabled={!draftReady || exporting || screens.length > 10}
                  onClick={resetTiming}
                >
                  Reset timing by order · 3s each
                </button>
                <span>
                  {screens.length > 10
                    ? "3 seconds per screen requires 10 or fewer screens within the 30-second limit."
                    : "Set screens to 0–3s, 3–6s, 6–9s… in their current order."}
                </span>
              </div></div>
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
                  <strong>
                    Screen {s.id} <small>{s.name || "No image uploaded"}</small>
                  </strong>
                <div className="screen-options">
                  <label>
                    Start (s)
                    <input
                      aria-label={`Screen ${s.id} start`}
                      type="number"
                      min="0"
                      max={s.end - 0.1}
                      step=".1"
                      value={s.start}
                      onChange={(e) => {
                        const n = +e.target.value;
                        if (n >= 0 && n < s.end)
                          update(s.id, { start: n });
                      }}
                    />
                  </label>
                  <label>
                    End (s)
                    <input
                      aria-label={`Screen ${s.id} end`}
                      type="number"
                      min={s.start + 0.1}
                      max="30"
                      step=".1"
                      value={s.end}
                      onChange={(e) => {
                        const n = +e.target.value;
                        if (n > s.start && n <= 30)
                          update(s.id, { end: n });
                      }}
                    />
                  </label>
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
                  <label>
                    Motion (s)
                    <input
                      type="number"
                      min="0"
                      max="5"
                      step=".1"
                      value={s.transition}
                      onChange={(e) => {
                        const n = +e.target.value;
                        if (n >= 0 && n <= 5)
                          update(s.id, { transition: n });
                      }}
                    />
                  </label>
                  <label>
                    Image fit
                    <select
                      value={s.fit}
                      onChange={(e) =>
                        update(s.id, { fit: e.target.value })
                      }
                    >
                      <option value="cover">Full screen (crop)</option>
                      <option value="contain">Fit whole image</option>
                      <option value="crop">Custom crop</option>
                    </select>
                  </label>
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
                </div>

                </div>
              </article>
            ))}
          </fieldset>

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
                        max="30"
                        step=".1"
                        disabled={!draftReady || exporting}
                        value={audioStart}
                        onChange={(e) =>
                          setAudioStart(
                            Math.max(0, Math.min(30, +e.target.value)),
                          )
                        }
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
        <aside className="screen-preview">
          <h2>Reel preview <span>9:16</span></h2>
          <canvas ref={canvas} width="360" height="640" aria-label="Screen reel preview"/>
          <div className="screen-controls">
            <button
              disabled={!draftReady || exporting}
              onClick={() => {
                setPlaying(false);
                setTime(0);
              }}
            >
              Restart
            </button>
            <button
              className="primary"
              disabled={!draftReady || exporting || !screens.some((s) => s.src)}
              onClick={()=>{if(time>=duration)setTime(0);setPlaying(!playing)}}
            >
              {playing?"Pause":"Play"}
            </button>
            <span>
              {time.toFixed(1)} / {duration.toFixed(1)}s
            </span>
          </div>
          <input
            aria-label="Reel playhead"
            type="range"
            min="0"
            max={duration}
            step=".01"
            value={time}
            disabled={!draftReady || exporting}
            onChange={(e) => {
              setPlaying(false);
              setTime(+e.target.value);
            }}
          />
          <p>Timeline · one row per screen</p>
          <div className="screen-tracks">{screens.map(s=><div key={s.id}><span>{s.id}</span><div className="screen-lane"><button disabled={!s.src||exporting} aria-label={`Seek screen ${s.id}`} onClick={()=>{setPlaying(false);setTime(s.start)}} style={{left:`${Math.min(s.start/duration*100,100)}%`,width:`${Math.max(0,Math.min(s.end,duration)-s.start)/duration*100}%`}}>{s.src?`${s.start}–${s.end}s`:''}</button><i style={{left:`${time/duration*100}%`}}/></div></div>)}<div><span>Audio</span><div className="screen-lane audio-lane">{audio&&audioStart<duration&&<b style={{left:`${audioStart/duration*100}%`,width:`${Math.min(audio.duration,duration-audioStart)/duration*100}%`}}>Audio</b>}</div></div></div>

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
      <p className="screen-notice" role="status">{notice}</p>
      {audio&&<audio ref={sound} src={audio.src}/>}
    </div>
  );
}
