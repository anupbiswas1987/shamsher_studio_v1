export function resetScreenTiming(screens, maxDuration = 30) {
  if (!Number.isFinite(maxDuration) || maxDuration <= 0) {
    throw Error("Reel duration must be greater than zero.");
  }
  if (!screens.length) return [];

  const slotDuration = Math.min(3, maxDuration / screens.length);
  if (slotDuration < 0.1) {
    throw Error(
      `The ${maxDuration}s reel limit is too short to give each of the ${screens.length} screens at least 0.1 seconds.`,
    );
  }

  return screens.map((screen, index) => {
    const start = index * slotDuration;
    const end =
      index === screens.length - 1 && slotDuration < 3
        ? maxDuration
        : start + slotDuration;
    return { ...screen, start, end };
  });
}
