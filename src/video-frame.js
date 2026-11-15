export async function seekVideoFrame(video, time) {
  video.pause();
  if (!video.seeking && video.readyState >= 2 && Math.abs(video.currentTime - time) < 1e-6) return;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(Error("Timed out decoding a video frame for export. Try replacing the video."));
    }, 15000);
    const cleanup = () => {
      clearTimeout(timeout);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(Error("Could not decode a video frame for MP4 export."));
    };
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    try {
      video.currentTime = time;
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
