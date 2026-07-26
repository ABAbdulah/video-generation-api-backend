import { Router } from "express";

import { getPublicModels } from "@/lib/ai/models";

export const modelsRouter = Router();

// Public on purpose: PublicModel is the client-safe DTO (label, description,
// credit cost, required plan) with model ids and providers already stripped —
// the same list the pricing/editor UI shows before sign-in.
modelsRouter.get("/", (_req, res) => {
  res.json({ models: getPublicModels() });
});
