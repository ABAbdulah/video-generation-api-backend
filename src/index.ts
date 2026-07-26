// Load .env.local before anything imports lib/db (which reads DATABASE_URL at
// import time). No-ops silently when the file is absent (Railway injects env
// vars directly).
import { config } from "dotenv";
config({ path: ".env.local" });

const { createApp } = await import("@/app");
const { startRenderWorker } = await import("@/render/worker");

const port = Number(process.env.PORT ?? 4000);

createApp().listen(port, () => {
  console.log(`genvideo-backend listening on :${port}`);
  startRenderWorker();
});
