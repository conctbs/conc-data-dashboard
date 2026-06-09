"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import type {
  Aggregate,
  DashboardConfig,
  DashboardFilter,
  DashboardRecord,
  DashboardWidget,
  DatasetColumn,
  DatasetDetail,
  DatasetRecord,
  WidgetKind
} from "@/lib/types";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { WidgetCard } from "@/components/dashboard/widget-card";
import { cn } from "@/lib/utils";
import { parseJsonResponse } from "@/lib/http";

const widgetKinds: Array<{ kind: WidgetKind; title: string; layout: DashboardWidget["layout"] }> = [
  { kind: "kpi", title: "KPI Card", layout: { w: 3, h: 1 } },
  { kind: "bar", title: "Bar Chart", layout: { w: 6, h: 2 } },
  { kind: "stacked_bar", title: "Stacked Bar Chart", layout: { w: 8, h: 2 } },
  { kind: "line", title: "Line Chart", layout: { w: 6, h: 2 } },
  { kind: "pie", title: "Pie Chart", layout: { w: 4, h: 2 } },
  { kind: "table", title: "Data Table", layout: { w: 12, h: 2 } },
  { kind: "filter_dropdown", title: "Filter Dropdown", layout: { w: 3, h: 1 } },
  { kind: "date_range", title: "Date Filter", layout: { w: 3, h: 1 } }
];

const aggregates: Aggregate[] = ["count", "sum", "avg"];

type MarketingTopic = {
  id: string;
  title: string;
  description: string;
  kind: WidgetKind;
  layout: DashboardWidget["layout"];
  aggregate: Aggregate;
  xTerms?: string[];
  yTerms?: string[];
  seriesTerms?: string[];
};

const marketingTopics: MarketingTopic[] = [
  {
    id: "registration_over_time",
    title: "Registration trend",
    description: "Count registrations by date for campaign timing analysis.",
    kind: "line",
    layout: { w: 8, h: 2 },
    aggregate: "count",
    xTerms: ["registration date", "registered at", "วันที่สมัคร"]
  },
  {
    id: "lead_sources",
    title: "Lead sources",
    description: "Compare how applicants or leads discovered the program.",
    kind: "bar",
    layout: { w: 6, h: 2 },
    aggregate: "count",
    xTerms: ["lead source", "source", "channel", "ท่านทราบข้อมูลหลักสูตรนี้จาก"]
  },
  {
    id: "payment_status",
    title: "Payment status",
    description: "Show paid, unpaid, and pending registrations.",
    kind: "pie",
    layout: { w: 4, h: 2 },
    aggregate: "count",
    xTerms: ["payment status", "registration status", "สถานะ"]
  },
  {
    id: "payment_method_status",
    title: "Payment method vs status",
    description: "Find payment methods that need the most follow-up.",
    kind: "stacked_bar",
    layout: { w: 8, h: 2 },
    aggregate: "count",
    xTerms: ["payment method", "payment channel", "ชำระเงิน"],
    seriesTerms: ["payment status", "registration status", "สถานะ"]
  },
  {
    id: "revenue_over_time",
    title: "Revenue over time",
    description: "Trend line for revenue, sales, or orders by date.",
    kind: "line",
    layout: { w: 8, h: 2 },
    aggregate: "sum",
    xTerms: ["date", "day", "month", "week", "created", "order date"],
    yTerms: ["revenue", "sales", "amount", "order value", "gmv"]
  },
  {
    id: "channel_performance",
    title: "Channel performance",
    description: "Compare revenue or conversions across marketing channels.",
    kind: "bar",
    layout: { w: 6, h: 2 },
    aggregate: "sum",
    xTerms: ["channel", "source", "medium", "platform", "utm source"],
    yTerms: ["revenue", "conversions", "orders", "sales", "leads"]
  },
  {
    id: "campaign_conversion",
    title: "Campaign conversions",
    description: "Rank campaigns by conversions, leads, or orders.",
    kind: "bar",
    layout: { w: 6, h: 2 },
    aggregate: "sum",
    xTerms: ["campaign", "ad set", "adset", "creative", "utm campaign"],
    yTerms: ["conversions", "leads", "orders", "purchases", "signups"]
  },
  {
    id: "spend_mix",
    title: "Spend mix",
    description: "Show marketing spend distribution by channel or campaign.",
    kind: "pie",
    layout: { w: 4, h: 2 },
    aggregate: "sum",
    xTerms: ["channel", "campaign", "source", "platform"],
    yTerms: ["spend", "cost", "ad spend", "budget"]
  },
  {
    id: "marketing_table",
    title: "Marketing detail table",
    description: "Add a table of the most useful marketing columns.",
    kind: "table",
    layout: { w: 12, h: 2 },
    aggregate: "count"
  }
];

