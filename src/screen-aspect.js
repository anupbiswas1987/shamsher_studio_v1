export const SCREEN_ASPECTS = {
  '9:16': { label: '9:16 · Vertical', width: 360, height: 640, exportWidth: 1080, exportHeight: 1920 },
  '16:9': { label: '16:9 · Landscape', width: 640, height: 360, exportWidth: 1920, exportHeight: 1080 },
  '4:5': { label: '4:5 · Portrait', width: 360, height: 450, exportWidth: 1080, exportHeight: 1350 },
};
export function screenAspect(ratio) { return SCREEN_ASPECTS[ratio] || SCREEN_ASPECTS['9:16']; }
