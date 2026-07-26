import express from "express";
import cors from "cors";

import { attachUser } from "@/middleware/auth";
import { authRouter } from "@/routes/auth";
import { generateRouter } from "@/routes/generate";
import { modelsRouter } from "@/routes/models";

/**
 * CORS: the frontend is the only browser client. FRONTEND_ORIGIN is
 * comma-separated so a Railway deploy can allow both the production domain and
 * a preview domain. Sessions travel as Authorization headers (not cookies), so
 * `credentials` stays off.
 */
function allowedOrigins(): string[] {
  return (process.env.FRONTEND_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function createApp() {
  const app = express();
  app.disable("x-powered-by");

  app.use(cors({ origin: allowedOrigins() }));
  app.use(express.json({ limit: "1mb" }));
  app.use(attachUser);

  // Pure liveness check for Railway's healthcheck. Intentionally does NOT touch
  // the database — a transient DB blip shouldn't cycle the whole service.
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/models", modelsRouter);
  app.use("/api/generate", generateRouter);

  // Malformed JSON from express.json() surfaces as a SyntaxError with a body —
  // map it to the same 400 envelope the old route returned.
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (err instanceof SyntaxError && "body" in err) {
        res
          .status(400)
          .json({ ok: false, code: "invalid_body", error: "Invalid JSON body" });
        return;
      }
      next(err);
    },
  );

  return app;
}
