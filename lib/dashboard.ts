import { getDb } from "@/lib/db";
import { nowIso, parseDate, parseNumber, slugify, titleCase } from "@/lib/utils";
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

function normalizeImportedValue(value: unknown, type: DatasetColumn["type"]) {
  if (value === null || value === undefined || value === "") return null;
  if (type === "number") return parseNumber(value);
  if (type === "date") return parseDate(value)?.toISOString() ?? null;
  return String(value);
}

export function saveDatasetFromPreview(input: ParsedWorkbook) {
  if (!input.sheets.length || input.sheets.some((sheet) => !sheet.columns.length)) {
    throw new Error("At least one non-empty sheet is required.");
  }

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

  const totalRows = input.sheets.reduce(
    (sum, sheet) => sum + (sheet.allRows?.length ? sheet.allRows.length : sheet.rows.length),
    0
  );

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
      const sourceRows = sheet.allRows?.length ? sheet.allRows : sheet.rows;
      insertSheet.run(uid("sheet"), datasetId, sheet.name, sourceRows.length, sheetIndex);

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

      sourceRows.forEach((row, rowIndex) => {
        const normalized = Object.fromEntries(
          sheet.columns.map((column) => [
            column.name,
            normalizeImportedValue(row[column.name], column.selectedType)
          ])
        );
        insertRow.run(uid("row"), datasetId, sheet.name, rowIndex, JSON.stringify(normalized));
      });
    });
  });

  tx();
  const dashboard = createAutomaticDashboard(datasetId);
  return { datasetId, dashboardId: dashboard.id };
}

