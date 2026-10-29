import { connectChromePage } from "./browser/chrome-debug.mjs";
import { createServer } from "vite";
import { spawn } from "node:child_process";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const client = await readFile(
  new URL("./browser/cinematic-check.js", import.meta.url),
  "utf8",
);
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
    "--remote-debugging-port=0",
    process.argv.includes("--mobile")
      ? "--window-size=390,844"
      : "--window-size=1440,1000",
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
let debug;
try {
  debug = await connectChromePage(profile);
  if (process.argv.includes("--mobile"))
    await debug.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
  const result = await done;
  if (result.passed) {
    await debug.send("Runtime.evaluate", {
      expression: "window.scrollTo(0,0)",
    });
    const shot = await debug.send("Page.captureScreenshot", { format: "png" });
    const path = process.argv.includes("--mobile")
      ? "/tmp/cinematic-mobile.png"
      : "/tmp/cinematic-desktop.png";
    await writeFile(path, Buffer.from(shot.data, "base64"));
    result.screenshot = path;
  }
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 1;
} finally {
  debug?.close();
  clearTimeout(timer);
  chrome.kill("SIGTERM");
  await new Promise((r) => chrome.once("exit", r));
  await server.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
