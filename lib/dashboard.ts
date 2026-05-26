import { getDb } from "@/lib/db";
import { formatDate, nowIso, parseDate, parseNumber, slugify, titleCase } from "@/lib/utils";
import type {
  DashboardConfig,
  DashboardFilter,
  DashboardRecord,
  DashboardWidget,
  DatasetColumn,
  DatasetDetail,
  DatasetRecord,
  ParsedWorkbook,
  WidgetQueryResult
} from "@/lib/types";

type SqlRow = Record<string, unknown>;
type DatasetColumnRow = Omit<DatasetColumn, "isFilterable"> & { isFilterable: number | boolean };
type DashboardRow = Omit<DashboardRecord, "config" | "isDefault"> & {
  configJson: string;
  isDefault: number | boolean;
};

function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function listDatasets(): DatasetRecord[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, name, source_file_name as sourceFileName, file_type as fileType,
        status, row_count as rowCount, sheet_count as sheetCount,
        created_at as createdAt, updated_at as updatedAt
       FROM datasets
       ORDER BY created_at DESC`
    )
    .all() as DatasetRecord[];

  return rows;
}

export function getDataset(datasetId: string): DatasetDetail | null {
  const db = getDb();
  const dataset = db
    .prepare(
      `SELECT id, name, source_file_name as sourceFileName, file_type as fileType,
        status, row_count as rowCount, sheet_count as sheetCount,
        created_at as createdAt, updated_at as updatedAt
       FROM datasets
       WHERE id = ?`
    )
    .get(datasetId) as DatasetRecord | undefined;

  if (!dataset) return null;

  const sheets = db
    .prepare(
      `SELECT id, dataset_id as datasetId, name, row_count as rowCount, position
       FROM dataset_sheets
       WHERE dataset_id = ?
       ORDER BY position ASC`
    )
    .all(datasetId) as DatasetDetail["sheets"];

  const columnRows = db
    .prepare(
      `SELECT id, dataset_id as datasetId, sheet_name as sheetName, name, slug, type,
        position, is_filterable as isFilterable
       FROM dataset_columns
       WHERE dataset_id = ?
       ORDER BY sheet_name ASC, position ASC`
    )
    .all(datasetId) as DatasetColumnRow[];

  const columns = columnRows.map((column: DatasetColumnRow) => ({
      ...column,
      isFilterable: Boolean(column.isFilterable)
    })) as DatasetColumn[];

  const previewRowResults = db
    .prepare(
      `SELECT data_json as dataJson
       FROM dataset_rows
       WHERE dataset_id = ?
       ORDER BY row_index ASC
       LIMIT 20`
    )
    .all(datasetId) as SqlRow[];

  const previewRows = previewRowResults.map((row: SqlRow) => JSON.parse(String(row.dataJson)));

  return { ...dataset, sheets, columns, previewRows };
}

function getAllRows(datasetId: string, sheetName?: string) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT data_json as dataJson
       FROM dataset_rows
       WHERE dataset_id = ?
       ${sheetName ? "AND sheet_name = ?" : ""}
       ORDER BY row_index ASC`
    )
    .all(...(sheetName ? [datasetId, sheetName] : [datasetId])) as Array<{ dataJson: string }>;

  return rows.map((row: { dataJson: string }) => JSON.parse(row.dataJson) as Record<string, unknown>);
}

function getColumnsForSheet(datasetId: string, sheetName: string) {
  const db = getDb();
  const columnRows = db
    .prepare(
      `SELECT id, dataset_id as datasetId, sheet_name as sheetName, name, slug, type,
        position, is_filterable as isFilterable
       FROM dataset_columns
       WHERE dataset_id = ? AND sheet_name = ?
       ORDER BY position ASC`
    )
    .all(datasetId, sheetName) as DatasetColumnRow[];

  return columnRows.map((column: DatasetColumnRow) => ({
      ...column,
      isFilterable: Boolean(column.isFilterable)
    })) as DatasetColumn[];
}

