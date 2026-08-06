import { useEffect, useState } from "react";
import { Archive, RotateCcw, Trash2 } from "lucide-react";
import { api } from "../api";
import { useAsyncTask } from "../hooks/useAsyncTask";
import type { Backup } from "../types";

export function BackupPanel() {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [orphans, setOrphans] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const task = useAsyncTask();
  useEffect(() => { void refresh(); }, []);
  async function refresh() {
    setLoading(true);
    const [backupResult, orphanResult] = await Promise.allSettled([api.backups(), api.orphanUploads()]);
    if (backupResult.status === "fulfilled") setBackups(backupResult.value.items);
    if (orphanResult.status === "fulfilled") setOrphans(orphanResult.value.items);
    setLoading(false);
  }
  async function create() {
    const result = await task.run(api.createBackup);
    if (result) await refresh();
  }
  async function restore(backup: Backup) {
    if (!window.confirm(`Restore ${new Date(backup.createdAt).toLocaleString()}? A safety backup will be created first.`)) return;
    const result = await task.run(() => api.restoreBackup(backup.name));
    if (result) window.location.reload();
  }
  async function cleanOrphans() {
    const result = await task.run(api.removeOrphanUploads);
    if (result) setOrphans([]);
  }
  return <section className="panel backup-panel">
    <div className="panel-heading"><div><h2>Backups</h2><p className="helper-text">SQLite data and referenced uploads are stored together with checksums.</p></div><button type="button" className="primary-button" disabled={task.running} onClick={() => void create()}><Archive size={17} /> {task.running ? "Working..." : "Create backup"}</button></div>
    {task.error && <p className="error-text" role="alert">{task.error}</p>}
    <div className="backup-list">{loading ? <p>Loading backups...</p> : backups.length === 0 ? <p className="helper-text">No backups yet.</p> : backups.slice(0, 8).map((backup) => <div className="backup-row" key={backup.name}><div><strong>{new Date(backup.createdAt).toLocaleString()}</strong><small>Schema {backup.schemaVersion} | {backup.uploads.length} uploads</small></div><button type="button" className="secondary-button" disabled={task.running} onClick={() => void restore(backup)}><RotateCcw size={16} /> Restore</button></div>)}</div>
    <div className="orphan-row"><span>{orphans.length} unreferenced upload{orphans.length === 1 ? "" : "s"}</span><button type="button" className="secondary-button" disabled={task.running || orphans.length === 0} onClick={() => void cleanOrphans()}><Trash2 size={16} /> Clean up</button></div>
  </section>;
}
