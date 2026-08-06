import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { closeDb, getDb } from "./db/index.js";
import { reconcileImportJobs } from "./services/importJobs.js";

export type RunningApiServer = {
  server: Server;
  host: string;
  port: number;
  url: string;
  close: () => Promise<void>;
};

export async function startApiServer(options: { host?: string; port?: number } = {}): Promise<RunningApiServer> {
  getDb();
  const interruptedJobs = reconcileImportJobs();
  if (interruptedJobs > 0) {
    console.warn(`Marked ${interruptedJobs} unfinished import job(s) as interrupted`);
  }

  const host = options.host ?? config.host;
  const requestedPort = options.port ?? config.port;
  const server = createApp().listen(requestedPort, host);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  const address = server.address() as AddressInfo;
  config.port = address.port;
  const url = `http://${host}:${address.port}`;
  console.log(`Local API listening at ${url}`);

  return {
    server,
    host,
    port: address.port,
    url,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => {
        closeDb();
        if (error) reject(error);
        else resolve();
      });
    })
  };
}
