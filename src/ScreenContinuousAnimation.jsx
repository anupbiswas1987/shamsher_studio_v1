import ScreenNumericInput from "./ScreenNumericInput.jsx";
import React from "react";
import { createAnimation, normalizeAnimation, PRESETS, EASINGS } from "./cinematic";

const fields = [
  { key: "opacity", label: "Opacity (%)", min: 0, max: 100, step: 1, factor: 100 },
  { key: "x", label: "X position (%)", min: -100, max: 100, step: 1, factor: 1 },
  { key: "y", label: "Y position (%)", min: -100, max: 100, step: 1, factor: 1 },
  { key: "scale", label: "Scale (%)", min: 5, max: 500, step: 1, factor: 100 },
  { key: "rotation", label: "Rotation (°)", min: -180, max: 180, step: 1, factor: 1 },
];

export default function ScreenContinuousAnimation({ screen, onChange }) {
  const animation = normalizeAnimation(screen.animation);
  const active = animation.preset !== "static";
  function setEndpoint(endpoint, field, value) {
    if (!Number.isFinite(value)) return;
    const bounded = Math.min(field.max, Math.max(field.min, value)) / field.factor;
    onChange({
      ...animation,
      preset: ["static", "custom"].includes(animation.preset) ? "endpoints" : animation.preset,
      timeline: "screen",
      intensity: 1,
      protectContent: false,
      keyframes: {},
      [endpoint]: { ...animation[endpoint], [field.key]: bounded },
    });
  }
  return (
    <fieldset className="screen-control-group screen-continuous-animation">
      <legend>Continuous animation</legend>
      <p className="screen-continuous-help">Animate across the full screen time or repeat at a set interval, alongside Entry and Exit. Positions are offsets from the frame center; positive X moves right and positive Y moves down.</p>
      <div className="screen-continuous-settings">
        <label>
          Style · 15 motion presets
          <select aria-label={`Screen ${screen.id} continuous style`} value={animation.preset} onChange={(event) => onChange({
            ...createAnimation(event.target.value),
            timeline: "screen",
            protectContent: false,
            duration: animation.duration,
            repeat: animation.repeat,
          })}>
            {PRESETS.filter(([value]) => value !== "custom").map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            <option value="endpoints">Custom start / end</option>
            {animation.preset === "custom" && <option value="custom">Custom keyframes</option>}
          </select>
        </label>
        <label>
          Easing
          <select aria-label={`Screen ${screen.id} continuous easing`} value={animation.easing} disabled={!active} onChange={(event) => onChange({ ...animation, easing: event.target.value })}>
            {Object.keys(EASINGS).map((value) => <option key={value} value={value}>{value.replaceAll("-", " ")}</option>)}
          </select>
        </label>
        <label>
          Timing
          <select aria-label={`Screen ${screen.id} continuous timing`} value={animation.duration == null ? "full" : "interval"} onChange={(event) => onChange({
            ...animation, timeline: "screen",
            duration: event.target.value === "full" ? null : Math.min(1, Math.max(0.1, screen.end - screen.start)),
            repeat: event.target.value === "full" ? "none" : "loop",
          })}>
            <option value="full">Full screen time · {(screen.end - screen.start).toFixed(1)}s</option>
            <option value="interval">Set time / repeat interval</option>
          </select>
        </label>
        {animation.duration != null && <>
          <label>
            Cycle duration (seconds)
            <ScreenNumericInput  aria-label={`Screen ${screen.id} continuous cycle duration`} min="0.1" max="3600" step="0.1" value={animation.duration} onChange={(event) => {
              const value = Number(event.target.value);
              if (event.target.value !== "" && Number.isFinite(value) && value >= 0.1 && value <= 3600) onChange({ ...animation, timeline: "screen", duration: value });
            }} />
          </label>
          <label>
            Repeat
            <select aria-label={`Screen ${screen.id} continuous repeat`} value={animation.repeat} onChange={(event) => onChange({ ...animation, repeat: event.target.value })}>
              <option value="none">Once, then hold end values</option>
              <option value="loop">Repeat until screen ends</option>
              <option value="alternate">Repeat back and forth</option>
            </select>
          </label>
        </>}
      </div>
      {animation.duration != null && <p className="screen-continuous-help">Each cycle lasts {animation.duration}s.{animation.repeat === "alternate" ? ` A complete out-and-back takes ${Math.round(animation.duration * 20) / 10}s.` : animation.repeat === "loop" ? " Each cycle restarts at the start values." : " End values are held for the remaining screen time."}</p>}
      <div className="screen-continuous-endpoints">
        {["start", "end"].map((endpoint) => (
          <fieldset key={endpoint}>
            <legend>{endpoint === "start" ? "Start values" : "End values"}</legend>
            {fields.map((field) => {
              const value = Math.round(animation[endpoint][field.key] * field.factor * 100) / 100;
              return (
                <label key={field.key}>
                  {field.label}
                  <span className="screen-animation-stepper">
                    <button type="button" aria-label={`Screen ${screen.id} ${endpoint} ${field.key} decrease`} disabled={value <= field.min} onClick={() => setEndpoint(endpoint, field, value - field.step)}>−</button>
                    <ScreenNumericInput  aria-label={`Screen ${screen.id} ${endpoint} ${field.key}`} min={field.min} max={field.max} step={field.step} value={value} onChange={(event) => {
                      if (event.target.value !== "") setEndpoint(endpoint, field, Number(event.target.value));
                    }} />
                    <button type="button" aria-label={`Screen ${screen.id} ${endpoint} ${field.key} increase`} disabled={value >= field.max} onClick={() => setEndpoint(endpoint, field, value + field.step)}>+</button>
                  </span>
                </label>
              );
            })}
          </fieldset>
        ))}
      </div>
      <label className="screen-continuous-toggle">
        <input type="checkbox" checked={animation.avoidEmpty} onChange={(event) => onChange({ ...animation, avoidEmpty: event.target.checked })} />
        Enlarge media when needed to hide empty edges
      </label>
      {animation.preset === "custom" && <p className="screen-continuous-help">Editing a start or end value replaces existing keyframes with start-to-end movement.</p>}
    </fieldset>
  );
}