export function saveDatasetFromPreview(input: ParsedWorkbook) {
  const db = getDb();
  const datasetId = uid("ds");
  const timestamp = nowIso();

  const insertDataset = db.prepare(
    `INSERT INTO datasets (
      id, name, source_file_name, file_type, status, row_count, sheet_count, created_at, updated_at
     ) VALUES (?, ?, ?, ?, 'ready', ?, ?, ?, ?)`
  );

  const insertSheet = db.prepare(
    `INSERT INTO dataset_sheets (id, dataset_id, name, row_count, position)
     VALUES (?, ?, ?, ?, ?)`
  );

  const insertColumn = db.prepare(
    `INSERT INTO dataset_columns (id, dataset_id, sheet_name, name, slug, type, position, is_filterable)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const insertRow = db.prepare(
    `INSERT INTO dataset_rows (id, dataset_id, sheet_name, row_index, data_json)
     VALUES (?, ?, ?, ?, ?)`
  );

  const totalRows = input.sheets.reduce((sum, sheet) => sum + sheet.rowCount, 0);

  const tx = db.transaction(() => {
    insertDataset.run(
      datasetId,
      input.datasetName,
      input.fileName,
      input.fileType,
      totalRows,
      input.sheets.length,
      timestamp,
      timestamp
    );

    input.sheets.forEach((sheet, sheetIndex) => {
      insertSheet.run(uid("sheet"), datasetId, sheet.name, sheet.rowCount, sheetIndex);

      sheet.columns.forEach((column, columnIndex) => {
        insertColumn.run(
          uid("col"),
          datasetId,
          sheet.name,
          column.name,
          column.slug,
          column.selectedType,
          columnIndex,
          1
        );
      });

      const sourceRows = sheet.allRows?.length ? sheet.allRows : sheet.rows;
      sourceRows.forEach((row, rowIndex) => {
        const normalized = Object.fromEntries(
          Object.entries(row).map(([key, value]) => [key, value === "" ? null : value])
        );
        insertRow.run(uid("row"), datasetId, sheet.name, rowIndex, JSON.stringify(normalized));
      });
    });
  });

  tx();
  const dashboard = createAutomaticDashboard(datasetId);
  return { datasetId, dashboardId: dashboard.id };
}

function applyFilters(rows: Record<string, unknown>[], filters: DashboardFilter[]) {
  return rows.filter((row) => {
    return filters.every((filter) => {
      if (filter.kind === "select") {
        if (!filter.value) return true;
        return String(row[filter.field] ?? "") === filter.value;
      }

      const date = parseDate(row[filter.field]);
      if (!date) return false;
      const start = filter.startDate ? new Date(filter.startDate) : null;
      const end = filter.endDate ? new Date(filter.endDate) : null;
      if (start && date < start) return false;
      if (end && date > end) return false;
      return true;
    });
  });
}

function aggregateRows(rows: Record<string, unknown>[], widget: DashboardWidget) {
  const xField = widget.xField || widget.groupBy;
  const yField = widget.yField || widget.metricField;
  const aggregate = widget.aggregate ?? "count";
  const groups = new Map<string, number[]>();

  rows.forEach((row) => {
    const key = xField ? String(row[xField] ?? "Unknown") : "Value";
    const bucket = groups.get(key) ?? [];
    const numeric = yField ? parseNumber(row[yField]) : null;
    bucket.push(numeric ?? 0);
    groups.set(key, bucket);
  });

  return Array.from(groups.entries()).map(([label, values]) => {
    let value = 0;
    if (aggregate === "count") value = values.length;
    if (aggregate === "sum") value = values.reduce((sum, item) => sum + item, 0);
    if (aggregate === "avg") {
      value = values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : 0;
    }
    return { label, value };
  });
}

export function queryWidgetData(
  datasetId: string,
  widget: DashboardWidget,
  filters: DashboardFilter[]
): WidgetQueryResult {
  const rows = applyFilters(getAllRows(datasetId, widget.sheetName), filters);

  if (widget.kind === "kpi") {
    const aggregated = aggregateRows(rows, widget);
    const total = aggregated.reduce((sum, entry) => sum + entry.value, 0);
    return {
      widgetId: widget.id,
      kind: widget.kind,
      title: widget.title,
      data: { value: total, label: widget.metricField ?? "Rows" }
    };
  }

  if (widget.kind === "bar" || widget.kind === "line" || widget.kind === "pie") {
    return {
      widgetId: widget.id,
      kind: widget.kind,
      title: widget.title,
      data: aggregateRows(rows, widget)
    };
  }

  if (widget.kind === "table") {
    const columns = widget.columns?.length ? widget.columns : Object.keys(rows[0] ?? {});
    return {
      widgetId: widget.id,
      kind: widget.kind,
      title: widget.title,
      data: rows.slice(0, 100).map((row) => {
        return columns.reduce<Record<string, unknown>>((acc, column) => {
          acc[column] = row[column];
          return acc;
        }, {});
      }),
      meta: { columns }
    };
  }

  if (widget.kind === "filter_dropdown") {
    const field = widget.filterField ?? widget.xField;
    const values = Array.from(new Set(rows.map((row) => String(row[field ?? ""] ?? "")))).filter(Boolean);
    return {
      widgetId: widget.id,
      kind: widget.kind,
      title: widget.title,
      data: values
    };
  }

  const field = widget.dateField ?? widget.xField;
  const dates = rows.map((row) => parseDate(row[field ?? ""])).filter(Boolean) as Date[];
  const min = dates.length ? new Date(Math.min(...dates.map((date) => date.getTime()))) : null;
  const max = dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : null;
  return {
    widgetId: widget.id,
    kind: widget.kind,
    title: widget.title,
    data: {
      min: min ? formatDate(min) : null,
      max: max ? formatDate(max) : null
    }
  };
}

export function listDashboards(): DashboardRecord[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, dataset_id as datasetId, name, description, is_default as isDefault,
        created_at as createdAt, updated_at as updatedAt, config_json as configJson
       FROM dashboards
       ORDER BY updated_at DESC`
    )
    .all() as DashboardRow[];

  return rows.map((row: DashboardRow) => ({
    ...row,
    isDefault: Boolean(row.isDefault),
    config: JSON.parse(row.configJson)
  })) as DashboardRecord[];
}

