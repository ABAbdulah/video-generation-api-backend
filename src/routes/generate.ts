import { Router } from "express";

import { handleGenerate } from "@/lib/generation/handler";

export const generateRouter = Router();

// Auth is enforced inside the handler (step 1) rather than by requireAuth, so
// the response keeps the machine-readable { code: "unauthorized" } envelope
// the frontend branches on.
generateRouter.post("/", async (req, res) => {
  const result = await handleGenerate(req.userId, req.body);
  res.status(result.status).json(result.body);
});
