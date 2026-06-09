export type ColumnType = "text" | "number" | "date" | "category";

export type Aggregate = "sum" | "avg" | "count";

export type WidgetKind =
  | "kpi"
  | "bar"
  | "stacked_bar"
  | "line"
  | "pie"
  | "table"
  | "filter_dropdown"
  | "date_range";

export interface DatasetColumn {
  id: string;
  datasetId: string;
  sheetName: string;
  name: string;
  slug: string;
  type: ColumnType;
  position: number;
  isFilterable: boolean;
}

export interface DatasetSheet {
  id: string;
  datasetId: string;
  name: string;
  rowCount: number;
  position: number;
}

export interface DatasetRecord {
  id: string;
  name: string;
  sourceFileName: string;
  fileType: string;
  status: "draft" | "ready";
  rowCount: number;
  sheetCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DatasetDetail extends DatasetRecord {
  sheets: DatasetSheet[];
  columns: DatasetColumn[];
  previewRows: Record<string, unknown>[];
}

export interface SheetPreview {
  name: string;
  rowCount: number;
  columns: Array<{
    name: string;
    slug: string;
    inferredType: ColumnType;
    selectedType: ColumnType;
  }>;
  rows: Record<string, unknown>[];
  allRows: Record<string, unknown>[];
}

export interface ParsedWorkbook {
  datasetName: string;
  fileName: string;
  fileType: string;
  sheets: SheetPreview[];
}

export interface WidgetLayout {
  w: number;
  h: number;
}

export interface DashboardWidget {
  id: string;
  title: string;
  kind: WidgetKind;
  sheetName: string;
  layout: WidgetLayout;
  xField?: string;
  yField?: string;
  groupBy?: string;
  aggregate?: Aggregate;
  metricField?: string;
  filterField?: string;
  dateField?: string;
  columns?: string[];
  valueFields?: string[];
  seriesField?: string;
  matchField?: string;
  matchValue?: string;
  dateGranularity?: "day" | "week" | "month";
  description?: string;
}

export interface DashboardFilter {
  id: string;
  kind: "select" | "date_range";
  field: string;
  value?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface DashboardConfig {
  datasetId: string;
  widgets: DashboardWidget[];
  filters: DashboardFilter[];
}

export interface DashboardRecord {
  id: string;
  datasetId: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  config: DashboardConfig;
}

export interface WidgetQueryResult {
  widgetId: string;
  kind: WidgetKind;
  title: string;
  data: unknown;
  meta?: Record<string, unknown>;
}