export function getDashboard(dashboardId: string): DashboardRecord | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, dataset_id as datasetId, name, description, is_default as isDefault,
        created_at as createdAt, updated_at as updatedAt, config_json as configJson
       FROM dashboards
       WHERE id = ?`
    )
    .get(dashboardId) as DashboardRow | undefined;

  if (!row) return null;

  return {
    ...row,
    isDefault: Boolean(row.isDefault),
    config: JSON.parse(row.configJson)
  };
}

export function saveDashboard(input: {
  id?: string;
  datasetId: string;
  name: string;
  description?: string | null;
  config: DashboardConfig;
  isDefault?: boolean;
}) {
  const db = getDb();
  const timestamp = nowIso();
  const id = input.id ?? uid("dash");

  if (input.id) {
    db.prepare(
      `UPDATE dashboards
       SET name = ?, description = ?, config_json = ?, is_default = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      input.name,
      input.description ?? null,
      JSON.stringify(input.config),
      input.isDefault ? 1 : 0,
      timestamp,
      id
    );
  } else {
    db.prepare(
      `INSERT INTO dashboards (id, dataset_id, name, description, config_json, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.datasetId,
      input.name,
      input.description ?? null,
      JSON.stringify(input.config),
      input.isDefault ? 1 : 0,
      timestamp,
      timestamp
    );
  }

  return getDashboard(id);
}

export function deleteDashboard(dashboardId: string) {
  const db = getDb();
  db.prepare("DELETE FROM dashboards WHERE id = ?").run(dashboardId);
}

function buildWidgetBase(
  kind: DashboardWidget["kind"],
  title: string,
  sheetName: string,
  partial: Partial<DashboardWidget>
): DashboardWidget {
  return {
    id: uid("widget"),
    kind,
    title,
    sheetName,
    layout: partial.layout ?? { w: 6, h: 1 },
    aggregate: partial.aggregate ?? "count",
    ...partial
  };
}

export function createAutomaticDashboard(datasetId: string) {
  const dataset = getDataset(datasetId);
  if (!dataset) {
    throw new Error("Dataset not found");
  }

  const primarySheet = dataset.sheets[0];
  const columns = dataset.columns.filter((column) => column.sheetName === primarySheet.name);
  const categoryColumn =
    columns.find((column) => column.type === "category") ??
    columns.find((column) => column.type === "text");
  const numberColumn = columns.find((column) => column.type === "number");
  const dateColumn = columns.find((column) => column.type === "date");

  const widgets: DashboardWidget[] = [
    buildWidgetBase("kpi", "Total Rows", primarySheet.name, {
      metricField: numberColumn?.name,
      aggregate: "count",
      layout: { w: 3, h: 1 }
    }),
    buildWidgetBase("table", "Recent Records", primarySheet.name, {
      columns: columns.slice(0, 6).map((column) => column.name),
      layout: { w: 12, h: 2 }
    })
  ];

  if (categoryColumn) {
    widgets.push(
      buildWidgetBase("filter_dropdown", `${titleCase(categoryColumn.name)} Filter`, primarySheet.name, {
        filterField: categoryColumn.name,
        layout: { w: 3, h: 1 }
      }),
      buildWidgetBase("pie", `${titleCase(categoryColumn.name)} Mix`, primarySheet.name, {
        xField: categoryColumn.name,
        yField: numberColumn?.name,
        aggregate: numberColumn ? "sum" : "count",
        layout: { w: 4, h: 2 }
      })
    );
  }

  if (categoryColumn && numberColumn) {
    widgets.push(
      buildWidgetBase("bar", `${titleCase(numberColumn.name)} by ${titleCase(categoryColumn.name)}`, primarySheet.name, {
        xField: categoryColumn.name,
        yField: numberColumn.name,
        aggregate: "sum",
        layout: { w: 8, h: 2 }
      })
    );
  }

  if (dateColumn && numberColumn) {
    widgets.push(
      buildWidgetBase("date_range", `${titleCase(dateColumn.name)} Range`, primarySheet.name, {
        dateField: dateColumn.name,
        layout: { w: 3, h: 1 }
      }),
      buildWidgetBase("line", `${titleCase(numberColumn.name)} Over Time`, primarySheet.name, {
        xField: dateColumn.name,
        yField: numberColumn.name,
        aggregate: "sum",
        layout: { w: 8, h: 2 }
      })
    );
  }

  const filters: DashboardFilter[] = [];
  if (categoryColumn) {
    filters.push({
      id: uid("filter"),
      kind: "select",
      field: categoryColumn.name,
      value: null
    });
  }
  if (dateColumn) {
    filters.push({
      id: uid("filter"),
      kind: "date_range",
      field: dateColumn.name,
      startDate: null,
      endDate: null
    });
  }

  const config: DashboardConfig = {
    datasetId,
    widgets,
    filters
  };

  return saveDashboard({
    datasetId,
    name: `${dataset.name} Overview`,
    description: "Auto-generated dashboard",
    config,
    isDefault: true
  }) as DashboardRecord;
}

export function getDatasetSchemaSummary(datasetId: string) {
  const dataset = getDataset(datasetId);
  if (!dataset) return null;

  const grouped = dataset.sheets.map((sheet) => ({
    sheetName: sheet.name,
    columns: dataset.columns.filter((column) => column.sheetName === sheet.name)
  }));

  return {
    dataset,
    sheets: grouped
  };
}

export function getSettings() {
  const db = getDb();
  const row = db.prepare("SELECT value_json as valueJson FROM settings WHERE key = ?").get("app_config") as
    | { valueJson: string }
    | undefined;
  return row ? JSON.parse(row.valueJson) : null;
}
