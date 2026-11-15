import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const temp = await mkdtemp(join(tmpdir(), 'server-export-ui-'));
let browser;
try {
  const source = join(temp, 'red.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=360x640:r=30', '-t', '0.3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', source]);
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.goto(process.env.RENDER_UI_ORIGIN || 'http://127.0.0.1');
  await page.waitForSelector('[aria-label="Upload image or video for screen 1"]');
  await (await page.$('[aria-label="Upload image or video for screen 1"]')).uploadFile(source);
  await page.waitForSelector('.screen-thumb video');
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Export video with audio' && !b.disabled));
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Export video with audio').click());
  await page.waitForFunction(() => document.querySelector('a[download="shomshar-screens.mp4"]') || document.querySelector('.screen-notice-error'), { timeout: 120000 });
  const result = await page.evaluate(async () => {
    const error = document.querySelector('.screen-notice-error');
    if (error) throw Error(error.textContent);
    const link = document.querySelector('a[download="shomshar-screens.mp4"]');
    const response = await fetch(link.href);
    return { href: link.getAttribute('href'), status: response.status, type: response.headers.get('content-type'), bytes: (await response.blob()).size };
  });
  assert.match(result.href, /^\/api\/render\/jobs\/[a-f0-9]{48}\/download$/);
  assert.equal(result.status, 200); assert.equal(result.type, 'video/mp4'); assert.ok(result.bytes > 1000);
  const id = result.href.split('/')[4];
  await page.evaluate(id => fetch(`/api/render/jobs/${id}`, { method: 'DELETE' }), id);
  console.log('Passed: upload video in app, export button, server job, public proxy, MP4 download link and file.', result);
} finally { await browser?.close(); await rm(temp, { recursive: true, force: true }); }
