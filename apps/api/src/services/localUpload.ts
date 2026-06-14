import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { config } from "../config.js";

fs.mkdirSync(config.uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, config.uploadDir);
  },
  filename: (_req, file, callback) => {
    const safeBase = path
      .basename(file.originalname, path.extname(file.originalname))
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
    const ext = path.extname(file.originalname).toLowerCase();
    callback(null, `${Date.now()}-${safeBase || "upload"}${ext}`);
  }
});

export const imageUpload = multer({
  storage,
  limits: {
    fileSize: 15 * 1024 * 1024
  },
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype.startsWith("image/")) {
      callback(new Error("Only image uploads are supported"));
      return;
    }

    callback(null, true);
  }
});

export const audioUpload = multer({
  storage,
  limits: {
    fileSize: 30 * 1024 * 1024
  },
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype.startsWith("audio/") && file.mimetype !== "video/webm") {
      callback(new Error("Only audio uploads are supported"));
      return;
    }

    callback(null, true);
  }
});

export function relativeUploadPath(filePath: string) {
  return path.relative(config.uploadDir, filePath);
}

export function absoluteUploadPath(relativePath: string) {
  return path.join(config.uploadDir, relativePath);
}
