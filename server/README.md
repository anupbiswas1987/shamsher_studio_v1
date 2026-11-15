# Server MP4 export

Run `npm ci` and `ddev start` (or `ddev restart` after configuration changes). DDEV installs native FFmpeg and Chromium and starts the render worker on loopback port 5174 alongside Vite. MP4 export uploads project media to this worker. WebM export continues to use browser recording.

The worker reuses `src/cinematic.js` in headless Chromium and sends JPEG frames through the existing Puppeteer connection to native FFmpeg through a pipe. Frame uploads avoid per-frame HTTP requests so long reels do not accumulate unread Fetch responses. It keeps 1080 × 1920 resolution and 30 fps, encodes H.264 video and AAC audio, and preserves project title metadata. It runs one job at a time, with two encoding threads. Source videos are decoded sequentially by native FFmpeg into full-resolution RGBA frames, avoiding repeated browser seeks and GOP decoding. Canvas rendering still runs per output frame. Progress reports measured frames per second; worker logs record decoding, drawing, capture, and transfer timings.

Media and exports live in `.render-jobs/` on the project disk, excluded from Git. Uploaded assets are deleted when processing ends. Results and abandoned uploads expire after 24 hours. Worker restart removes all old jobs; pending jobs must be submitted again. The current implementation does not resume jobs after a restart.

Limits: 512 MB per uploaded file, 2 GB per project, 100 screens/audio tracks each, 10-minute reel duration, 30-minute processing timeout. Job URLs contain random access tokens: anyone with a result URL can download it until expiration. There is no user account isolation; put shared/public deployments behind authentication before exposing this worker to untrusted users.

The worker is bound to 127.0.0.1. Nginx proxies `/api/render/` directly with streaming uploads; Vite also proxies it for development. Internal render pages and assets are accessed directly by server Chromium, not exposed through the public API proxy.

UI verification: `ddev exec node scripts/check-server-export-ui.mjs` exercises upload, the export button, public API routing, and the completed download.

Verification: `ddev exec npm run test:server-export` checks actual full-resolution video/image exports, video decoding, trimmed looping audio, silent audio, decoded pixels, frame counts, codecs, duration, title metadata, and invalid project rejection.

Outside DDEV, install FFmpeg and Chromium, then run `npm run render:server`. Set `CHROME_PATH` if Chromium is not at `/usr/bin/chromium`, and `RENDER_PORT` if 5174 is unavailable. Configure your production reverse proxy for `/api/render/` as in the DDEV Nginx config.

Long-export regression: `ddev exec env RENDER_TEST_LONG=1 npm run test:server-export` also renders a 60-second, 1,800-frame video and checks decoded frames, duration, audio, and frame count.