function normalizeColumnName(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function findMarketingColumn(columns: DatasetColumn[], terms: string[] | undefined, types?: DatasetColumn["type"][]) {
  const typedColumns = types?.length ? columns.filter((column) => types.includes(column.type)) : columns;
  if (!terms?.length) return typedColumns[0] ?? columns[0];

  const normalizedTerms = terms.map(normalizeColumnName);
  return (
    typedColumns.find((column) => {
      const name = normalizeColumnName(column.name);
      return normalizedTerms.some((term) => name === term || name.includes(term) || term.includes(name));
    })
  );
}

function marketingTableColumns(columns: DatasetColumn[]) {
  const preferredTerms = [
    "date",
    "campaign",
    "channel",
    "source",
    "medium",
    "platform",
    "spend",
    "cost",
    "revenue",
    "sales",
    "conversions",
    "leads"
  ];
  const preferred = preferredTerms
    .map((term) => findMarketingColumn(columns, [term]))
    .filter(Boolean) as DatasetColumn[];
  const unique = new Map(preferred.concat(columns).map((column) => [column.name, column.name]));
  return Array.from(unique.values()).slice(0, 8);
}

export function DashboardBuilder() {
  const searchParams = useSearchParams();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const datasetIdFromUrl = searchParams.get("datasetId");
  const dashboardIdFromUrl = searchParams.get("dashboardId");
  const [datasets, setDatasets] = useState<DatasetRecord[]>([]);
  const [datasetDetail, setDatasetDetail] = useState<DatasetDetail | null>(null);
  const [dashboards, setDashboards] = useState<DashboardRecord[]>([]);
  const [currentDashboard, setCurrentDashboard] = useState<DashboardRecord | null>(null);
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [selectedMarketingTopicId, setSelectedMarketingTopicId] = useState(marketingTopics[0].id);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, startSaving] = useTransition();
  const [generating, startGenerating] = useTransition();
  const selectedWidget =
    currentDashboard?.config.widgets.find((widget) => widget.id === selectedWidgetId) ?? null;

  useEffect(() => {
    async function boot() {
      setLoading(true);
      setError(null);
      const [datasetsRes, dashboardsRes] = await Promise.all([fetch("/api/datasets"), fetch("/api/dashboards")]);
      const [datasetsJson, dashboardsJson] = await Promise.all([
        parseJsonResponse<DatasetRecord[]>(datasetsRes),
        parseJsonResponse<DashboardRecord[]>(dashboardsRes)
      ]);

      if (!datasetsRes.ok || datasetsJson.error || !datasetsJson.body) {
        setError(datasetsJson.error ?? "Failed to load datasets.");
        setLoading(false);
        return;
      }

      if (!dashboardsRes.ok || dashboardsJson.error || !dashboardsJson.body) {
        setError(dashboardsJson.error ?? "Failed to load dashboards.");
        setLoading(false);
        return;
      }

      setDatasets(datasetsJson.body);
      setDashboards(dashboardsJson.body);

      const effectiveDatasetId = datasetIdFromUrl ?? datasetsJson.body[0]?.id ?? null;
      const effectiveDashboard =
        dashboardsJson.body.find((item: DashboardRecord) => item.id === dashboardIdFromUrl) ??
        dashboardsJson.body.find((item: DashboardRecord) => item.datasetId === effectiveDatasetId) ??
        null;

      if (effectiveDatasetId) {
        await loadDataset(effectiveDatasetId);
      }
      setCurrentDashboard(effectiveDashboard);
      setSelectedWidgetId(effectiveDashboard?.config.widgets[0]?.id ?? null);
      setLoading(false);
    }

    void boot();
  }, [dashboardIdFromUrl, datasetIdFromUrl]);

  async function loadDataset(datasetId: string) {
    const response = await fetch(`/api/datasets/${datasetId}`);
    const { body, error: responseError } = await parseJsonResponse<DatasetDetail>(response);
    if (!response.ok || responseError || !body) {
      setError(responseError ?? "Failed to load dataset detail.");
      return;
    }
    setDatasetDetail(body);
  }

  const groupedColumns = useMemo(() => {
    return datasetDetail?.columns.filter((column) => column.sheetName === selectedWidget?.sheetName) ?? [];
  }, [datasetDetail, selectedWidget]);

  function updateDashboard(mutator: (dashboard: DashboardRecord) => DashboardRecord) {
    setCurrentDashboard((current) => (current ? mutator(current) : current));
  }

  async function chooseDataset(datasetId: string) {
    await loadDataset(datasetId);
    const dashboard = dashboards.find((item) => item.datasetId === datasetId) ?? null;
    setCurrentDashboard(dashboard);
    setSelectedWidgetId(dashboard?.config.widgets[0]?.id ?? null);
  }

  function addWidget(kind: WidgetKind) {
    if (!datasetDetail || !currentDashboard) return;
    const sheet = datasetDetail.sheets[0];
    const template = widgetKinds.find((item) => item.kind === kind);
    if (!template) return;
    const columns = datasetDetail.columns.filter((column) => column.sheetName === sheet.name);
    const categoryColumn =
      columns.find((column) => column.type === "category") ??
      columns.find((column) => column.type === "text");
    const numberColumn = columns.find((column) => column.type === "number");
    const dateColumn = columns.find((column) => column.type === "date");

    const nextWidget: DashboardWidget = {
      id: `widget_${crypto.randomUUID()}`,
      kind,
      title: template.title,
      sheetName: sheet.name,
      layout: template.layout,
      aggregate: numberColumn && ["bar", "line", "pie"].includes(kind) ? "sum" : "count",
      xField:
        kind === "line"
          ? dateColumn?.name ?? categoryColumn?.name
          : ["bar", "pie", "stacked_bar"].includes(kind)
            ? categoryColumn?.name
            : undefined,
      yField: ["bar", "line", "pie"].includes(kind) ? numberColumn?.name : undefined,
      seriesField: kind === "stacked_bar" ? categoryColumn?.name : undefined,
      metricField: kind === "kpi" ? numberColumn?.name : undefined,
      filterField: kind === "filter_dropdown" ? categoryColumn?.name : undefined,
      dateField: kind === "date_range" ? dateColumn?.name : undefined,
      columns: kind === "table" ? columns.slice(0, 6).map((column) => column.name) : undefined
    };

    updateDashboard((dashboard) => ({
      ...dashboard,
      config: {
        ...dashboard.config,
        widgets: [...dashboard.config.widgets, nextWidget]
      }
    }));
    setSelectedWidgetId(nextWidget.id);
  }

  function addMarketingTopicWidget() {
    if (!datasetDetail || !currentDashboard) return;
    const topic = marketingTopics.find((item) => item.id === selectedMarketingTopicId) ?? marketingTopics[0];
    const sheet = datasetDetail.sheets[0];
    const sheetColumns = datasetDetail.columns.filter((column) => column.sheetName === sheet.name);
    const xColumn = findMarketingColumn(sheetColumns, topic.xTerms, ["category", "date", "text"]);
    const yColumn = topic.yTerms
      ? findMarketingColumn(sheetColumns, topic.yTerms, ["number"])
      : undefined;
    const seriesColumn = topic.seriesTerms
      ? findMarketingColumn(sheetColumns, topic.seriesTerms, ["category", "text"])
      : undefined;
    if (topic.kind !== "table" && !xColumn) {
      setError(`No matching column was found for "${topic.title}".`);
      return;
    }
    if (topic.yTerms && !yColumn) {
      setError(`No numeric column was found for "${topic.title}".`);
      return;
    }
    if (topic.kind === "stacked_bar" && !seriesColumn) {
      setError(`No status/series column was found for "${topic.title}".`);
      return;
    }
    setError(null);
    const nextWidget: DashboardWidget = {
      id: `widget_${crypto.randomUUID()}`,
      kind: topic.kind,
      title: topic.title,
      sheetName: sheet.name,
      layout: topic.layout,
      aggregate: topic.aggregate,
      xField: topic.kind === "table" ? undefined : xColumn?.name,
      yField: topic.kind === "table" ? undefined : yColumn?.name,
      seriesField: topic.kind === "stacked_bar" ? seriesColumn?.name : undefined,
      dateGranularity: topic.id === "registration_over_time" ? "month" : undefined,
      metricField: topic.kind === "kpi" ? yColumn?.name : undefined,
      columns: topic.kind === "table" ? marketingTableColumns(sheetColumns) : undefined
    };

    updateDashboard((dashboard) => ({
      ...dashboard,
      config: {
        ...dashboard.config,
        widgets: [...dashboard.config.widgets, nextWidget]
      }
    }));
    setSelectedWidgetId(nextWidget.id);
  }

  function removeWidget(widgetId: string) {
    updateDashboard((dashboard) => ({
      ...dashboard,
      config: {
        ...dashboard.config,
        widgets: dashboard.config.widgets.filter((widget) => widget.id !== widgetId)
      }
    }));
    setSelectedWidgetId(null);
  }

  function updateWidget(partial: Partial<DashboardWidget>) {
    if (!selectedWidgetId) return;
    updateDashboard((dashboard) => ({
      ...dashboard,
      config: {
        ...dashboard.config,
        widgets: dashboard.config.widgets.map((widget) =>
          widget.id === selectedWidgetId ? { ...widget, ...partial } : widget
        )
      }
    }));
  }

  function updateFilter(filterId: string, partial: Partial<DashboardFilter>) {
    updateDashboard((dashboard) => ({
      ...dashboard,
      config: {
        ...dashboard.config,
        filters: dashboard.config.filters.map((filter) =>
          filter.id === filterId ? { ...filter, ...partial } : filter
        )
      }
    }));
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!currentDashboard || !event.over || event.active.id === event.over.id) return;
    const activeId = String(event.active.id);
    const overId = String(event.over.id);
    const currentIndex = currentDashboard.config.widgets.findIndex((widget) => widget.id === activeId);
    const overIndex = currentDashboard.config.widgets.findIndex((widget) => widget.id === overId);
    updateDashboard((dashboard) => ({
      ...dashboard,
      config: {
        ...dashboard.config,
        widgets: arrayMove(dashboard.config.widgets, currentIndex, overIndex)
      }
    }));
  }

  function saveCurrentDashboard() {
    if (!currentDashboard) return;
    startSaving(async () => {
      const method = currentDashboard.id ? "PUT" : "POST";
      const url = currentDashboard.id ? `/api/dashboards/${currentDashboard.id}` : "/api/dashboards";
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          datasetId: currentDashboard.datasetId,
          name: currentDashboard.name,
          description: currentDashboard.description,
          isDefault: currentDashboard.isDefault,
          config: currentDashboard.config
        })
      });
      const { body, error: responseError } = await parseJsonResponse<DashboardRecord>(response);
      if (!response.ok || responseError || !body) {
        setError(responseError ?? "Failed to save dashboard.");
        return;
      }
      setCurrentDashboard(body);
      setDashboards((current) => {
        const exists = current.some((item) => item.id === body.id);
        return exists ? current.map((item) => (item.id === body.id ? body : item)) : [body, ...current];
      });
    });
  }

  function generateMarketingDashboard() {
    if (!datasetDetail) return;
    startGenerating(async () => {
      setError(null);
      const response = await fetch("/api/dashboards/auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datasetId: datasetDetail.id })
      });
      const { body, error: responseError } = await parseJsonResponse<DashboardRecord>(response);
      if (!response.ok || responseError || !body) {
        setError(responseError ?? "Failed to generate marketing dashboard.");
        return;
      }
      setCurrentDashboard(body);
      setSelectedWidgetId(body.config.widgets[0]?.id ?? null);
      setDashboards((current) => [body, ...current.filter((item) => item.id !== body.id)]);
    });
  }

  if (loading) return <LoadingState label="Preparing builder..." />;
  if (error) return <ErrorState message={error} />;
  if (!datasets.length) {
    return (
      <EmptyState
        title="Builder is waiting for data"
        description="Upload an Excel or CSV file first, then return here to configure widgets and layouts."
      />
    );
  }
  if (!datasetDetail || !currentDashboard) {
    return (
      <EmptyState
        title="No dashboard available"
        description="Import a dataset to generate an initial dashboard or choose a dataset with an existing dashboard."
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="card p-6">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto_auto]">
          <div>
            <label className="text-sm font-medium">Dataset</label>
            <select
              className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3"
              value={datasetDetail.id}
              onChange={(event) => void chooseDataset(event.target.value)}
            >
              {datasets.map((dataset) => (
                <option key={dataset.id} value={dataset.id}>
                  {dataset.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Dashboard name</label>
            <input
              className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3"
              value={currentDashboard.name}
              onChange={(event) => setCurrentDashboard({ ...currentDashboard, name: event.target.value })}
            />
          </div>
          <button
            className="self-end rounded-2xl border border-line bg-white px-5 py-3 text-sm"
            onClick={saveCurrentDashboard}
            type="button"
          >
            {saving ? "Saving..." : "Save dashboard"}
          </button>
          <Link
            className="self-end rounded-2xl bg-accent px-5 py-3 text-center text-sm text-white"
            href={`/dashboards/${currentDashboard.id}`}
          >
            Open view mode
          </Link>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[240px_1fr_320px]">
        <aside className="card p-4">
          <p className="font-medium">Widget library</p>
          <div className="mt-4 space-y-2">
            {widgetKinds.map((item) => (
              <button
                className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-left text-sm"
                key={item.kind}
                onClick={() => addWidget(item.kind)}
                type="button"
              >
                {item.title}
              </button>
            ))}
          </div>

          <div className="mt-6 border-t border-line pt-4">
            <p className="font-medium">Marketing analysis</p>
            <button
              className="mt-3 w-full rounded-2xl bg-ink px-4 py-3 text-left text-sm font-medium text-white disabled:opacity-50"
              disabled={generating}
              onClick={generateMarketingDashboard}
              type="button"
            >
              {generating ? "Generating analysis..." : "Generate full marketing dashboard"}
            </button>
            <select
              className="mt-3 w-full rounded-2xl border border-line bg-white px-3 py-3 text-sm"
              value={selectedMarketingTopicId}
              onChange={(event) => setSelectedMarketingTopicId(event.target.value)}
            >
              {marketingTopics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.title}
                </option>
              ))}
            </select>
            <p className="mt-2 min-h-10 text-xs leading-5 text-slate-500">
              {marketingTopics.find((topic) => topic.id === selectedMarketingTopicId)?.description}
            </p>
            <button
              className="mt-3 w-full rounded-2xl bg-accent px-4 py-3 text-left text-sm font-medium text-white"
              onClick={addMarketingTopicWidget}
              type="button"
            >
              Add marketing chart
            </button>
          </div>

          <div className="mt-6 border-t border-line pt-4">
            <p className="font-medium">Dashboard filters</p>
            <div className="mt-3 space-y-3">
              {currentDashboard.config.filters.map((filter) => (
                <div className="rounded-2xl bg-white p-3" key={filter.id}>
                  <p className="text-sm font-medium">{filter.field}</p>
                  {filter.kind === "select" ? (
                    <input
                      className="mt-2 w-full rounded-xl border border-line px-3 py-2 text-sm"
                      placeholder="Filter value"
                      value={filter.value ?? ""}
                      onChange={(event) => updateFilter(filter.id, { value: event.target.value || null })}
                    />
                  ) : (
                    <div className="mt-2 grid gap-2">
                      <input
                        className="rounded-xl border border-line px-3 py-2 text-sm"
                        type="date"
                        value={filter.startDate ?? ""}
                        onChange={(event) => updateFilter(filter.id, { startDate: event.target.value || null })}
                      />
                      <input
                        className="rounded-xl border border-line px-3 py-2 text-sm"
                        type="date"
                        value={filter.endDate ?? ""}
                        onChange={(event) => updateFilter(filter.id, { endDate: event.target.value || null })}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </aside>

        <section>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext
              items={currentDashboard.config.widgets.map((widget) => widget.id)}
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-12 gap-4" id="builder-canvas">
                {currentDashboard.config.widgets.map((widget) => (
                  <SortableWidget
                    key={widget.id}
                    widget={widget}
                    datasetId={currentDashboard.datasetId}
                    filters={currentDashboard.config.filters}
                    selected={selectedWidgetId === widget.id}
                    onSelect={() => setSelectedWidgetId(widget.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </section>

        <aside className="card p-4">
          {selectedWidget ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="font-medium">Widget settings</p>
                <button className="text-sm text-red-600" onClick={() => removeWidget(selectedWidget.id)} type="button">
                  Remove
                </button>
              </div>

              <Field label="Title">
                <input
                  className="w-full rounded-2xl border border-line px-4 py-3"
                  value={selectedWidget.title}
                  onChange={(event) => updateWidget({ title: event.target.value })}
                />
              </Field>

              <Field label="Sheet">
                <select
                  className="w-full rounded-2xl border border-line px-4 py-3"
                  value={selectedWidget.sheetName}
                  onChange={(event) =>
                    updateWidget({
                      sheetName: event.target.value,
                      xField: undefined,
                      yField: undefined,
                      groupBy: undefined,
                      metricField: undefined,
                      filterField: undefined,
                      dateField: undefined,
                      columns: undefined,
                      valueFields: undefined,
                      seriesField: undefined,
                      matchField: undefined,
                      matchValue: undefined
                    })
                  }
                >
                  {datasetDetail.sheets.map((sheet) => (
                    <option key={sheet.id} value={sheet.name}>
                      {sheet.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Aggregate">
                <select
                  className="w-full rounded-2xl border border-line px-4 py-3"
                  value={selectedWidget.aggregate ?? "count"}
                  onChange={(event) => updateWidget({ aggregate: event.target.value as Aggregate })}
                >
                  {aggregates.map((aggregate) => (
                    <option key={aggregate} value={aggregate}>
                      {aggregate}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="X Field">
                <select
                  className="w-full rounded-2xl border border-line px-4 py-3"
                  value={selectedWidget.xField ?? ""}
                  onChange={(event) => updateWidget({ xField: event.target.value || undefined })}
                >
                  <option value="">None</option>
                  {groupedColumns.map((column) => (
                    <option key={column.id} value={column.name}>
                      {column.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Y / Metric Field">
                <select
                  className="w-full rounded-2xl border border-line px-4 py-3"
                  value={selectedWidget.yField ?? selectedWidget.metricField ?? ""}
                  onChange={(event) =>
                    updateWidget({ yField: event.target.value || undefined, metricField: event.target.value || undefined })
                  }
                >
                  <option value="">None</option>
                  {groupedColumns.map((column) => (
                    <option key={column.id} value={column.name}>
                      {column.name}
                    </option>
                  ))}
                </select>
              </Field>

              {selectedWidget.kind === "stacked_bar" ? (
                <Field label="Series Field">
                  <select
                    className="w-full rounded-2xl border border-line px-4 py-3"
                    value={selectedWidget.seriesField ?? ""}
                    onChange={(event) => updateWidget({ seriesField: event.target.value || undefined })}
                  >
                    <option value="">None</option>
                    {groupedColumns.map((column) => (
                      <option key={column.id} value={column.name}>
                        {column.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}

              {selectedWidget.kind === "line" ? (
                <Field label="Date grouping">
                  <select
                    className="w-full rounded-2xl border border-line px-4 py-3"
                    value={selectedWidget.dateGranularity ?? ""}
                    onChange={(event) =>
                      updateWidget({
                        dateGranularity:
                          (event.target.value as DashboardWidget["dateGranularity"]) || undefined
                      })
                    }
                  >
                    <option value="">No grouping</option>
                    <option value="day">Day</option>
                    <option value="week">Week</option>
                    <option value="month">Month</option>
                  </select>
                </Field>
              ) : null}

              <Field label="Filter Field">
                <select
                  className="w-full rounded-2xl border border-line px-4 py-3"
                  value={selectedWidget.filterField ?? selectedWidget.dateField ?? ""}
                  onChange={(event) =>
                    updateWidget({
                      filterField: event.target.value || undefined,
                      dateField: event.target.value || undefined
                    })
                  }
                >
                  <option value="">None</option>
                  {groupedColumns.map((column) => (
                    <option key={column.id} value={column.name}>
                      {column.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Columns for table">
                <div className="grid gap-2">
                  {groupedColumns.map((column) => {
                    const checked = selectedWidget.columns?.includes(column.name) ?? false;
                    return (
                      <label className="flex items-center gap-2 text-sm" key={column.id}>
                        <input
                          checked={checked}
                          type="checkbox"
                          onChange={(event) => {
                            const current = new Set(selectedWidget.columns ?? []);
                            if (event.target.checked) current.add(column.name);
                            else current.delete(column.name);
                            updateWidget({ columns: Array.from(current) });
                          }}
                        />
                        {column.name}
                      </label>
                    );
                  })}
                </div>
              </Field>

              <Field label="Width">
                <input
                  className="w-full"
                  max={12}
                  min={3}
                  type="range"
                  value={selectedWidget.layout.w}
                  onChange={(event) =>
                    updateWidget({ layout: { ...selectedWidget.layout, w: Number(event.target.value) } })
                  }
                />
              </Field>
            </div>
          ) : (
            <EmptyState
              title="Select a widget"
              description="Click any widget on the canvas to edit fields, aggregation, and table columns."
            />
          )}
        </aside>
      </div>
    </div>
  );
}

function SortableWidget({
  widget,
  datasetId,
  filters,
  selected,
  onSelect
}: {
  widget: DashboardWidget;
  datasetId: string;
  filters: DashboardFilter[];
  selected: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: widget.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("col-span-12", widget.layout.w <= 3 && "lg:col-span-3", widget.layout.w === 4 && "lg:col-span-4", widget.layout.w >= 5 && widget.layout.w <= 6 && "lg:col-span-6", widget.layout.w >= 7 && widget.layout.w <= 8 && "lg:col-span-8", widget.layout.w >= 9 && "lg:col-span-12")}
      {...attributes}
      {...listeners}
    >
      <WidgetCard datasetId={datasetId} filters={filters} onClick={onSelect} selected={selected} widget={widget} />
    </div>
  );
}

function Field({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <p className="mb-2 text-sm font-medium">{label}</p>
      {children}
    </label>
  );
}
