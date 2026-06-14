import { Router } from "express";
import { z } from "zod";
import { getDb, touchNow } from "../db/index.js";
import { asyncHandler } from "../lib/http.js";

const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(120)
});

export const profileRouter = Router();

profileRouter.get(
  "/",
  asyncHandler((_req, res) => {
    const profile = getDb().prepare("SELECT * FROM app_profile WHERE id = 1").get();
    res.json({ profile });
  })
);

profileRouter.put(
  "/",
  asyncHandler((req, res) => {
    const body = updateProfileSchema.parse(req.body);
    const updatedAt = touchNow();
    getDb()
      .prepare("UPDATE app_profile SET display_name = ?, updated_at = ? WHERE id = 1")
      .run(body.displayName, updatedAt);

    const profile = getDb().prepare("SELECT * FROM app_profile WHERE id = 1").get();
    res.json({ profile });
  })
);
