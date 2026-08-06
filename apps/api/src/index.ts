import "dotenv/config";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { getDb } from "./db/index.js";
import { reconcileImportJobs } from "./services/importJobs.js";

getDb();
const interruptedJobs = reconcileImportJobs();
if (interruptedJobs > 0) {
  console.warn(`Marked ${interruptedJobs} unfinished import job(s) as interrupted`);
}

createApp().listen(config.port, config.host, () => {
  console.log(`Local API listening at http://${config.host}:${config.port}`);
});
