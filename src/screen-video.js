const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function videoTimingFromSource(start, sourceDuration, maxDuration) {
  const safeDuration = Number.isFinite(sourceDuration)
    ? Math.max(0.1, sourceDuration)
    : 0.1;
  const safeStart = clamp(
    Number.isFinite(start) ? start : 0,
    0,
    Math.max(0, maxDuration - 0.1),
  );
  const visibleDuration = Math.min(safeDuration, maxDuration - safeStart);
  return {
    start: safeStart,
    end: safeStart + visibleDuration,
    sourceDuration: safeDuration,
    trimIn: 0,
    trimOut: safeDuration - visibleDuration,
  };
}

export function updateVideoTiming(screen, changes, maxDuration) {
  const sourceDuration = screen.sourceDuration;
  const maxTrimIn = Math.max(0, sourceDuration - 0.1);
  let start = clamp(
    Number.isFinite(changes.start) ? changes.start : screen.start,
    0,
    Math.max(0, maxDuration - 0.1),
  );
  let trimIn = clamp(
    Number.isFinite(changes.trimIn) ? changes.trimIn : screen.trimIn || 0,
    0,
    maxTrimIn,
  );
  let trimOut = clamp(
    Number.isFinite(changes.trimOut) ? changes.trimOut : screen.trimOut || 0,
    0,
    Math.max(0, sourceDuration - trimIn - 0.1),
  );
  let end;

  if (changes.start != null && changes.end == null) {
    const previousLength = screen.end - screen.start;
    end = Math.min(maxDuration, start + previousLength);
    trimOut = Math.max(0, sourceDuration - trimIn - (end - start));
  } else if (changes.end != null) {
    end = clamp(
      changes.end,
      start + 0.1,
      Math.min(maxDuration, start + sourceDuration - trimIn),
    );
    trimOut = Math.max(0, sourceDuration - trimIn - (end - start));
  } else {
    const available = sourceDuration - trimIn - trimOut;
    end = Math.min(maxDuration, start + available);
    trimOut += Math.max(0, start + available - end);
  }

  return {
    ...screen,
    ...changes,
    start,
    end,
    sourceDuration,
    trimIn,
    trimOut,
  };
}
