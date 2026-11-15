// Represent source video audio using the same timeline settings as audio tracks.
export function videoAudioClips(screens) {
  return screens.filter(screen => screen.mediaType === 'video' && screen.useVideoAudio !== false && (screen.src || screen.asset)).map(screen => ({
    ...screen,
    duration: screen.sourceDuration,
    trimStart: screen.trimIn || 0,
    trimEnd: Math.max(0, screen.sourceDuration - (screen.trimIn || 0) - (screen.end - screen.start)),
    repeatToEnd: false,
    volume: 1,
    videoAudio: true,
  }));
}
