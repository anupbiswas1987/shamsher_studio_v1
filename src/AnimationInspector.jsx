import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  PRESETS,
  PROPERTIES,
  EASINGS,
  createAnimation,
  normalizeAnimation,
  evaluateAnimation,
  renderClip,
  sourceDuration,
  sourceTime,
  customAnimation,
  trimClip,
  normalizeCrop,
  analyzeFraming,
} from "./cinematic";
const labels = {
  x: "Position X (%)",
  y: "Position Y (%)",
  scale: "Scale",
  rotation: "Rotation (°)",
  opacity: "Opacity",
};
const limits = {
  x: [-100, 100, 0.1],
  y: [-100, 100, 0.1],
  scale: [0.05, 5, 0.01],
  rotation: [-180, 180, 0.1],
  opacity: [0, 1, 0.01],
};
function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 0.1,
  disabled = false,
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.value === "") return;
          const n = Number(e.target.value);
          if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
        }}
      />
    </label>
  );
}
function PresetPreview({ clip, image, preset }) {
  const ref = useRef();
  useEffect(() => {
    const ctx = ref.current.getContext("2d");
    ctx.clearRect(0, 0, 108, 64);
    const sample = {
      ...clip,
      start: 0,
      end: 3,
      sourceDuration: 3,
      trimIn: 0,
      trimOut: 0,
      entry: "None",
      exit: "None",
      animation: {
        ...createAnimation(preset),
        focal: normalizeAnimation(clip.animation).focal,
      },
    };
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(i * 36, 0, 35, 64);
      ctx.clip();
      ctx.translate(i * 36, 0);
      ctx.scale(0.1, 0.1);
      ctx.fillStyle = "#101115";
      ctx.fillRect(0, 0, 360, 640);
      if (image) renderClip(ctx, sample, image, i * 1.5);
      else {
        ctx.strokeStyle = "#cbb0e9";
        ctx.lineWidth = 10;
        ctx.strokeRect(80 + i * 6, 100 + i * 8, 200 - i * 12, 400 - i * 16);
        ctx.fillStyle = "#cbb0e9";
        ctx.fillRect(125, 210, 110, 8);
        ctx.fillRect(125, 240, 75, 8);
      }
      ctx.restore();
    }
  }, [clip, image, preset]);
  return <canvas ref={ref} width="108" height="64" aria-hidden="true" />;
}
export default function AnimationInspector({
  clip,
  image,
  time,
  onChange,
  onSeek,
  clipboard,
  onCopy,
  onPaste,
  onApply,
  selectedCount,
  disabled,
  picking,
  onPick,
  reducedMotion,
  onReducedMotion,
}) {
  const [activeKey, setActiveKey] = useState(null),
    [message, setMessage] = useState("");
  const draggedKey = useRef(null);
  useEffect(() => {
    setActiveKey(null);
    setMessage("");
  }, [clip.id]);
  const crop = normalizeCrop(clip.crop),
    a = normalizeAnimation(clip.animation),
    length = sourceDuration(clip),
    source = sourceTime(clip, time);
  const setAnimation = (patch) => onChange({ animation: { ...a, ...patch } });
  function setMotionDuration(duration) {
    const before = a.duration ?? length,
      after = duration ?? length;
    const keyframes =
      a.preset === "custom"
        ? Object.fromEntries(
            Object.entries(a.keyframes).map(([key, frames]) => [
              key,
              frames.map((frame) => ({
                ...frame,
                time: Math.min(length, (frame.time * after) / before),
              })),
            ]),
          )
        : a.keyframes;
    setAnimation({ duration, keyframes });
  }
  function setEasing(easing) {
    setAnimation({
      easing,
      keyframes:
        a.preset === "custom"
          ? Object.fromEntries(
              Object.entries(a.keyframes).map(([key, frames]) => [
                key,
                frames.map((frame) => ({ ...frame, easing })),
              ]),
            )
          : a.keyframes,
    });
  }
  function choosePreset(preset) {
    setActiveKey(null);
    if (preset === "custom") setAnimation(customAnimation(clip));
    else
      onChange({
        animation: {
          ...createAnimation(preset),
          focal: a.focal,
          protectContent: a.protectContent,
          avoidEmpty: a.avoidEmpty,
        },
      });
  }
  function setEndpoint(end, property, value) {
    setAnimation({ [end]: { ...a[end], [property]: value } });
  }
  function addKey(property) {
    const animation = customAnimation(clip),
      keys = [...(animation.keyframes[property] || [])],
      at = Math.min(length, Math.max(0, source)),
      value = evaluateAnimation(clip, time)[property],
      existing = keys.findIndex((k) => Math.abs(k.time - at) < 0.001);
    if (existing >= 0) {
      setActiveKey({ property, index: existing });
      setAnimation(animation);
      return;
    }
    keys.push({ time: at, value, easing: a.easing });
    keys.sort((l, r) => l.time - r.time);
    setAnimation({
      ...animation,
      keyframes: { ...animation.keyframes, [property]: keys },
    });
    setActiveKey({ property, index: keys.findIndex((k) => k.time === at) });
  }
  const framing = useMemo(
    () => (image ? analyzeFraming(clip, image) : null),
    [clip, image],
  );
  const selected = activeKey
    ? a.keyframes[activeKey.property]?.[activeKey.index]
    : null;
  function editKey(patch) {
    if (!selected) return;
    const keys = a.keyframes[activeKey.property].map((key, index) =>
      index === activeKey.index ? { ...key, ...patch } : key,
    );
    setAnimation({ keyframes: { ...a.keyframes, [activeKey.property]: keys } });
    if (patch.time != null)
      onSeek(
        Math.max(
          clip.start,
          Math.min(
            clip.end - 0.001,
            clip.start + patch.time - (clip.trimIn || 0),
          ),
        ),
      );
  }
  function deleteKey() {
    if (!selected) return;
    setAnimation({
      keyframes: {
        ...a.keyframes,
        [activeKey.property]: a.keyframes[activeKey.property].filter(
          (_, i) => i !== activeKey.index,
        ),
      },
    });
    setActiveKey(null);
  }
  function setTrim(key, value) {
    try {
      const next = trimClip(
        clip,
        key === "trimIn" ? value : clip.trimIn || 0,
        key === "trimOut" ? value : clip.trimOut || 0,
      );
      onChange(next);
      onSeek(next.start);
      setMessage(
        "Trimmed on the original animation clock; keyframes stay in place.",
      );
    } catch (e) {
      setMessage(e.message);
    }
  }
  return (
    <section className="animation-inspector" aria-label="Animation inspector">
      <div className="animation-heading">
        <div>
          <span className="eyebrow">CAMERA & FRAMING</span>
          <h2>Animate screen {clip.id}</h2>
        </div>
        <span>{selectedCount} selected</span>
      </div>
      <fieldset disabled={disabled}>
        <legend className="sr-only">Animation settings</legend>
          <div className="animation-actions">
            <button onClick={onCopy}>Copy animation</button>
            <button
              disabled={!clipboard || selectedCount < 1}
              onClick={onPaste}
            >
              Paste animation
            </button>
            <button disabled={selectedCount < 2} onClick={onApply}>
              Apply to selected clips
            </button>
            <button
              onClick={() => {
                onChange({
                  animation: createAnimation("static"),
                  fit: "contain",
                  crop: undefined,
                });
                setActiveKey(null);
              }}
            >
              Reset animation
            </button>
          </div>

        <label className="animation-select">
          Motion preset
          <select
            aria-label="Motion preset"
            value={a.preset}
            onChange={(e) => choosePreset(e.target.value)}
          >
            {PRESETS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <details>
          <summary>Visual preset previews · start / middle / end</summary>
          <div className="preset-gallery">
            {PRESETS.map(([value, label]) => (
              <button
                className={a.preset === value ? "selected" : ""}
                key={value}
                aria-pressed={a.preset === value}
                onClick={() => choosePreset(value)}
              >
                <PresetPreview clip={clip} image={image} preset={value} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </details>
        <div className="animation-grid">
          <NumberField
            label="Motion duration (s)"
            value={a.duration ?? length}
            min={0.1}
            max={a.preset === "custom" ? length : 30}
            onChange={setMotionDuration}
          />
          <label className="animation-check">
            <input
              type="checkbox"
              checked={a.duration == null}
              onChange={(e) =>
                setMotionDuration(e.target.checked ? null : length)
              }
            />
            Entire clip
          </label>
          <NumberField
            label="Motion intensity"
            value={a.intensity}
            min={0}
            max={2}
            step={0.05}
            onChange={(intensity) => setAnimation({ intensity })}
          />
          <label>
            Easing
            <select
              aria-label="Motion easing"
              value={a.easing}
              onChange={(e) => setEasing(e.target.value)}
            >
              {Object.keys(EASINGS).map((e) => (
                <option key={e}>{e}</option>
              ))}
            </select>
          </label>
        </div>
        <details open>
          <summary>Start and end transforms</summary>
          <p className="animation-help">
            Position uses stage %. Scale preserves image proportions. For
            Custom, edit individual keys in the timeline below.
          </p>
          <div className="endpoint-grid">
            <span>Property</span>
            <strong>Start</strong>
            <strong>End</strong>
            {PROPERTIES.map((property) => (
              <React.Fragment key={property}>
                <span>{labels[property]}</span>
                {["start", "end"].map((end) => (
                  <NumberField
                    key={end}
                    label={`${end === "start" ? "Start" : "End"} ${labels[property]}`}
                    value={a[end][property]}
                    min={limits[property][0]}
                    max={limits[property][1]}
                    step={limits[property][2]}
                    disabled={a.preset === "custom" || a.preset === "static"}
                    onChange={(value) => setEndpoint(end, property, value)}
                  />
                ))}
              </React.Fragment>
            ))}
          </div>
        </details>
        <details open>
          <summary>Image framing & focal point</summary>
          <div className="animation-grid">
            <label>
              Image fit
              <select
                aria-label="Animation image fit"
                value={clip.fit || "contain"}
                onChange={(e) => onChange({ fit: e.target.value })}
              >
                <option value="contain">
                  Contain · keep entire illustration
                </option>
                <option value="cover">Cover · fill frame, crop edges</option>
                <option value="crop">Custom crop · fill frame</option>
              </select>
            </label>
            <label className="animation-check">
              <input
                type="checkbox"
                checked={
                  clip.fit === "contain" ? a.protectContent : a.avoidEmpty
                }
                onChange={(e) =>
                  setAnimation(
                    clip.fit === "contain"
                      ? { protectContent: e.target.checked }
                      : { avoidEmpty: e.target.checked },
                  )
                }
              />
              {clip.fit === "contain"
                ? "Protect full illustration"
                : "Add overscan to avoid empty edges"}
            </label>
            <NumberField
              label="Focal X (%)"
              value={a.focal.x * 100}
              min={0}
              max={100}
              onChange={(x) =>
                setAnimation({ focal: { ...a.focal, x: x / 100 } })
              }
            />
            <NumberField
              label="Focal Y (%)"
              value={a.focal.y * 100}
              min={0}
              max={100}
              onChange={(y) =>
                setAnimation({ focal: { ...a.focal, y: y / 100 } })
              }
            />
          </div>
          <button aria-pressed={picking} onClick={onPick}>
            {picking
              ? "Cancel focal point selection"
              : "Pick focal point on image"}
          </button>
          {picking && (
            <p role="status" className="animation-help">
              Click the face or detail in the reel preview, or enter its image
              coordinates above.
            </p>
          )}
          {clip.fit === "crop" && (
            <div className="animation-grid">
              {[
                ["x", 0],
                ["y", 0],
                ["width", 1],
                ["height", 1],
              ].map(([key, fallback]) => (
                <NumberField
                  key={key}
                  label={`Crop ${key} (%)`}
                  value={crop[key] * 100}
                  min={key === "x" || key === "y" ? 0 : 1}
                  max={key === "x" || key === "y" ? 99 : 100}
                  onChange={(value) =>
                    onChange({
                      crop: normalizeCrop({ ...crop, [key]: value / 100 }),
                    })
                  }
                />
              ))}
            </div>
          )}
          <div className="framing-feedback" role="status">
            {clip.fit === "contain" ? (
              <p>
                Contain preserves the complete illustration. Margins are
                intentional.
              </p>
            ) : (
              <p>
                Cover/crop can cut off faces, full-body characters and Bengali
                speech bubbles. Check the preview at the start and end.
              </p>
            )}
            {framing?.protectedContent && (
              <p>
                Content protection limits zoom or movement during this clip to
                keep the entire illustration inside the frame.
              </p>
            )}
            {framing?.needsOverscan && (
              <p>
                {a.avoidEmpty ? "Overscan added" : "Empty edges possible"}: this
                frame needs {framing.maxRequiredScale.toFixed(2)}× scale across
                this clip to fill the canvas.
              </p>
            )}
            {framing?.clipped && (
              <p>
                Some source artwork is outside the visible frame. Use Contain to
                protect dialogue.
              </p>
            )}
          </div>
        </details>
        <details>
          <summary>Trim clip · preserve animation timing</summary>
          <p className="animation-help">
            Original source: {length.toFixed(2)}s. Visible source:{" "}
            {(clip.trimIn || 0).toFixed(2)}–
            {(length - (clip.trimOut || 0)).toFixed(2)}s. Moving a layer on the
            reel does not move its source keyframes.
          </p>
          <div className="animation-grid">
            <NumberField
              label="Trim start (s)"
              value={clip.trimIn || 0}
              min={0}
              max={length - (clip.trimOut || 0) - 0.1}
              step={0.01}
              onChange={(value) => setTrim("trimIn", value)}
            />
            <NumberField
              label="Trim end (s)"
              value={clip.trimOut || 0}
              min={0}
              max={length - (clip.trimIn || 0) - 0.1}
              step={0.01}
              onChange={(value) => setTrim("trimOut", value)}
            />
          </div>
          <button
            onClick={() => {
              try {
                onChange(trimClip(clip, 0, 0));
                setMessage("Original clip length restored.");
              } catch (e) {
                setMessage(e.message);
              }
            }}
          >
            Restore untrimmed clip
          </button>
        </details>
          <section
            className="keyframe-editor"
            aria-label="Animation keyframe timeline"
          >
            <h3>Keyframe timeline</h3>
            <p className="animation-help">
              Source time {source.toFixed(2)}s / {length.toFixed(2)}s. Click a
              diamond to seek and edit; drag it to move its time. Adding a key
              converts the current preset to editable keys.
            </p>
            {PROPERTIES.map((property) => (
              <div className="keyframe-track" key={property}>
                <span>{labels[property]}</span>
                <div className="keyframe-lane">
                  <div
                    className="trim-region"
                    style={{
                      left: 0,
                      width: `${((clip.trimIn || 0) / length) * 100}%`,
                    }}
                  />
                  <div
                    className="trim-region"
                    style={{
                      right: 0,
                      width: `${((clip.trimOut || 0) / length) * 100}%`,
                    }}
                  />
                  {(a.keyframes[property] || []).map((key, index) => {
                    const trimmed =
                      key.time < (clip.trimIn || 0) ||
                      key.time > length - (clip.trimOut || 0);
                    return (
                      <button
                        key={index}
                        className={
                          (activeKey?.property === property &&
                          activeKey?.index === index
                            ? "active "
                            : "") + (trimmed ? "trimmed" : "")
                        }
                        aria-label={`${labels[property]} keyframe at ${key.time.toFixed(2)}s`}
                        style={{
                          left: `${Math.min(100, Math.max(0, (key.time / length) * 100))}%`,
                        }}
                        onPointerDown={(e) => {
                          if (disabled) return;
                          draggedKey.current = { property, index };
                          setActiveKey({ property, index });
                          e.currentTarget.setPointerCapture(e.pointerId);
                        }}
                        onPointerMove={(e) => {
                          const dragged = draggedKey.current;
                          if (
                            !dragged ||
                            dragged.property !== property ||
                            dragged.index !== index
                          )
                            return;
                          const rect =
                              e.currentTarget.parentElement.getBoundingClientRect(),
                            time = Math.min(
                              length,
                              Math.max(
                                0,
                                Math.round(
                                  ((e.clientX - rect.left) / rect.width) *
                                    length *
                                    30,
                                ) / 30,
                              ),
                            );
                          const keys = a.keyframes[property].map((key, i) =>
                            i === index ? { ...key, time } : key,
                          );
                          setAnimation({
                            keyframes: { ...a.keyframes, [property]: keys },
                          });
                          onSeek(
                            Math.max(
                              clip.start,
                              Math.min(
                                clip.end - 0.001,
                                clip.start + time - (clip.trimIn || 0),
                              ),
                            ),
                          );
                        }}
                        onPointerUp={() => {
                          draggedKey.current = null;
                        }}
                        onPointerCancel={() => {
                          draggedKey.current = null;
                        }}
                        onClick={() => {
                          setActiveKey({ property, index });
                          onSeek(
                            Math.max(
                              clip.start,
                              Math.min(
                                clip.end - 0.001,
                                clip.start + key.time - (clip.trimIn || 0),
                              ),
                            ),
                          );
                        }}
                      >
                        ◆
                      </button>
                    );
                  })}
                  <i style={{ left: `${(source / length) * 100}%` }} />
                </div>
                <button
                  aria-label={`Add ${labels[property]} keyframe`}
                  onClick={() => addKey(property)}
                >
                  + Key
                </button>
              </div>
            ))}
            {selected && (
              <div className="keyframe-selected">
                <h3>{labels[activeKey.property]} keyframe</h3>
                <div className="animation-grid">
                  <NumberField
                    label="Keyframe time (s)"
                    value={selected.time}
                    min={0}
                    max={length}
                    step={1 / 30}
                    onChange={(time) => editKey({ time })}
                  />
                  <NumberField
                    label="Keyframe value"
                    value={selected.value}
                    min={limits[activeKey.property][0]}
                    max={limits[activeKey.property][1]}
                    step={limits[activeKey.property][2]}
                    onChange={(value) => editKey({ value })}
                  />
                  <label>
                    Segment easing
                    <select
                      aria-label="Keyframe segment easing"
                      value={selected.easing || a.easing}
                      onChange={(e) => editKey({ easing: e.target.value })}
                    >
                      {Object.keys(EASINGS).map((e) => (
                        <option key={e}>{e}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="keyframe-time-range">
                  Move keyframe in timeline
                  <input
                    aria-label="Move keyframe time"
                    type="range"
                    min="0"
                    max={length}
                    step={1 / 30}
                    value={selected.time}
                    onChange={(e) => editKey({ time: Number(e.target.value) })}
                  />
                </label>
                <button onClick={deleteKey}>Delete keyframe</button>
              </div>
            )}
          </section>


        <label className="animation-check">
          <input
            type="checkbox"
            checked={reducedMotion}
            onChange={(e) => onReducedMotion(e.target.checked)}
          />
          Reduce motion in preview and export
        </label>
        {message && (
          <p className="animation-help" role="status">
            {message}
          </p>
        )}
      </fieldset>
    </section>
  );
}
