import { videoAudioClips } from "../src/screen-video-audio.js";
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, readdir, stat } from 'node:fs/promises';
import { createWriteStream, createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
import { once } from 'node:events';
import { resolve, join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { reelMetadataArgs, reelFilename } from '../src/screen-export.js';

const port = Number(process.env.RENDER_PORT || 5174);
const root = resolve(import.meta.dirname, '..');
const storage = process.env.RENDER_STORAGE ? resolve(process.env.RENDER_STORAGE) : resolve(root, '.render-jobs');
const jobs = new Map();
const queue = [];
let active = false;
const retention = 24 * 60 * 60 * 1000;
const token = () => randomBytes(24).toString('hex');
const json = (res, code, value) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
async function body(req, limit) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw Error('Request exceeds size limit'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
function validate(project, job) {
  if (!Number.isFinite(project.duration) || project.duration <= 0 || project.duration > 600) throw Error('Server export supports reels up to 10 minutes');
  if (!Array.isArray(project.screens) || project.screens.length > 100 || !Array.isArray(project.audioClips) || project.audioClips.length > 100) throw Error('Invalid project layers');
  for (const item of [...project.screens, ...project.audioClips]) {
    if (item.asset && !job.assets.has(item.asset)) throw Error('Unknown uploaded asset');
    if (!Number.isFinite(item.start) || item.start < 0) throw Error('Invalid layer start');
  }
  for (const screen of project.screens) if (!Number.isFinite(screen.end) || screen.end <= screen.start) throw Error('Invalid screen timing');
  for (const clip of project.audioClips) {
    if (!clip.asset || !Number.isFinite(clip.duration) || clip.duration <= (clip.trimStart || 0) + (clip.trimEnd || 0)) throw Error('Invalid audio duration');
    for (const key of ['trimStart', 'trimEnd', 'volume']) if (clip[key] != null && (!Number.isFinite(clip[key]) || clip[key] < 0)) throw Error('Invalid audio settings');
  }
}
function command(args) {
  const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['pipe', 'ignore', 'pipe'] });
  let errors = '';
  child.stderr.on('data', chunk => { errors = (errors + chunk).slice(-4000); });
  child.stdin.on('error', () => {});
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(Error(`FFmpeg failed (${code}): ${errors}`)));
  });
  done.catch(() => {});
  return { child, done };
}
// Read exactly one uncompressed source frame per request. Backpressure keeps
// FFmpeg from decoding the whole video into memory while canvas catches up.
async function* rawFrames(stream, size) {
  let chunks = [], length = 0;
  for await (const chunk of stream) {
    let offset = 0;
    while (offset < chunk.length) {
      const take = Math.min(size - length, chunk.length - offset);
      chunks.push(chunk.subarray(offset, offset + take));
      length += take; offset += take;
      if (length === size) {
        yield Buffer.concat(chunks, size);
        chunks = []; length = 0;
      }
    }
  }
  if (length) throw Error('Incomplete decoded source frame');
}
async function prepareDecoders(job) {
  job.decoders = new Map();
  for (const screen of job.project.screens) {
    if (!screen.asset || screen.mediaType !== 'video') continue;
    const file = join(job.dir, screen.asset);
    const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:stream_side_data=rotation', '-of', 'json', file]);
    const info = JSON.parse(stdout).streams[0];
    if (!info || info.width > 8192 || info.height > 8192) throw Error('Unsupported source video dimensions');
    const rotation = info.side_data_list?.find(data => data.rotation != null)?.rotation || 0;
    const swap = Math.abs(rotation) % 180 === 90;
    screen.renderWidth = swap ? info.height : info.width;
    screen.renderHeight = swap ? info.width : info.height;
    const firstTime = Math.ceil(screen.start * 30) / 30;
    const offset = (screen.trimIn || 0) + firstTime - screen.start;
    job.decoders.set(screen.asset, { screen, file, offset });
  }
}
async function nextSourceFrame(job, asset) {
  const decoder = job.decoders?.get(asset);
  if (!decoder) throw Error('Source decoder is unavailable');
  if (!decoder.child) {
    const { screen } = decoder;
    const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-threads', '2', '-ss', String(decoder.offset), '-i', decoder.file, '-an', '-vf', 'fps=30', '-pix_fmt', 'rgba', '-f', 'rawvideo', 'pipe:1'], { stdio: ['ignore', 'pipe', 'pipe'] });
    decoder.child = child;
    decoder.error = '';
    child.stderr.on('data', chunk => { decoder.error = (decoder.error + chunk).slice(-2000); });
    child.on('error', error => { decoder.error = error.message; child.stdout.destroy(error); });
    decoder.iterator = rawFrames(child.stdout, screen.renderWidth * screen.renderHeight * 4);
  }
  const { value, done } = await decoder.iterator.next();
  if (done) {
    if (decoder.error) throw Error(decoder.error);
    if (!decoder.lastFrame) throw Error('Source video contains no decodable frames');
    return decoder.lastFrame;
  }
  decoder.lastFrame = value;
  return value;
}
async function render(job) {
  const project = job.project;
  let browser, encoder;
  const timeout = setTimeout(() => { job.expired = true; browser?.close().catch(() => {}); encoder?.child.kill('SIGKILL'); }, 30 * 60 * 1000);
  try {
    job.state = 'rendering'; job.message = 'Preparing sequential video decoders…';
    await prepareDecoders(job);
    job.message = 'Starting server renderer…';
    encoder = command(['-f', 'image2pipe', '-framerate', '30', '-vcodec', 'mjpeg', '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-threads', '2', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', join(job.dir, 'video.mp4')]);
    job.encoder = encoder;
    browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', headless: true, protocolTimeout: 31 * 60 * 1000, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling'] });
    const page = await browser.newPage();
    // Transfer frames over the existing browser connection, avoiding thousands
    // of loopback HTTP requests and retained Fetch response bodies on long reels.
    await page.exposeFunction('writeRenderedFrame', async (encoded) => {
      if (encoder.child.stdin.destroyed) throw Error('Native encoder stopped');
      const frame = Buffer.from(encoded, 'base64');
      if (!encoder.child.stdin.write(frame)) await Promise.race([
        once(encoder.child.stdin, 'drain'),
        encoder.done.then(() => { throw Error('Encoder stopped before rendering finished'); }),
      ]);
      job.frameStarted ||= Date.now();
      job.frames = (job.frames || 0) + 1;
      job.message = `Server rendering frame ${job.frames}/${Math.ceil(project.duration * 30)} · ${Math.round(job.frames / Math.ceil(project.duration * 30) * 100)}% · ${(job.frames / Math.max(0.001, (Date.now() - job.frameStarted) / 1000)).toFixed(1)} fps`;
    });
    page.setDefaultTimeout(120000);
    const base = `http://127.0.0.1:${port}/internal/${job.id}`;
    await page.goto(`${base}/page`);
    await page.waitForFunction(() => typeof window.renderProject === 'function');
    const profile = await page.evaluate((project, base) => window.renderProject(project, base), project, base);
    console.log(`Render ${job.id}: ${JSON.stringify(profile)}`);
    encoder.child.stdin.end();
    await encoder.done;
    delete job.encoder;
    await browser.close(); browser = null;
    job.message = 'Mixing audio and finalizing MP4…';
    const sourceAudio = [];
    for (const clip of videoAudioClips(project.screens)) {
      const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=index', '-of', 'json', join(job.dir, clip.asset)]);
      if (JSON.parse(stdout).streams?.length) sourceAudio.push(clip);
    }
    const clips = [...project.audioClips, ...sourceAudio].filter(clip => clip.start < project.duration);
    const args = ['-i', join(job.dir, 'video.mp4')];
    for (const clip of clips) args.push('-i', join(job.dir, clip.asset));
    const filters = clips.map((clip, index) => {
      const start = clip.trimStart || 0;
      const end = clip.duration - (clip.trimEnd || 0);
      const samples = Math.max(1, Math.round((end - start) * 48000));
      return `[${index + 1}:a]aresample=48000,atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS${clip.repeatToEnd ? `,aloop=loop=-1:size=${samples}` : ''},atrim=duration=${project.duration - clip.start},volume=${clip.volume ?? 1},adelay=${Math.round(clip.start * 1000)}:all=1[a${index}]`;
    });
    if (clips.length) {
      filters.push(`${clips.map((_, i) => `[a${i}]`).join('')}amix=inputs=${clips.length}:normalize=0,apad[audio]`);
      args.push('-filter_complex', filters.join(';'), '-map', '0:v:0', '-map', '[audio]');
    } else {
      args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-map', '0:v:0', '-map', '1:a:0');
    }
    args.push('-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', String(project.duration), ...reelMetadataArgs(project.title), '-movflags', '+faststart', join(job.dir, 'reel.mp4'));
    encoder = command(args); encoder.child.stdin.end(); await encoder.done;
    if (job.expired) throw Error('Server render exceeded its time limit');
    job.state = 'complete'; job.message = 'Server MP4 ready';
  } catch (error) {
    job.state = 'failed'; job.message = `Server export failed: ${error.message}`;
    console.error(job.id, error);
  } finally {
    clearTimeout(timeout);
    for (const decoder of job.decoders?.values() || []) decoder.child?.kill('SIGTERM');
    delete job.decoders;
    encoder?.child.kill('SIGTERM'); delete job.encoder;
    await browser?.close().catch(() => {});
    for (const asset of job.assets) await rm(join(job.dir, asset), { force: true });
    await rm(join(job.dir, 'video.mp4'), { force: true });
    job.finished = Date.now();
  }
}
async function pump() {
  if (active) return;
  active = true;
  try { while (queue.length) { const job = queue.shift(); if (jobs.has(job.id)) await render(job); } }
  finally { active = false; }
}
await mkdir(storage, { recursive: true });
// Jobs are temporary. Remove orphaned files left by a previous worker process.
for (const name of await readdir(storage)) await rm(join(storage, name), { recursive: true, force: true });
setInterval(async () => {
  for (const [id, job] of jobs) if (!['queued', 'rendering'].includes(job.state) && Date.now() - (job.finished || job.created) > retention) {
    jobs.delete(id); await rm(job.dir, { recursive: true, force: true }).catch(console.error);
  }
}, 60000).unref();
const server = http.createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path.startsWith('/renderer/') && req.method === 'GET') {
      const name = path.slice('/renderer/'.length);
      if (!['cinematic.js', 'video-frame.js', 'screen-aspect.js'].includes(name)) return json(res, 404, { error: 'Not found' });
      res.setHeader('Content-Type', 'text/javascript'); return res.end(await readFile(join(root, 'src', name)));
    }
    const internal = path.match(/^\/internal\/([a-f0-9]{48})\/(page|frame|(?:assets|sources)\/([a-f0-9]{48}))$/);
    if (internal) {
      const job = jobs.get(internal[1]);
      if (!job || job.state !== 'rendering') return json(res, 404, { error: 'Render unavailable' });
      if (internal[2] === 'page' && req.method === 'GET') {
        res.setHeader('Content-Type', 'text/html');
        return res.end(`<meta charset="utf-8"><script type="module">${await readFile(join(root, 'server/render-page.js'), 'utf8')}</script>`);
      }
      if (internal[2].startsWith('sources/') && req.method === 'GET') {
        const frame = await nextSourceFrame(job, internal[3]);
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': frame.length, 'Cache-Control': 'no-store' });
        return res.end(frame);
      }
      if (internal[3] && job.assets.has(internal[3]) && req.method === 'GET') {
        const file = join(job.dir, internal[3]); const info = await stat(file);
        const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
        if (range) {
          const start = Number(range[1]), end = Math.min(Number(range[2] || info.size - 1), info.size - 1);
          if (start > end) { res.writeHead(416); return res.end(); }
          res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${info.size}`, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes' });
          return createReadStream(file, { start, end }).pipe(res);
        }
        res.writeHead(200, { 'Content-Length': info.size, 'Accept-Ranges': 'bytes' }); return createReadStream(file).pipe(res);
      }
      if (internal[2] === 'frame' && req.method === 'POST' && job.encoder) {
        const frame = await body(req, 16 * 1024 * 1024);
        if (job.encoder.child.stdin.destroyed) throw Error('Native encoder stopped');
        if (!job.encoder.child.stdin.write(frame)) await Promise.race([once(job.encoder.child.stdin, 'drain'), job.encoder.done.then(() => { throw Error('Encoder stopped before rendering finished'); })]);
        job.frameStarted ||= Date.now();
        job.frames = (job.frames || 0) + 1;
        job.message = `Server rendering frame ${job.frames}/${Math.ceil(job.project.duration * 30)} · ${Math.round(job.frames / Math.ceil(job.project.duration * 30) * 100)}% · ${(job.frames / Math.max(0.001, (Date.now() - job.frameStarted) / 1000)).toFixed(1)} fps`;
        return json(res, 200, { ok: true });
      }
      return json(res, 404, { error: 'Not found' });
    }
    if (path === '/api/render/jobs' && req.method === 'POST') {
      if (jobs.size >= 50) throw Error('Render storage is busy. Try again later.');
      const id = token(), dir = join(storage, id); await mkdir(dir);
      jobs.set(id, { id, dir, state: 'uploading', message: 'Uploading media…', assets: new Set(), bytes: 0, created: Date.now() });
      return json(res, 201, { id });
    }
    const match = path.match(/^\/api\/render\/jobs\/([a-f0-9]{48})(?:\/(assets|start|download))?$/);
    const job = match && jobs.get(match[1]);
    if (!job) return json(res, 404, { error: 'Render job not found or expired' });
    if (!match[2] && req.method === 'GET') return json(res, 200, { state: job.state, message: job.message });
    if (!match[2] && req.method === 'DELETE' && job.state !== 'rendering') { jobs.delete(job.id); await rm(job.dir, { recursive: true, force: true }); return json(res, 200, { ok: true }); }
    if (match[2] === 'assets' && req.method === 'POST' && job.state === 'uploading') {
      const asset = token(); let size = 0;
      const limiter = new Transform({ transform(chunk, encoding, callback) { size += chunk.length; job.bytes += chunk.length; callback(size > 512 * 1024 * 1024 || job.bytes > 2 * 1024 ** 3 ? Error('Upload exceeds 512 MB per file or 2 GB per project') : null, chunk); } });
      try { await pipeline(req, limiter, createWriteStream(join(job.dir, asset))); job.assets.add(asset); }
      catch (error) { await rm(join(job.dir, asset), { force: true }); throw error; }
      return json(res, 201, { asset });
    }
    if (match[2] === 'start' && req.method === 'POST' && job.state === 'uploading') {
      const project = JSON.parse(await body(req, 2 * 1024 * 1024)); validate(project, job);
      job.project = project; job.state = 'queued'; job.message = 'Queued for server rendering…'; queue.push(job);
      json(res, 202, { ok: true }); void pump(); return;
    }
    if (match[2] === 'download' && req.method === 'GET' && job.state === 'complete') {
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(reelFilename(job.project.title))}`, 'Content-Length': (await stat(join(job.dir, 'reel.mp4'))).size });
      return createReadStream(join(job.dir, 'reel.mp4')).pipe(res);
    }
    json(res, 409, { error: 'Operation unavailable for this render job' });
  } catch (error) { if (!res.headersSent && !res.destroyed) json(res, 400, { error: error.message }); else res.destroy(); }
});
server.requestTimeout = 30 * 60 * 1000;
server.listen(port, '127.0.0.1', () => console.log(`Render worker listening on ${port}`));
