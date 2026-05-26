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
db.pragma("journal_mode = WAL");

const now = new Date().toISOString();
const datasetId = `ds_${crypto.randomUUID()}`;
const dashboardId = `dash_${crypto.randomUUID()}`;
const sheetId = `sheet_${crypto.randomUUID()}`;

const rows = [
  { Date: "2026-01-04", Region: "North", Product: "Alpha", Revenue: 12000, Units: 21 },
  { Date: "2026-01-10", Region: "South", Product: "Beta", Revenue: 9800, Units: 17 },
  { Date: "2026-01-15", Region: "East", Product: "Alpha", Revenue: 15100, Units: 24 },
  { Date: "2026-01-19", Region: "West", Product: "Gamma", Revenue: 13400, Units: 20 },
  { Date: "2026-02-02", Region: "North", Product: "Beta", Revenue: 14300, Units: 22 },
  { Date: "2026-02-08", Region: "East", Product: "Gamma", Revenue: 11700, Units: 16 },
  { Date: "2026-02-18", Region: "South", Product: "Alpha", Revenue: 18900, Units: 28 },
  { Date: "2026-02-24", Region: "West", Product: "Beta", Revenue: 16000, Units: 25 }
];

const columns = [
  { name: "Date", slug: "date", type: "date" },
  { name: "Region", slug: "region", type: "category" },
  { name: "Product", slug: "product", type: "category" },
  { name: "Revenue", slug: "revenue", type: "number" },
  { name: "Units", slug: "units", type: "number" }
];

const widgets = [
  {
    id: `widget_${crypto.randomUUID()}`,
    title: "Total Rows",
    kind: "kpi",
    sheetName: "Sales",
    layout: { w: 3, h: 1 },
    aggregate: "count",
    metricField: "Revenue"
  },
  {
    id: `widget_${crypto.randomUUID()}`,
    title: "Revenue by Region",
    kind: "bar",
    sheetName: "Sales",
    layout: { w: 8, h: 2 },
    xField: "Region",
    yField: "Revenue",
    aggregate: "sum"
  },
  {
    id: `widget_${crypto.randomUUID()}`,
    title: "Product Mix",
    kind: "pie",
    sheetName: "Sales",
    layout: { w: 4, h: 2 },
    xField: "Product",
    yField: "Revenue",
    aggregate: "sum"
  },
  {
    id: `widget_${crypto.randomUUID()}`,
    title: "Revenue Over Time",
    kind: "line",
    sheetName: "Sales",
    layout: { w: 8, h: 2 },
    xField: "Date",
    yField: "Revenue",
    aggregate: "sum"
  },
  {
    id: `widget_${crypto.randomUUID()}`,
    title: "Recent Records",
    kind: "table",
    sheetName: "Sales",
    layout: { w: 12, h: 2 },
    columns: columns.map((column) => column.name),
    aggregate: "count"
  }
];

const filters = [
  { id: `filter_${crypto.randomUUID()}`, kind: "select", field: "Region", value: null },
  { id: `filter_${crypto.randomUUID()}`, kind: "date_range", field: "Date", startDate: null, endDate: null }
];

let inserted = false;

const tx = db.transaction(() => {
  const existing = db
    .prepare("SELECT id FROM datasets WHERE name = ? AND source_file_name = ? LIMIT 1")
    .get("Sample Sales", "sample-sales.csv");
  if (existing) {
    console.log(`Seed skipped; dataset already exists with id ${existing.id}`);
    return;
  }

  db.prepare(
    `INSERT INTO datasets (
      id, name, source_file_name, file_type, status, row_count, sheet_count, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'ready', ?, ?, ?, ?)`
  ).run(datasetId, "Sample Sales", "sample-sales.csv", "csv", rows.length, 1, now, now);

  db.prepare(
    `INSERT INTO dataset_sheets (id, dataset_id, name, row_count, position)
     VALUES (?, ?, ?, ?, ?)`
  ).run(sheetId, datasetId, "Sales", rows.length, 0);

  const insertColumn = db.prepare(
    `INSERT INTO dataset_columns (id, dataset_id, sheet_name, name, slug, type, position, is_filterable)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
  );
  columns.forEach((column, index) => {
    insertColumn.run(`col_${crypto.randomUUID()}`, datasetId, "Sales", column.name, column.slug, column.type, index);
  });

  const insertRow = db.prepare(
    `INSERT INTO dataset_rows (id, dataset_id, sheet_name, row_index, data_json)
     VALUES (?, ?, ?, ?, ?)`
  );
  rows.forEach((row, index) => {
    insertRow.run(`row_${crypto.randomUUID()}`, datasetId, "Sales", index, JSON.stringify(row));
  });

  db.prepare(
    `INSERT INTO dashboards (id, dataset_id, name, description, config_json, is_default, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
  ).run(
    dashboardId,
    datasetId,
    "Sample Sales Overview",
    "Seeded dashboard",
    JSON.stringify({ datasetId, widgets, filters }),
    now,
    now
  );
  inserted = true;
});

tx();
if (inserted) {
  console.log(`Seeded dataset ${datasetId} and dashboard ${dashboardId}`);
}
