const TENTH = 10;
export function defaultScreenDuration(maxReelDuration, maxScreens) {
  if (
    !Number.isFinite(maxReelDuration) ||
    maxReelDuration <= 0 ||
    !Number.isFinite(maxScreens) ||
    maxScreens <= 0
  ) {
    throw Error("Reel duration and screen count must be greater than zero.");
  }
  return Math.max(
    0.1,
    Math.floor((maxReelDuration / maxScreens) * TENTH + 1e-8) / TENTH,
  );
}

export const DEFAULT_SCREEN_DURATION = defaultScreenDuration(30, 30);
export const DEFAULT_MOTION_DURATION = 0.5;
export const DEFAULT_OVERLAY_DURATION = 0.3;

const toTenths = (seconds) => Math.floor(seconds * TENTH + 1e-8);

export function maxScreenMotionDuration(
  start,
  end,
  maxMotionDuration = DEFAULT_MOTION_DURATION,
) {
  const duration =
    Number.isFinite(start) && Number.isFinite(end)
      ? Math.max(0, end - start)
      : 0;
  return Math.min(
    maxMotionDuration,
    Math.floor(duration * 5 + 1e-8) / TENTH,
  );
}

export function screenMotionDuration(
  screen,
  maxMotionDuration = DEFAULT_MOTION_DURATION,
) {
  const transition = Number.isFinite(screen.transition)
    ? Math.max(0, screen.transition)
    : 0;
  return Math.min(
    transition,
    maxScreenMotionDuration(
      screen.start,
      screen.end,
      maxMotionDuration,
    ),
  );
}

function transitionTenths(screen, durationTenths, maxMotionDuration) {
  const transition = Number.isFinite(screen.transition)
    ? Math.max(0, Math.min(maxMotionDuration, screen.transition))
    : 0;
  return Math.min(
    toTenths(transition),
    Math.floor(durationTenths / 2),
  );
}

function overlapTenths(
  previous,
  current,
  durationTenths,
  maxMotionDuration,
  maxOverlayDuration,
) {
  if (
    !previous.exit ||
    previous.exit === "None" ||
    !current.entry ||
    current.entry === "None"
  ) {
    return 0;
  }
  return Math.min(
    transitionTenths(previous, durationTenths, maxMotionDuration),
    transitionTenths(current, durationTenths, maxMotionDuration),
    toTenths(maxOverlayDuration),
  );
}

function sequenceDurationTenths(
  screens,
  durationTenths,
  maxMotionDuration,
  maxOverlayDuration,
) {
  return (
    screens.length * durationTenths -
    screens
      .slice(1)
      .reduce(
        (total, screen, index) =>
          total +
          overlapTenths(
            screens[index],
            screen,
            durationTenths,
            maxMotionDuration,
            maxOverlayDuration,
          ),
        0,
      )
  );
}

export function resetScreenTiming(
  screens,
  maxDuration = 30,
  allowAnimationOverlap = true,
  {
    maxScreenDuration = DEFAULT_SCREEN_DURATION,
    maxMotionDuration = DEFAULT_MOTION_DURATION,
    maxOverlayDuration = DEFAULT_OVERLAY_DURATION,
    defaultEntry,
    defaultExit,
  } = {},
) {
  if (!Number.isFinite(maxDuration) || maxDuration <= 0) {
    throw Error("Reel duration must be greater than zero.");
  }
  if (!Number.isFinite(maxScreenDuration) || maxScreenDuration <= 0) {
    throw Error("Screen duration must be greater than zero.");
  }
  if (!Number.isFinite(maxMotionDuration) || maxMotionDuration < 0) {
    throw Error("Motion duration cannot be negative.");
  }
  if (!Number.isFinite(maxOverlayDuration) || maxOverlayDuration < 0) {
    throw Error("Overlay duration cannot be negative.");
  }
  if (!screens.length) return [];

  const configuredScreens = screens.map((screen) => ({
    ...screen,
    ...(defaultEntry !== undefined ? { entry: defaultEntry } : {}),
    ...(defaultExit !== undefined ? { exit: defaultExit } : {}),
  }));
  const maxDurationTenths = toTenths(maxDuration);
  const maxScreenDurationTenths = toTenths(maxScreenDuration);
  if (!maxScreenDurationTenths) {
    throw Error("Screen duration must be at least 0.1 seconds.");
  }
  const timingScreens = allowAnimationOverlap
    ? configuredScreens
    : configuredScreens.map((screen) => ({
        ...screen,
        entry: "None",
        exit: "None",
      }));
  const sequenceDuration = (durationTenths) =>
    sequenceDurationTenths(
      timingScreens,
      durationTenths,
      maxMotionDuration,
      maxOverlayDuration,
    );
  if (sequenceDuration(1) > maxDurationTenths) {
    throw Error(
      `The ${maxDuration}s reel limit is too short to give each of the ${screens.length} screens at least 0.1 seconds.`,
    );
  }

  const limited = sequenceDuration(maxScreenDurationTenths) > maxDurationTenths;
  const reelLimit = maxDurationTenths / TENTH;
  let low = 1;
  let high = maxScreenDurationTenths;
  while (low < high) {
    const candidate = Math.ceil((low + high) / 2);
    if (sequenceDuration(candidate) <= maxDurationTenths) {
      low = candidate;
    } else {
      high = candidate - 1;
    }
  }

  let cursorTenths = 0;
  return configuredScreens.map((screen, index) => {
    if (index > 0) {
      cursorTenths -= overlapTenths(
        timingScreens[index - 1],
        screen,
        low,
        maxMotionDuration,
        maxOverlayDuration,
      );
    }
    const start = cursorTenths / TENTH;
    cursorTenths += low;
    const end =
      limited && index === screens.length - 1
        ? Math.min(start + maxScreenDuration, reelLimit)
        : cursorTenths / TENTH;
    return {
      ...screen,
      start,
      end,
    };
  });
}
