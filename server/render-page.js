import { screenAspect } from "/renderer/screen-aspect.js";
import { renderReelFrame } from '/renderer/cinematic.js';

window.renderProject = async (project, base) => {
  const stage = screenAspect(project.aspectRatio);
  const images = new Map();
  for (const screen of project.screens) {
    if (!screen.asset) continue;
    const media = document.createElement(screen.mediaType === 'video' ? 'canvas' : 'img');
    if (screen.mediaType === 'video') {
      media.width = screen.renderWidth; media.height = screen.renderHeight;
    } else {
      await new Promise((resolve, reject) => {
        media.onload = resolve;
        media.onerror = () => reject(Error(`Could not load ${screen.name || screen.id}`));
        media.src = `${base}/assets/${screen.asset}`;
      });
    }
    screen.src = `${base}/assets/${screen.asset}`;
    images.set(screen.id, media);
  }
  const canvas = document.createElement('canvas');
  canvas.width = stage.exportWidth; canvas.height = stage.exportHeight;
  const ctx = canvas.getContext('2d');
  const count = Math.ceil(project.duration * 30);
  const timing = { decode: 0, draw: 0, capture: 0, transfer: 0 };
  const started = performance.now();
  for (let frame = 0; frame < count; frame++) {
    const time = frame / 30;
    try {
      let at = performance.now();
      for (const screen of project.screens) {
        if (screen.mediaType !== 'video' || !screen.asset || time < screen.start || time >= screen.end) continue;
        const media = images.get(screen.id);
        const response = await fetch(`${base}/sources/${screen.asset}`);
        if (!response.ok) throw Error(await response.text());
        const pixels = new Uint8ClampedArray(await response.arrayBuffer());
        media.getContext('2d').putImageData(new ImageData(pixels, media.width, media.height), 0, 0);
      }
      timing.decode += performance.now() - at; at = performance.now();
      ctx.save(); ctx.scale(3, 3);
      renderReelFrame(ctx, project.screens, images, time, { reducedMotion: project.reducedMotion, width: stage.width, height: stage.height });
      ctx.restore();
      timing.draw += performance.now() - at; at = performance.now();
      // Avoid Chromium's Blob storage/FileReader path during long renders.
      // Encode directly so each frame stays in memory until FFmpeg accepts it.
      const dataUrl = canvas.toDataURL('image/jpeg', 0.97);
      if (!dataUrl.startsWith('data:image/jpeg;base64,')) throw Error('Canvas did not produce a JPEG frame');
      const encoded = dataUrl.slice(dataUrl.indexOf(',') + 1);
      timing.capture += performance.now() - at; at = performance.now();
      await window.writeRenderedFrame(encoded);
      timing.transfer += performance.now() - at;
    } catch (error) { throw Error(`Frame ${frame + 1}/${count}: ${error.message}`); }
  }
  return { frames: count, elapsedMs: performance.now() - started, timing };
};
