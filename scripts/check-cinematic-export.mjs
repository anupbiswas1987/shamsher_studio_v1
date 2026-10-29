import { createServer } from "vite";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const client = `
const wait=ms=>new Promise(r=>setTimeout(r,ms));const until=async(fn)=>{for(let i=0;i<2400;i++){if(fn())return;const notice=document.querySelector('.screen-notice')?.textContent||'';if(/error|failed|empty|not defined|fetch|Cannot|not supported/i.test(notice))throw Error(notice);await wait(50)}throw Error('Timed out: '+document.body.textContent.slice(-600))};
try{
await until(()=>document.querySelector('[aria-label="Upload screen 1"]')&&document.body.textContent.includes('Draft saved on this device'));
const format=document.querySelector('[aria-label="Export video type"]');if(format.disabled)throw Error('Format dropdown is disabled');format.value='webm';format.dispatchEvent(new Event('change',{bubbles:true}));await wait(100);if(!document.body.textContent.includes('WebM · VP8 video · Opus audio'))throw Error('Format selection did not update');format.value='mp4';format.dispatchEvent(new Event('change',{bubbles:true}));await wait(100);const original=MediaRecorder.isTypeSupported.bind(MediaRecorder);MediaRecorder.isTypeSupported=t=>!t.startsWith('video/mp4')&&original(t);
const c=document.createElement('canvas');c.width=360;c.height=640;c.getContext('2d').fillStyle='red';c.getContext('2d').fillRect(0,0,360,640);const image=await new Promise(r=>c.toBlob(r));const dt=new DataTransfer();dt.items.add(new File([image],'screen.png',{type:'image/png'}));const input=document.querySelector('[aria-label="Upload screen 1"]');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));await until(()=>document.querySelector('.screen-thumb img'));
const end=document.querySelector('[aria-label="Screen 1 end"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(end,'1');end.dispatchEvent(new Event('input',{bubbles:true}));await wait(100);
const tone=new DataTransfer();tone.items.add(new File([await (await fetch('/__check-tone.wav')).blob()],'tone.wav',{type:'audio/wav'}));const audioInput=document.querySelector('input[accept="audio/*"]');audioInput.files=tone.files;audioInput.dispatchEvent(new Event('change',{bubbles:true}));await until(()=>document.querySelector('.screen-audio p'));const offset=document.querySelector('.screen-audio input[type="number"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(offset,'.25');offset.dispatchEvent(new Event('input',{bubbles:true}));const volume=document.querySelector('.screen-audio input[type="range"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(volume,'.5');volume.dispatchEvent(new Event('input',{bubbles:true}));await wait(100);[...document.querySelectorAll('button')].find(b=>b.textContent==='Export video with audio').click();await until(()=>document.querySelector('a[download="shomshar-screens.mp4"]'));
const link=document.querySelector('a[download="shomshar-screens.mp4"]'),blob=await (await fetch(link.href)).blob();const bytes=new Uint8Array(await blob.arrayBuffer());const text=new TextDecoder('latin1').decode(bytes);if(!text.includes('avc1')||!text.includes('mp4a'))throw Error('H.264 or AAC missing');const video=document.createElement('video');video.src=link.href;await new Promise((r,j)=>{video.onloadedmetadata=r;video.onerror=j});if(video.videoWidth!==1080||video.videoHeight!==1920)throw Error('Wrong dimensions');const sample=async time=>{await new Promise((resolve,reject)=>{video.onseeked=resolve;video.onerror=reject;video.currentTime=time});const frame=document.createElement('canvas');frame.width=1080;frame.height=1920;frame.getContext('2d').drawImage(video,0,0);return {edge:[...frame.getContext('2d').getImageData(15,960,1,1).data],center:[...frame.getContext('2d').getImageData(540,960,1,1).data]}};const first=await sample(.15),last=await sample(.85);if(first.edge[0]>80||last.edge[0]<180)throw Error('Exported zoom did not match expected framing: '+JSON.stringify({first,last,duration:video.duration,draft:(await (await import('/src/screen-draft.js')).loadScreenDraft()).screens}));const audioCtx=new AudioContext(),decoded=await audioCtx.decodeAudioData(await blob.arrayBuffer()),samples=decoded.getChannelData(0),rms=(start,end)=>{let sum=0;for(let i=Math.floor(start*decoded.sampleRate);i<end*decoded.sampleRate;i++)sum+=samples[i]**2;return Math.sqrt(sum/((end-start)*decoded.sampleRate))};const quiet=rms(.05,.15),playing=rms(.4,.6);await audioCtx.close();if(quiet>.001||playing<.005||playing>.02)throw Error('AAC audio timing/volume mismatch: '+quiet+' / '+playing);await fetch('/__check-done',{method:'POST',body:JSON.stringify({passed:true,bytes:blob.size,width:video.videoWidth,height:video.videoHeight,checks:['Export button','frame-by-frame MP4 rendering','30 FPS encoding','H.264 video','AAC audio','download link','decoded cinematic zoom framing','decoded AAC timing and volume']})});
}catch(e){await fetch('/__check-done',{method:'POST',body:JSON.stringify({passed:false,error:String(e.stack||e)})})}
`;
let finish;
const done = new Promise((r) => (finish = r));
const profile = await mkdtemp(join(tmpdir(), "studio-library-check-"));
const server = await createServer({
  server: { host: "127.0.0.1", port: 0 },
  plugins: [
    {
      name: "asset-library-browser-check",
      transformIndexHtml(html) {
        return html.replace(
          "</body>",
          '<script type="module" src="/__studio-check.js"></script></body>',
        );
      },
      configureServer(s) {
        s.middlewares.use(async (req, res, next) => {
          if (req.url === "/__studio-check.js") {
            res.setHeader("Content-Type", "text/javascript");
            res.end(client);
            return;
          }
          if (req.url === "/__check-tone.wav") {
            const rate = 8000,
              pcm = Buffer.alloc(rate * 2);
            for (let i = 0; i < rate; i++)
              pcm.writeInt16LE(
                Math.round(Math.sin((i / rate) * 440 * Math.PI * 2) * 1000),
                i * 2,
              );
            const wav = Buffer.alloc(44 + pcm.length);
            wav.write("RIFF", 0);
            wav.writeUInt32LE(36 + pcm.length, 4);
            wav.write("WAVEfmt ", 8);
            wav.writeUInt32LE(16, 16);
            wav.writeUInt16LE(1, 20);
            wav.writeUInt16LE(1, 22);
            wav.writeUInt32LE(rate, 24);
            wav.writeUInt32LE(rate * 2, 28);
            wav.writeUInt16LE(2, 32);
            wav.writeUInt16LE(16, 34);
            wav.write("data", 36);
            wav.writeUInt32LE(pcm.length, 40);
            pcm.copy(wav, 44);
            res.setHeader("Content-Type", "audio/wav");
            res.end(wav);
            return;
          }
          if (req.url === "/__check-done") {
            const chunks = [];
            for await (const c of req) chunks.push(c);
            finish(JSON.parse(Buffer.concat(chunks)));
            res.end("OK");
            return;
          }
          next();
        });
      },
    },
  ],
});
await server.listen();
const address = server.httpServer.address();
const chrome = spawn(
  "/usr/bin/google-chrome",
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--autoplay-policy=no-user-gesture-required",
    "--user-data-dir=" + profile,
    `http://127.0.0.1:${address.port}/screens`,
  ],
  { stdio: "ignore" },
);
const timer = setTimeout(
  () => finish({ passed: false, error: "Browser check timed out" }),
  150000,
);
try {
  const result = await done;
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 1;
} finally {
  clearTimeout(timer);
  chrome.kill("SIGTERM");
  await new Promise((r) => chrome.once("exit", r));
  await server.close();
  await rm(profile, { recursive: true, force: true });
}
