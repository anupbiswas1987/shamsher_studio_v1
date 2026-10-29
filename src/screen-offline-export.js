import { FFmpeg } from "@ffmpeg/ffmpeg";
import coreURL from "@ffmpeg/core?url";
import wasmURL from "@ffmpeg/core/wasm?url";
import { renderReelFrame } from "./cinematic";
import { SCREEN_EXPORT } from "./screen-export";

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
async function audioWave(audio,audioStart,volume,duration){
 const context=new OfflineAudioContext(2,Math.ceil(duration*48000),48000);
 if(audio&&audioStart<duration){const response=await fetch(audio.src);if(!response.ok)throw Error('Could not read the audio layer.');const buffer=await context.decodeAudioData(await response.arrayBuffer()),source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;gain.gain.value=volume;source.connect(gain);gain.connect(context.destination);source.start(audioStart)}
 return pcmWave(await context.startRendering());
}
export async function renderScreenMp4({
  screens,
  images,
  duration,
  audio,
  audioStart = 0,
  volume = 1,
  reducedMotion = false,
  onProgress = () => {},
}) {
  const ffmpeg = new FFmpeg();
  try {
    onProgress("Preparing MP4 encoder…");
    await ffmpeg.load({ coreURL, wasmURL });
    onProgress("Mixing audio…");
    await ffmpeg.writeFile(
      "audio.wav",
      await audioWave(audio,audioStart,volume,duration),
    );
    const canvas = document.createElement("canvas");
    canvas.width = SCREEN_EXPORT.width;
    canvas.height = SCREEN_EXPORT.height;
    const ctx = canvas.getContext("2d"),
      count = Math.ceil(duration * SCREEN_EXPORT.fps);
    for (let frame = 0; frame < count; frame++) {
      const time = frame / SCREEN_EXPORT.fps;
      ctx.save();
      ctx.scale(SCREEN_EXPORT.width / 360, SCREEN_EXPORT.height / 640);
      renderReelFrame(ctx,screens,images,time,{reducedMotion});
      ctx.restore();
      // High-quality intermediates bound memory for a 30-second Full HD reel.
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.97),
      );
      if (!blob) throw Error("Could not render an animation frame.");
      await ffmpeg.writeFile(
        `frame${String(frame).padStart(4, "0")}.jpg`,
        new Uint8Array(await blob.arrayBuffer()),
      );
      onProgress(
        `Rendering frame ${frame + 1}/${count} · ${Math.round(((frame + 1) / count) * 100)}%`,
      );
    }
    ffmpeg.on("progress", ({ progress }) =>
      onProgress(
        `Encoding MP4… ${Math.min(99, Math.max(0, Math.round(progress * 100)))}%`,
      ),
    );
    const result = await ffmpeg.exec([
      "-framerate",
      String(SCREEN_EXPORT.fps),
      "-i",
      "frame%04d.jpg",
      "-i",
      "audio.wav",
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-r",
      String(SCREEN_EXPORT.fps),
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "48000",
      "-t",
      String(duration),
      "-movflags",
      "+faststart",
      "reel.mp4",
    ]);
    if (result !== 0)
      throw Error("MP4 encoding failed. Your saved draft is preserved.");
    const bytes = await ffmpeg.readFile("reel.mp4");
    return new Blob([bytes], { type: "video/mp4" });
  } finally {
    ffmpeg.terminate();
  }
}
