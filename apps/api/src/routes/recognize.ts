import { Router } from "express";
import { config } from "../config.js";
import { asyncHandler } from "../lib/http.js";
import { getJson, postJson } from "../services/serviceProxy.js";

export const recognizeRouter = Router();

recognizeRouter.get(
  "/health",
  asyncHandler(async (_req, res) => {
    try {
      const health = await getJson<unknown>(`${config.recognitionServiceUrl}/health`);
      res.json({ service: "recognition", url: config.recognitionServiceUrl, health });
    } catch (error) {
      res.status(503).json({
        service: "recognition",
        url: config.recognitionServiceUrl,
        available: false,
        error: error instanceof Error ? error.message : "Recognition service unavailable"
      });
    }
  })
);

recognizeRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const result = await postJson<unknown>(`${config.recognitionServiceUrl}/recognize`, req.body);
    res.json(result);
  })
);
