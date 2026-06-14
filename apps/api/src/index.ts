import "dotenv/config";
import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { getDb } from "./db/index.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { kanjiRouter } from "./routes/kanji.js";
import { knowledgeRouter } from "./routes/knowledge.js";
import { ocrRouter } from "./routes/ocr.js";
import { profileRouter } from "./routes/profile.js";
import { recognizeRouter } from "./routes/recognize.js";
import { resourcesRouter } from "./routes/resources.js";
import { speechRouter } from "./routes/speech.js";
import { wordsRouter } from "./routes/words.js";
import { errorHandler } from "./lib/http.js";

const app = express();
const allowedOrigins = new Set(config.allowedOrigins);

app.use((req, res, next) => {
  const origin = req.get("origin");
  if (!origin || allowedOrigins.has(origin)) {
    next();
    return;
  }

  res.status(403).json({ error: "Origin is not allowed for the local API" });
});

app.use(
  cors({
    origin(origin, callback) {
      callback(null, !origin || allowedOrigins.has(origin));
    }
  })
);
app.use(express.json({ limit: "2mb" }));

if (config.enableRequestLogging) {
  app.use((req, _res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

app.get("/health", (_req, res) => {
  getDb();
  res.json({
    status: "ok",
    mode: "local-first",
    database: "sqlite",
    storage: "local"
  });
});

app.use("/uploads", express.static(config.uploadDir));
app.use("/api/dashboard", dashboardRouter);
app.use("/api/kanji", kanjiRouter);
app.use("/api/knowledge", knowledgeRouter);
app.use("/api/local/profile", profileRouter);
app.use("/api/ocr", ocrRouter);
app.use("/api/recognize", recognizeRouter);
app.use("/api/resources", resourcesRouter);
app.use("/api/speech", speechRouter);
app.use("/api/words", wordsRouter);
app.use(errorHandler);

app.listen(config.port, config.host, () => {
  getDb();
  console.log(`Local API listening at http://${config.host}:${config.port}`);
});
