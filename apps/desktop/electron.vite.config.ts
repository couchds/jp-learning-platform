import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

const desktopDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: path.join(desktopDir, "out/main"),
      rollupOptions: {
        input: path.join(desktopDir, "src/main.ts")
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: path.join(desktopDir, "out/preload"),
      rollupOptions: {
        input: path.join(desktopDir, "src/preload.ts")
      }
    }
  },
  renderer: {
    root: path.resolve(desktopDir, "../web"),
    base: "./",
    plugins: [react()],
    build: {
      outDir: path.join(desktopDir, "out/renderer"),
      rollupOptions: {
        input: path.resolve(desktopDir, "../web/index.html")
      }
    }
  }
});
