import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "../config.js";
import { migrate } from "./schema.js";

let db: Database.Database | undefined;

export function getDb() {
  if (!db) {
    fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
    db = new Database(config.databasePath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    migrate(db);
  }

  return db;
}

export function closeDb() {
  db?.close();
  db = undefined;
}

export function readJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value.length === 0) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(value: unknown): string {
  return JSON.stringify(value ?? []);
}

export function touchNow() {
  return new Date().toISOString();
}