function applyFilters(
  rows: Record<string, unknown>[],
  filters: DashboardFilter[],
  availableFields: Set<string>
) {
  return rows.filter((row) => {
    return filters.every((filter) => {
      if (!availableFields.has(filter.field)) return true;

      if (filter.kind === "select") {
        if (!filter.value) return true;
        return String(row[filter.field] ?? "") === filter.value;
      }

      const date = parseDate(row[filter.field]);
      if (!date) return false;
      const start = filter.startDate ? new Date(filter.startDate) : null;
      const end = filter.endDate ? new Date(filter.endDate) : null;
      if (end && /^\d{4}-\d{2}-\d{2}$/.test(filter.endDate ?? "")) {
        end.setHours(23, 59, 59, 999);
      }
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
  const groups = new Map<string, { count: number; values: number[] }>();

  rows.forEach((row) => {
    const rawKey = xField ? row[xField] : "Value";
    const parsedDate = widget.dateGranularity && xField ? parseDate(rawKey) : null;
    let key = String(rawKey ?? "Unknown");
    if (parsedDate && widget.dateGranularity === "month") {
      key = parsedDate.toISOString().slice(0, 7);
    } else if (parsedDate && widget.dateGranularity === "day") {
      key = parsedDate.toISOString().slice(0, 10);
    } else if (parsedDate && widget.dateGranularity === "week") {
      const weekStart = new Date(parsedDate);
      weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
      key = weekStart.toISOString().slice(0, 10);
    }
    const bucket = groups.get(key) ?? { count: 0, values: [] };
    const numeric = yField ? parseNumber(row[yField]) : null;
    bucket.count += 1;
    if (numeric !== null) bucket.values.push(numeric);
    groups.set(key, bucket);
  });

  const result = Array.from(groups.entries()).map(([label, bucket]) => {
    let value = 0;
    if (aggregate === "count") value = bucket.count;
    if (aggregate === "sum") value = bucket.values.reduce((sum, item) => sum + item, 0);
    if (aggregate === "avg") {
      value = bucket.values.length
        ? bucket.values.reduce((sum, item) => sum + item, 0) / bucket.values.length
        : 0;
    }
    return { label, value };
  });
  if (widget.dateGranularity) {
    return result.sort((a, b) => a.label.localeCompare(b.label));
  }
  if (widget.kind === "bar" || widget.kind === "pie") {
    return result.sort((a, b) => b.value - a.value);
  }
  return result;
}

export function queryWidgetData(
  datasetId: string,
  widget: DashboardWidget,
  filters: DashboardFilter[]
): WidgetQueryResult {
  const columns = getColumnsForSheet(datasetId, widget.sheetName);
  if (!columns.length) {
    throw new Error("Widget sheet does not belong to this dataset.");
  }

  const availableFields = new Set(columns.map((column) => column.name));
  const referencedFields = [
    widget.xField,
    widget.yField,
    widget.groupBy,
    widget.metricField,
    widget.filterField,
    widget.dateField,
    widget.seriesField,
    widget.matchField,
    ...(widget.columns ?? []),
    ...(widget.valueFields ?? [])
  ].filter(Boolean) as string[];
  const invalidField = referencedFields.find((field) => !availableFields.has(field));
  if (invalidField) {
    throw new Error(`Widget field "${invalidField}" does not belong to sheet "${widget.sheetName}".`);
  }

  const rows = applyFilters(getAllRows(datasetId, widget.sheetName), filters, availableFields);

  if (widget.kind === "kpi") {
    const matchedRows =
      widget.matchField && widget.matchValue
        ? rows.filter((row) => String(row[widget.matchField ?? ""] ?? "") === widget.matchValue)
        : rows;
    const aggregated = aggregateRows(matchedRows, widget);
    const total = aggregated.reduce((sum, entry) => sum + entry.value, 0);
    return {
      widgetId: widget.id,
      kind: widget.kind,
      title: widget.title,
      data: { value: total, label: widget.matchValue ?? widget.metricField ?? "Rows" }
    };
  }

  if (widget.kind === "bar" && widget.valueFields?.length) {
    return {
      widgetId: widget.id,
      kind: widget.kind,
      title: widget.title,
      data: widget.valueFields
        .map((field) => ({
          label: field,
          value: rows.filter((row) => {
            const value = String(row[field] ?? "").trim();
            return value !== "" && value !== "-" && value !== "0" && value.toLowerCase() !== "false";
          }).length
        }))
        .sort((a, b) => b.value - a.value)
    };
  }

  if (widget.kind === "stacked_bar") {
    const xField = widget.xField;
    const seriesField = widget.seriesField;
    if (!xField || !seriesField) {
      throw new Error("Stacked bar widgets require xField and seriesField.");
    }
    const series = Array.from(
      new Set(rows.map((row) => String(row[seriesField] ?? "Unknown")))
    ).sort();
    const grouped = new Map<string, Record<string, number | string>>();
    rows.forEach((row) => {
      const label = String(row[xField] ?? "Unknown");
      const seriesName = String(row[seriesField] ?? "Unknown");
      const entry = grouped.get(label) ?? { label };
      entry[seriesName] = Number(entry[seriesName] ?? 0) + 1;
      grouped.set(label, entry);
    });
    return {
      widgetId: widget.id,
      kind: widget.kind,
      title: widget.title,
      data: Array.from(grouped.values()).sort((a, b) => {
        const totalA = Object.entries(a).reduce(
          (sum, [key, value]) => sum + (key === "label" ? 0 : Number(value)),
          0
        );
        const totalB = Object.entries(b).reduce(
          (sum, [key, value]) => sum + (key === "label" ? 0 : Number(value)),
          0
        );
        return totalB - totalA;
      }),
      meta: { series }
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
      data: rows.map((row) => {
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
      min: min ? min.toISOString().slice(0, 10) : null,
      max: max ? max.toISOString().slice(0, 10) : null
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

  if (input.datasetId !== input.config.datasetId || !getDataset(input.datasetId)) {
    throw new Error("Dashboard dataset is invalid.");
  }

  if (input.id) {
    const existing = getDashboard(id);
    if (!existing) throw new Error("Dashboard not found.");
    if (existing.datasetId !== input.datasetId) {
      throw new Error("A dashboard cannot be moved to another dataset.");
    }
  }

  const tx = db.transaction(() => {
    if (input.isDefault) {
      db.prepare("UPDATE dashboards SET is_default = 0 WHERE dataset_id = ?").run(input.datasetId);
    }

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
      return;
    }

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
  });

  tx();
  return getDashboard(id);
}

export function deleteDashboard(dashboardId: string) {
  const db = getDb();
  return db.prepare("DELETE FROM dashboards WHERE id = ?").run(dashboardId).changes > 0;
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

function normalizeFieldName(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function findColumnByTerms(columns: DatasetColumn[], terms: string[]) {
  const normalizedTerms = terms.map(normalizeFieldName);
  return (
    columns.find((column) => normalizedTerms.includes(normalizeFieldName(column.name))) ??
    columns.find((column) => {
      const name = normalizeFieldName(column.name);
      return normalizedTerms.some((term) => name.includes(term) || term.includes(name));
    })
  );
}

function findValue(values: unknown[], terms: string[]) {
  const normalizedTerms = terms.map(normalizeFieldName);
  return values
    .map((value) => String(value ?? "").trim())
    .find((value) => {
      const normalized = normalizeFieldName(value);
      return normalizedTerms.some((term) => normalized === term || normalized.includes(term));
    });
}

function buildRegistrationDashboard(
  datasetId: string,
  sheetName: string,
  columns: DatasetColumn[]
): { widgets: DashboardWidget[]; filters: DashboardFilter[] } | null {
  const registrationDate = findColumnByTerms(columns, [
    "วันที่สมัคร",
    "registration date",
    "registered at",
    "created at"
  ]);
  const status = findColumnByTerms(columns, ["สถานะ", "payment status", "registration status"]);
  const paymentMethod = findColumnByTerms(columns, ["ชำระเงิน", "payment method", "payment channel"]);
  const source = findColumnByTerms(columns, [
    "ท่านทราบข้อมูลหลักสูตรนี้จาก",
    "ช่องทางที่รู้จัก",
    "lead source",
    "source",
    "acquisition channel"
  ]);
  const course = findColumnByTerms(columns, ["หลักสูตร", "course", "program"]);

  if (!registrationDate || !status || (!paymentMethod && !source && !course)) return null;

  const businessType = findColumnByTerms(columns, ["ประเภทกิจการ", "business type", "industry"]);
  const education = findColumnByTerms(columns, ["การศึกษาสูงสุด", "education"]);
  const province = findColumnByTerms(columns, ["จังหวัด (2)", "จังหวัด", "province"]);
  const position = findColumnByTerms(columns, ["ตำแหน่ง", "position", "job title"]);
  const company = findColumnByTerms(columns, ["บริษัท", "company", "organization"]);
  const sourceDetail = findColumnByTerms(columns, ["ระบุ", "source detail"]);
  const subCourse = findColumnByTerms(columns, ["หลักสูตรย่อย", "sub course", "package"]);
  const expectation = findColumnByTerms(columns, [
    "สิ่งที่คาดหวังในการอบรม",
    "expectation",
    "training expectation"
  ]);
  const rows = getAllRows(datasetId, sheetName);
  const statusValues = rows.map((row) => row[status.name]);
  const paidValue = findValue(statusValues, ["ชำระเงินแล้ว", "paid", "completed"]);
  const unpaidValue = findValue(statusValues, [
    "ยังไม่ได้ชำระเงิน",
    "unpaid",
    "pending payment",
    "pending"
  ]);
  const interestTerms = [
    "Management Developer",
    "Marketing Features",
    "Finance & Accounting",
    "Human Resource Management",
    "Strategy Development"
  ];
  const interestFields = interestTerms
    .map((term) => findColumnByTerms(columns, [term]))
    .filter((column): column is DatasetColumn => Boolean(column));

  const widgets: DashboardWidget[] = [
    buildWidgetBase("kpi", "ผู้สมัครทั้งหมด", sheetName, {
      aggregate: "count",
      layout: { w: 3, h: 1 }
    })
  ];

  if (paidValue) {
    widgets.push(
      buildWidgetBase("kpi", "ชำระเงินแล้ว", sheetName, {
        aggregate: "count",
        matchField: status.name,
        matchValue: paidValue,
        layout: { w: 3, h: 1 }
      })
    );
  }
  if (unpaidValue) {
    widgets.push(
      buildWidgetBase("kpi", "รอติดตามการชำระเงิน", sheetName, {
        aggregate: "count",
        matchField: status.name,
        matchValue: unpaidValue,
        layout: { w: 3, h: 1 }
      })
    );
  }

  widgets.push(
    buildWidgetBase("line", "แนวโน้มผู้สมัครรายเดือน", sheetName, {
      xField: registrationDate.name,
      aggregate: "count",
      dateGranularity: "month",
      layout: { w: 8, h: 2 }
    }),
    buildWidgetBase("pie", "สัดส่วนสถานะการชำระเงิน", sheetName, {
      xField: status.name,
      aggregate: "count",
      layout: { w: 4, h: 2 }
    })
  );

  if (paymentMethod) {
    widgets.push(
      buildWidgetBase("stacked_bar", "วิธีชำระเงินเทียบสถานะ", sheetName, {
        xField: paymentMethod.name,
        seriesField: status.name,
        aggregate: "count",
        layout: { w: 8, h: 2 }
      })
    );
  }
  if (source) {
    widgets.push(
      buildWidgetBase("bar", "ช่องทางที่ทำให้รู้จักหลักสูตร", sheetName, {
        xField: source.name,
        aggregate: "count",
        layout: { w: 6, h: 2 }
      })
    );
  }
  if (interestFields.length) {
    widgets.push(
      buildWidgetBase("bar", "หัวข้อที่ผู้สมัครสนใจ", sheetName, {
        valueFields: interestFields.map((column) => column.name),
        aggregate: "count",
        layout: { w: 6, h: 2 }
      })
    );
  }
  if (businessType) {
    widgets.push(
      buildWidgetBase("bar", "ผู้สมัครตามประเภทกิจการ", sheetName, {
        xField: businessType.name,
        aggregate: "count",
        layout: { w: 6, h: 2 }
      })
    );
  }
  if (education) {
    widgets.push(
      buildWidgetBase("bar", "ระดับการศึกษาของผู้สมัคร", sheetName, {
        xField: education.name,
        aggregate: "count",
        layout: { w: 6, h: 2 }
      })
    );
  }

  const safeColumns = [
    registrationDate,
    course,
    subCourse,
    status,
    paymentMethod,
    source,
    sourceDetail,
    position,
    company,
    businessType,
    province,
    education,
    ...interestFields,
    expectation
  ]
    .filter((column): column is DatasetColumn => Boolean(column))
    .map((column) => column.name);
  widgets.push(
    buildWidgetBase("table", "ข้อมูลสรุปเพื่อการตลาด", sheetName, {
      columns: Array.from(new Set(safeColumns)),
      layout: { w: 12, h: 4 }
    })
  );

  const filters: DashboardFilter[] = [
    { id: uid("filter"), kind: "select", field: status.name, value: null },
    {
      id: uid("filter"),
      kind: "date_range",
      field: registrationDate.name,
      startDate: null,
      endDate: null
    }
  ];
  if (source) {
    filters.push({ id: uid("filter"), kind: "select", field: source.name, value: null });
  }

  widgets.unshift(
    buildWidgetBase("filter_dropdown", "กรองตามสถานะ", sheetName, {
      filterField: status.name,
      layout: { w: 3, h: 1 }
    }),
    buildWidgetBase("date_range", "ช่วงวันที่สมัคร", sheetName, {
      dateField: registrationDate.name,
      layout: { w: 3, h: 1 }
    })
  );
  if (source) {
    widgets.splice(
      2,
      0,
      buildWidgetBase("filter_dropdown", "กรองตามช่องทาง", sheetName, {
        filterField: source.name,
        layout: { w: 3, h: 1 }
      })
    );
  }

  return { widgets, filters };
}

export function createAutomaticDashboard(datasetId: string, dashboardId?: string) {
  const dataset = getDataset(datasetId);
  if (!dataset) {
    throw new Error("Dataset not found");
  }

  const primarySheet = dataset.sheets[0];
  const columns = dataset.columns.filter((column) => column.sheetName === primarySheet.name);
  const registrationDashboard = buildRegistrationDashboard(datasetId, primarySheet.name, columns);
  if (registrationDashboard) {
    return saveDashboard({
      id: dashboardId,
      datasetId,
      name: `${dataset.name} Marketing Overview`,
      description: "Auto-generated registration and marketing analysis dashboard",
      config: { datasetId, ...registrationDashboard },
      isDefault: true
    }) as DashboardRecord;
  }

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
    id: dashboardId,
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
