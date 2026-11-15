import { screenAspect } from "../src/screen-aspect.js";
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const started = Date.now();
const origin = process.env.RENDER_TEST_ORIGIN || 'http://127.0.0.1:5174';
const temp = await mkdtemp(join(tmpdir(), 'server-export-check-'));
async function api(path, options) {
  const response = await fetch(origin + '/api/render' + path, options);
  const result = await response.json(); assert.ok(response.ok, JSON.stringify(result)); return result;
}
async function run(project, assets, expectAudio) {
  const { id } = await api('/jobs', { method: 'POST' });
  for (const [item, file] of assets) {
    const { asset } = await api(`/jobs/${id}/assets`, { method: 'POST', body: await readFile(file) }); item.asset = asset;
  }
  await api(`/jobs/${id}/start`, { method: 'POST', body: JSON.stringify(project) });
  const deadline = Date.now() + (project.duration >= 60 ? 600000 : 120000);
  let status;
  do {
    await new Promise(resolve => setTimeout(resolve, 250));
    status = await api(`/jobs/${id}`);
    assert.notEqual(status.state, 'failed', status.message);
    assert.ok(Date.now() < deadline, 'Server export timed out');
  } while (status.state !== 'complete');
  const response = await fetch(origin + `/api/render/jobs/${id}/download`);
  assert.ok(response.ok); const output = join(temp, `${id}.mp4`); await writeFile(output, Buffer.from(await response.arrayBuffer()));
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', output]));
  const video = probe.streams.find(s => s.codec_type === 'video');
  const size = screenAspect(project.aspectRatio);
  assert.equal(video.width, size.exportWidth); assert.equal(video.height, size.exportHeight); assert.equal(video.codec_name, 'h264'); assert.equal(video.nb_frames, String(Math.ceil(project.duration * 30)));
  assert.equal(probe.streams.find(s => s.codec_type === 'audio').codec_name, 'aac');
  assert.ok(Math.abs(Number(probe.format.duration) - project.duration) < 0.1);
  assert.equal(probe.format.tags.title, project.title);
  // Check actual decoded center pixel, not just the container metadata.
  const pixel = execFileSync('ffmpeg', ['-v', 'error', '-i', output, '-vf', `crop=2:2:${size.exportWidth / 2}:${size.exportHeight / 2},scale=1:1`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  assert.ok(pixel[0] > 180 && pixel[2] < 60, `Unexpected rendered pixel: ${pixel}`);
  if (project.duration > 1.8) {
    const late = execFileSync('ffmpeg', ['-v', 'error', '-ss', '1.8', '-i', output, '-vf', `crop=2:2:${size.exportWidth / 2}:${size.exportHeight / 2},scale=1:1`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
    assert.ok(late[2] > 180 && late[0] < 60, `Source video did not advance to blue: ${late}`);
  }
  if (expectAudio !== undefined) {
    const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', output, '-map', '0:a:0', '-f', 's16le', '-ac', '1', '-'], { maxBuffer: Math.ceil(project.duration * 48000 * 2) + 1024 * 1024 });
    let peak = 0;
    for (let offset = 0; offset < pcm.length; offset += 2) peak = Math.max(peak, Math.abs(pcm.readInt16LE(offset)));
    assert.ok(expectAudio ? peak > 100 : peak === 0, `Unexpected audio peak: ${peak}`);
  }
  await api(`/jobs/${id}`, { method: 'DELETE' });
}
try {
  const source = join(temp, 'source.mp4'), audio = join(temp, 'tone.wav'), image = join(temp, 'image.png');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `color=c=red:s=${process.env.RENDER_TEST_SIZE || '360x640'}:r=30:d=1.5`, '-f', 'lavfi', '-i', `color=c=blue:s=${process.env.RENDER_TEST_SIZE || '360x640'}:r=30:d=1.5`, '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]', '-map', '[v]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', source]);
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.3', audio]);
  execFileSync('ffmpeg', ['-v', 'error', '-i', source, '-frames:v', '1', image]);
  const screen = { id: 1, mediaType: 'video', name: 'Test video', start: 0, end: 2.1, sourceDuration: 3, trimIn: 0.1, fit: 'contain' };
  const clip = { name: 'Test audio', start: 0.1, duration: 0.3, trimStart: 0.05, trimEnd: 0.05, repeatToEnd: true, volume: 0.5 };
  await run({ title: 'Server video test', duration: 2.1, screens: [screen], audioClips: [clip] }, [[screen, source], [clip, audio]]);
  const voiced = join(temp, 'voiced.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-i', source, '-f', 'lavfi', '-i', 'sine=frequency=660:duration=3', '-c:v', 'copy', '-c:a', 'aac', '-shortest', voiced]);
  for (const enabled of [true, false]) {
    const video = { ...screen, end: 0.3, useVideoAudio: enabled };
    await run({ title: `Video audio ${enabled}`, duration: 0.3, screens: [video], audioClips: [] }, [[video, voiced]], enabled);
  }
  const still = { id: 1, mediaType: 'image', start: 0, end: 0.2, fit: 'contain' };
  await run({ title: 'Server silent image test', duration: 0.2, screens: [still], audioClips: [] }, [[still, image]]);
  for (const aspectRatio of ['16:9', '4:5']) {
    await run({ title: `Ratio ${aspectRatio}`, aspectRatio, duration: 0.2, screens: [still], audioClips: [] }, [[still, image]], false);
  }
  if (process.env.RENDER_TEST_LONG) {
    const longSource = join(temp, 'long.mp4');
    execFileSync('ffmpeg', ['-v', 'error', '-stream_loop', '-1', '-i', source, '-t', '60', '-c', 'copy', longSource]);
    const longScreen = { ...screen, start: 0, end: 60, sourceDuration: 60, trimIn: 0, useVideoAudio: false };
    await run({ title: 'Long 1800 frame export', duration: 60, screens: [longScreen], audioClips: [] }, [[longScreen, longSource]], false);
  }
  const { id } = await api('/jobs', { method: 'POST' });
  const invalid = await fetch(origin + `/api/render/jobs/${id}/start`, { method: 'POST', body: JSON.stringify({ duration: -1 }) });
  assert.equal(invalid.status, 400); await api(`/jobs/${id}`, { method: 'DELETE' });
  console.log(`Elapsed: ${Date.now() - started}ms`);
  console.log('Passed: server video/image export, trimmed looping audio, silent audio, H.264/AAC, full resolution, frame count, duration, metadata, decoded pixels, invalid project rejection.');
} finally { await rm(temp, { recursive: true, force: true }); }
