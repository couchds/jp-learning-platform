import path from "node:path";

export type DesktopRuntimePaths = ReturnType<typeof resolveDesktopRuntimePaths>;

export function resolveDesktopRuntimePaths(options: {
  appPath: string;
  userDataPath: string;
  resourcesPath: string;
  isPackaged: boolean;
}) {
  const resourceRoot = options.isPackaged
    ? options.resourcesPath
    : path.resolve(options.appPath, "../..");
  const dataRoot = path.join(options.userDataPath, "data");

  return {
    resourceRoot,
    dataRoot,
    databasePath: path.join(dataRoot, "app.sqlite"),
    importDir: path.join(dataRoot, "imports"),
    uploadDir: path.join(dataRoot, "uploads"),
    backupDir: path.join(dataRoot, "backups"),
    logDir: path.join(options.userDataPath, "logs"),
    commandFile: path.join(options.userDataPath, "overlay-command.json")
  };
}
