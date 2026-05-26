import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { nowIso } from "@/lib/utils";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "dashboard.db");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS datasets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source_file_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ready',
      row_count INTEGER NOT NULL DEFAULT 0,
      sheet_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dataset_sheets (
      id TEXT PRIMARY KEY,
      dataset_id TEXT NOT NULL,
      name TEXT NOT NULL,
      row_count INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS dataset_columns (
      id TEXT PRIMARY KEY,
      dataset_id TEXT NOT NULL,
      sheet_name TEXT NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      type TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      is_filterable INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY(dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS dataset_rows (
      id TEXT PRIMARY KEY,
      dataset_id TEXT NOT NULL,
      sheet_name TEXT NOT NULL,
      row_index INTEGER NOT NULL,
      data_json TEXT NOT NULL,
      FOREIGN KEY(dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS dashboards (
      id TEXT PRIMARY KEY,
      dataset_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      config_json TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL
    );
  `);

  const exists = db
    .prepare("SELECT 1 FROM settings WHERE key = ?")
    .get("app_config") as { 1: number } | undefined;

  if (!exists) {
    db.prepare("INSERT INTO settings (key, value_json) VALUES (?, ?)")
      .run(
        "app_config",
        JSON.stringify({
          appName: "Dashboard Builder",
          authEnabled: false,
          updatedAt: nowIso()
        })
      );
  }
}

initDatabase();

export function getDb() {
  return db;
}
