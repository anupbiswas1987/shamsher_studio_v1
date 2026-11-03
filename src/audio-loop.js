export function audioPlaybackPosition(
  reelTime,
  audioStart,
  audioDuration,
  trimStart = 0,
  trimEnd = 0,
  repeatToEnd = true,
) {
  const playableDuration = audioDuration - trimStart - trimEnd;
  if (
    !Number.isFinite(reelTime) ||
    !Number.isFinite(audioStart) ||
    !Number.isFinite(audioDuration) ||
    !Number.isFinite(trimStart) ||
    !Number.isFinite(trimEnd) ||
    playableDuration <= 0 ||
    reelTime < audioStart
  ) {
    return null;
  }
  const elapsed = reelTime - audioStart;
  if (!repeatToEnd && elapsed >= playableDuration) return null;
  return trimStart + (repeatToEnd ? elapsed % playableDuration : elapsed);
}

export function audioShouldLoop(
  audioDuration,
  reelDuration,
  audioStart = 0,
  trimStart = 0,
  trimEnd = 0,
  repeatToEnd = true,
) {
  const playableDuration = audioDuration - trimStart - trimEnd;
  return (
    repeatToEnd &&
    Number.isFinite(playableDuration) &&
    playableDuration > 0 &&
    Number.isFinite(reelDuration) &&
    Number.isFinite(audioStart) &&
    Number.isFinite(trimStart) &&
    Number.isFinite(trimEnd) &&
    reelDuration > audioStart &&
    playableDuration < reelDuration - audioStart
  );
}
