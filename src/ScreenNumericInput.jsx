import React, { useEffect, useRef, useState } from "react";

// Keep partial numbers editable without passing incomplete values to the model.
export default function ScreenNumericInput({ value, onChange, onBlur, onFocus, integer = false, min, max, ...props }) {
  const [draft, setDraft] = useState(String(value ?? ""));
  const focused = useRef(false);
  const latestValue = useRef(value);
  latestValue.current = value;
  useEffect(() => {
    if (!focused.current) setDraft(String(value ?? ""));
  }, [value]);
  const complete = (text) => (integer ? /^-?\d+$/ : /^-?(?:\d+(?:\.\d*)?|\.\d+)$/).test(text);
  const valid = (text) => complete(text) && Number.isFinite(Number(text)) &&
    (min == null || Number(text) >= Number(min)) &&
    (max == null || Number(text) <= Number(max));
  return <input
    {...props}
    type="text"
    inputMode={integer ? "numeric" : "decimal"}
    min={min}
    max={max}
    value={draft}
    onFocus={(event) => { focused.current = true; onFocus?.(event); }}
    onChange={(event) => {
      const text = event.target.value;
      if (!(integer ? /^-?\d*$/ : /^-?\d*(?:\.\d*)?$/).test(text)) return;
      if (text.startsWith("-") && Number(min) >= 0) return;
      setDraft(text);
      if (valid(text)) onChange?.(event);
    }}
    onBlur={(event) => {
      focused.current = false;
      const formatted = valid(draft) ? String(Number(draft)) : String(latestValue.current ?? "");
      event.target.value = formatted;
      setDraft(formatted);
      onBlur?.(event);
    }}
  />;
}
