import { Router } from "express";
import { z } from "zod";
import { asyncHandler, HttpError } from "../lib/http.js";
import { createImportJob, getImportJob, listImportJobs } from "../services/importJobs.js";

const importJobSchema = z.object({
  jobType: z.enum(["starter_data", "kanjidic2", "jmdict", "sentence_examples", "kanji_graph"]),
  inputPath: z.string().trim().min(1).max(2000).optional(),
  source: z.string().trim().min(1).max(120).optional(),
  limit: z.number().int().min(1).max(1000000).optional(),
  maxEdges: z.number().int().min(1).max(200).optional(),
  maxGroupSize: z.number().int().min(2).max(2000).optional()
});

export const importsRouter = Router();

importsRouter.get(
  "/jobs",
  asyncHandler((req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 20) || 20, 1), 100);
    res.json({ items: listImportJobs(limit) });
  })
);

importsRouter.get(
  "/jobs/:id",
  asyncHandler((req, res) => {
    const job = getImportJob(Number(req.params.id));
    if (!job) {
      throw new HttpError(404, "Import job not found");
    }

    res.json({ job });
  })
);

importsRouter.post(
  "/jobs",
  asyncHandler((req, res) => {
    const body = importJobSchema.parse(req.body);
    if (body.jobType !== "kanji_graph" && body.jobType !== "starter_data" && !body.inputPath) {
      throw new HttpError(400, "inputPath is required for dataset import jobs");
    }

    const job = createImportJob({
      jobType: body.jobType,
      inputPath: body.inputPath,
      source: body.source,
      limit: body.limit,
      maxEdges: body.maxEdges,
      maxGroupSize: body.maxGroupSize
    });

    res.status(202).json({ job });
  })
);
