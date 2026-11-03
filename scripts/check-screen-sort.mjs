import { createServer } from "vite";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const client = `
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async predicate=>{for(let i=0;i<400;i++){if(await predicate())return;await wait(50)}throw Error('Screen sorting check timed out')};
const row=id=>[...document.querySelectorAll('.screen-row')].find(item=>item.querySelector('.screen-fields strong').textContent.trim().startsWith(\`Screen \${id}\`));
const report=async result=>fetch('/__check-done',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(result)});
try{
 await until(()=>document.body.textContent.includes('Draft saved on this device'));
 const canvas=document.createElement('canvas');canvas.width=360;canvas.height=640;canvas.getContext('2d').fillStyle='red';canvas.getContext('2d').fillRect(0,0,360,640);
 const blob=await new Promise(resolve=>canvas.toBlob(resolve)),fileTransfer=new DataTransfer();fileTransfer.items.add(new File([blob],'screen.png',{type:'image/png'}));
 const upload=document.querySelector('[aria-label="Upload image or video for screen 1"]');upload.files=fileTransfer.files;upload.dispatchEvent(new Event('change',{bubbles:true}));
 await until(()=>document.querySelector('.screen-thumb img'));
 [...document.querySelectorAll('button')].find(button=>button.textContent.startsWith('Add screen')).click();
 await until(()=>document.querySelectorAll('.screen-row').length===2);

 const selectButton=row(2).querySelector('.screen-select-preview');selectButton.click();
 await until(()=>selectButton.getAttribute('aria-pressed')==='true');
 for(const source of [selectButton,row(1).querySelector('.screen-thumb img')]){
  const event=new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:new DataTransfer()});
  source.dispatchEvent(event);
  if(!event.defaultPrevented)throw Error('Only the drag handle should initiate screen reordering');
 }
 if(!row(1)||!row(2)||document.querySelector('.screen-row')!==row(1))throw Error('A non-handle drag changed screen order');

 const handle=row(1).querySelector('.screen-drag-handle'),transfer=new DataTransfer();
 handle.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer}));
 await wait(60);
 const target=row(2);
 target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:transfer}));
 target.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:transfer}));
 await until(()=>document.querySelector('.screen-row')===row(2));
 if(row(2).querySelector('.screen-select-preview').getAttribute('aria-pressed')!=='true')throw Error('Preview selection should stay attached to the screen after reordering');
 await report({passed:true,checks:['Selection remains attached after reorder','Only the grip starts screen reorder','Dragging screen content does not change order','Screen drag-and-drop reorder works']});
}catch(error){await report({passed:false,error:String(error.stack||error)})}
`;

let finish;
const done = new Promise((resolve) => (finish = resolve));
const profile = await mkdtemp(join(tmpdir(), "studio-screen-sort-"));
const server = await createServer({
  server: { host: "127.0.0.1", port: 0 },
  plugins: [
    {
      name: "screen-sort-browser-check",
      transformIndexHtml(html) {
        return html.replace(
          "</body>",
          '<script type="module" src="/__screen-sort-check.js"></script></body>',
        );
      },
      configureServer(vite) {
        vite.middlewares.use(async (req, res, next) => {
          if (req.url === "/__screen-sort-check.js") {
            res.setHeader("Content-Type", "text/javascript");
            res.end(client);
            return;
          }
          if (req.url === "/__check-done") {
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
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
    "--user-data-dir=" + profile,
    `http://127.0.0.1:${address.port}/screens`,
  ],
  { stdio: "ignore" },
);
const timer = setTimeout(
  () => finish({ passed: false, error: "Browser check timed out" }),
  120000,
);

try {
  const result = await done;
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 1;
} finally {
  clearTimeout(timer);
  chrome.kill("SIGTERM");
  await new Promise((resolve) => chrome.once("exit", resolve));
  await server.close();
  await rm(profile, { recursive: true, force: true });
}
