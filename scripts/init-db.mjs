import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const dataDir = path.join(root, "data");
const schemaPath = path.join(root, "database", "schema.sql");
const dbPath = path.join(dataDir, "dashboard.db");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);
db.exec(fs.readFileSync(schemaPath, "utf8"));

const exists = db.prepare("SELECT 1 FROM settings WHERE key = ?").get("app_config");
if (!exists) {
  db.prepare("INSERT INTO settings (key, value_json) VALUES (?, ?)")
    .run(
      "app_config",
      JSON.stringify({
        appName: "Dashboard Builder",
        authEnabled: false,
        updatedAt: new Date().toISOString()
      })
    );
}

console.log(`Database initialized at ${dbPath}`);
