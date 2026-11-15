import { videoAudioClips } from "./screen-video-audio.js";
import { seekVideoFrame } from "./video-frame.js";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import coreURL from "@ffmpeg/core?url";
import wasmURL from "@ffmpeg/core/wasm?url";
import { renderReelFrame } from "./cinematic";
import { SCREEN_EXPORT, reelMetadataArgs } from "./screen-export";
import { audioShouldLoop } from "./audio-loop";

// PCM WAV is accepted consistently by the encoder, regardless of the uploaded codec.
export function pcmWave(buffer) {
  const channels = buffer.numberOfChannels,
    length = buffer.length,
    bytes = new ArrayBuffer(44 + length * channels * 2),
    view = new DataView(bytes);
  const text = (at, string) => {
    for (let i = 0; i < string.length; i++)
      view.setUint8(at + i, string.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, bytes.byteLength - 8, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, length * channels * 2, true);
  const data = Array.from({ length: channels }, (_, channel) =>
    buffer.getChannelData(channel),
  );
  let at = 44;
  for (let frame = 0; frame < length; frame++)
    for (let channel = 0; channel < channels; channel++) {
      const sample = Math.max(-1, Math.min(1, data[channel][frame]));
      view.setInt16(
        at,
        Math.round(sample * (sample < 0 ? 32768 : 32767)),
        true,
      );
      at += 2;
    }
  return new Uint8Array(bytes);
}
async function audioWave(audioClips, duration) {
  const context = new OfflineAudioContext(2, Math.ceil(duration * 48000), 48000);
  for (const clip of audioClips) {
    if (clip.start >= duration) continue;
    const response = await fetch(clip.src);
    if (!response.ok) throw Error(`Could not read the audio track ${clip.name}.`);
    let buffer;
    try { buffer = await context.decodeAudioData(await response.arrayBuffer()); }
    catch (error) { if (clip.videoAudio) continue; throw error; }
    const trimStart = clip.trimStart ?? 0;
    const trimEnd = clip.trimEnd ?? 0;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = audioShouldLoop(
      buffer.duration,
      duration,
      clip.start,
      trimStart,
      trimEnd,
      clip.repeatToEnd,
    );
    source.loopStart = trimStart;
    source.loopEnd = buffer.duration - trimEnd;
    gain.gain.value = clip.volume ?? 1;
    source.connect(gain);
    gain.connect(context.destination);
    const remaining = duration - clip.start;
    const playable = buffer.duration - trimStart - trimEnd;
    source.start(
      clip.start,
      trimStart,
      source.loop ? remaining : Math.min(remaining, playable),
    );
  }
  return pcmWave(await context.startRendering());
}
async function seekScreenVideos(screens, videos, time) {
  await Promise.all(
    screens
      .filter(
        (screen) =>
          screen.src &&
          screen.mediaType === "video" &&
          time >= screen.start &&
          time < screen.end,
      )
      .map((screen) => {
        const video = videos.get(screen.id);
        if (!video) throw Error(`Video for screen ${screen.id} is unavailable.`);
        const localTime = Math.max(
          screen.trimIn || 0,
          Math.min(
            screen.sourceDuration - (screen.trimOut || 0),
            (screen.trimIn || 0) + time - screen.start,
          ),
        );
        return seekVideoFrame(video, Math.min(video.duration, localTime)).catch((error) => {
          throw new Error(`Screen ${screen.name || screen.id}, source time ${localTime.toFixed(3)}s: ${error.message}`, { cause: error });
        });
      }),
  );
}
export async function renderScreenMp4({
  title = "",
  screens,
  images,
  duration,
  audioClips = [],
  reducedMotion = false,
  onProgress = () => {},
}) {
  const ffmpeg = new FFmpeg();
  let stage = "Preparing video sources";
  const reportProgress = (message) => {
    stage = message;
    onProgress(message);
  };
  const encoderErrors = [];
  ffmpeg.on("log", ({ message }) => {
    if (/error|failed|invalid|out of memory|abort|cannot|could not/i.test(message)) {
      encoderErrors.push(message);
      if (encoderErrors.length > 4) encoderErrors.shift();
    }
  });
  // Export owns its decoders; preview seeks must never change exported frames.
  const exportImages = new Map(images);
  const exportVideos = [];
  const batchSize = 60;
  const segments = [];
  const encodeBatch = async (length) => {
    const name = `segment${segments.length}.mp4`;
    reportProgress(`Encoding frames… ${segments.length * batchSize + length}`);
    encoderErrors.length = 0;
    const result = await ffmpeg.exec([
      "-framerate", String(SCREEN_EXPORT.fps), "-i", "frame%04d.jpg",
      "-frames:v", String(length), "-c:v", "libx264", "-preset", "ultrafast",
      "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(SCREEN_EXPORT.fps), name,
    ]);
    if (result !== 0) throw Error("MP4 frame encoding failed.");
    segments.push(name);
    for (let i = 0; i < length; i++)
      await ffmpeg.deleteFile(`frame${String(i).padStart(4, "0")}.jpg`);
  };
  try {
    reportProgress("Preparing video sources…");
    await Promise.all(screens.filter(screen => screen.mediaType === "video" && screen.src).map(async screen => {
      const video = document.createElement("video");
      exportVideos.push(video);
      video.muted = true;
      video.preload = "auto";
      await new Promise((resolve, reject) => {
        video.onloadeddata = resolve;
        video.onerror = () => reject(Error(`Could not load video ${screen.id} for export.`));
        video.src = screen.src;
      });
      video.onloadeddata = video.onerror = null;
      video.width = video.videoWidth;
      video.height = video.videoHeight;
      exportImages.set(screen.id, video);
    }));
    reportProgress("Preparing MP4 encoder…");
    await ffmpeg.load({ coreURL, wasmURL });
    reportProgress("Mixing audio…");
    await ffmpeg.writeFile(
      "audio.wav",
      await audioWave([...audioClips, ...videoAudioClips(screens)],duration),
    );
    const canvas = document.createElement("canvas");
    canvas.width = SCREEN_EXPORT.width;
    canvas.height = SCREEN_EXPORT.height;
    const ctx = canvas.getContext("2d"),
      count = Math.ceil(duration * SCREEN_EXPORT.fps);
    for (let frame = 0; frame < count; frame++) {
      reportProgress(`Rendering frame ${frame + 1}/${count} · ${Math.round(((frame + 1) / count) * 100)}%`);
      const time = frame / SCREEN_EXPORT.fps;
      await seekScreenVideos(screens, exportImages, time);
      ctx.save();
      ctx.scale(SCREEN_EXPORT.width / 360, SCREEN_EXPORT.height / 640);
      renderReelFrame(ctx,screens,exportImages,time,{reducedMotion});
      ctx.restore();
      // Keep at most two seconds of JPEG intermediates in WASM memory.
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.97),
      );
      if (!blob) throw Error("Could not render an animation frame.");
      await ffmpeg.writeFile(
        `frame${String(frame % batchSize).padStart(4, "0")}.jpg`,
        new Uint8Array(await blob.arrayBuffer()),
      );
      if ((frame + 1) % batchSize === 0 || frame === count - 1)
        await encodeBatch(frame % batchSize + 1);
      reportProgress(
        `Rendering frame ${frame + 1}/${count} · ${Math.round(((frame + 1) / count) * 100)}%`,
      );
    }
    ffmpeg.on("progress", ({ progress }) =>
      reportProgress(
        `Encoding MP4… ${Math.min(99, Math.max(0, Math.round(progress * 100)))}%`,
      ),
    );
    await ffmpeg.writeFile("segments.txt", new TextEncoder().encode(
      segments.map(name => `file '${name}'`).join("\n"),
    ));
    reportProgress("Combining video segments and audio…");
    encoderErrors.length = 0;
    const result = await ffmpeg.exec([
      "-f", "concat", "-safe", "0", "-i", "segments.txt",
      "-i", "audio.wav", "-map", "0:v:0", "-map", "1:a:0",
      "-c:v", "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "48000",
      "-t",
      String(duration),
      ...reelMetadataArgs(title),
      "-movflags",
      "+faststart",
      "reel.mp4",
    ]);
    if (result !== 0)
      throw Error("MP4 encoding failed. Your saved draft is preserved.");
    const bytes = await ffmpeg.readFile("reel.mp4");
    return new Blob([bytes], { type: "video/mp4" });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error || "Unknown error");
    const details = encoderErrors.length ? ` Encoder: ${encoderErrors.join("; ").slice(-1500)}` : "";
    throw new Error(`${stage}: ${reason}${details}`, { cause: error });
  } finally {
    ffmpeg.terminate();
    for (const video of exportVideos) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
  }
}

// Stream-copy the recording so metadata does not require re-encoding the video.
export async function tagScreenWebm(blob, title) {
  const ffmpeg = new FFmpeg();
  try {
    await ffmpeg.load({ coreURL, wasmURL });
    await ffmpeg.writeFile("recording.webm", new Uint8Array(await blob.arrayBuffer()));
    const result = await ffmpeg.exec([
      "-i", "recording.webm", "-map", "0", "-c", "copy",
      ...reelMetadataArgs(title), "reel.webm",
    ]);
    if (result !== 0) throw Error("Could not add video metadata.");
    return new Blob([await ffmpeg.readFile("reel.webm")], { type: "video/webm" });
  } finally {
    ffmpeg.terminate();
  }
}
