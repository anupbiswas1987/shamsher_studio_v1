import { readFile } from "node:fs/promises";
import { join } from "node:path";
export async function connectChromePage(profile) {
  let port;
  for (let i = 0; i < 100; i++) {
    try {
      port = (
        await readFile(join(profile, "DevToolsActivePort"), "utf8")
      ).split("\n")[0];
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  if (!port) throw Error("Chrome debugging endpoint did not start");
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(),
    page = targets.find((t) => t.type === "page");
  if (!page) throw Error("Chrome test page missing");
  const ws = new WebSocket(page.webSocketDebuggerUrl),
    pending = new Map();
  let seq = 0;
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  ws.addEventListener("message", (event) => {
    const response = JSON.parse(event.data);
    const task = pending.get(response.id);
    if (task) {
      pending.delete(response.id);
      response.error
        ? task.reject(Error(response.error.message))
        : task.resolve(response.result);
    }
  });
  return {
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++seq;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    close() {
      ws.close();
    },
  };
}
