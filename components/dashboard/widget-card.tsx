"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  LabelList,
  CartesianGrid,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { DashboardFilter, DashboardWidget, WidgetQueryResult } from "@/lib/types";
import { formatNumber } from "@/lib/utils";
import { LoadingState, ErrorState } from "@/components/shared/states";
import { TableWidget } from "@/components/dashboard/table-widget";
import { parseJsonResponse } from "@/lib/http";

const pieColors = ["#0f766e", "#14b8a6", "#2dd4bf", "#99f6e4", "#115e59", "#0f172a"];

function axisLabel(value: string | undefined, fallback: string) {
  return {
    value: value || fallback,
    position: "insideBottom" as const,
    offset: -10,
    style: { fill: "#64748b", fontSize: 11 }
  };
}

function valueAxisLabel(value: string | undefined) {
  return {
    value: value || "จำนวน",
    angle: -90,
    position: "insideLeft" as const,
    style: { fill: "#64748b", fontSize: 11, textAnchor: "middle" }
  };
}

export function WidgetCard({
  datasetId,
  widget,
  filters,
  selected,
  onClick,
  onFilterChange
}: {
  datasetId: string;
  widget: DashboardWidget;
  filters: DashboardFilter[];
  selected?: boolean;
  onClick?: () => void;
  onFilterChange?: (filterId: string, partial: Partial<DashboardFilter>) => void;
}) {
  const [result, setResult] = useState<WidgetQueryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      const ownFilterField =
        widget.kind === "filter_dropdown"
          ? widget.filterField ?? widget.xField
          : widget.kind === "date_range"
            ? widget.dateField ?? widget.xField
            : null;
      const queryFilters = ownFilterField
        ? filters.filter((filter) => filter.field !== ownFilterField)
        : filters;
      const response = await fetch("/api/widgets/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datasetId, widget, filters: queryFilters })
      });
      const { body, error: responseError } = await parseJsonResponse<WidgetQueryResult>(response);
      if (!response.ok || responseError || !body) {
        setError(responseError ?? "Failed to load widget.");
        setLoading(false);
        return;
      }
      setResult(body);
      setLoading(false);
    }

    void load();
  }, [datasetId, widget, filters]);

  return (
    <div
      className={`card h-full overflow-hidden border ${selected ? "border-accent ring-2 ring-accent/20" : "border-line"}`}
      onClick={onClick}
      role="presentation"
    >
      <div className="border-b border-line px-4 py-3">
        <p className="font-medium">{widget.title}</p>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{widget.kind}</p>
      </div>
      <div
        className="p-4"
        style={{ height: getWidgetContentHeight(widget, result) }}
      >
        {loading ? <LoadingState label="Loading widget..." /> : null}
        {error ? <ErrorState message={error} /> : null}
        {!loading && !error && result
          ? renderWidget(result, widget, filters, onFilterChange)
          : null}
      </div>
    </div>
  );
}

function getWidgetContentHeight(widget: DashboardWidget, result: WidgetQueryResult | null) {
  if (widget.kind === "table") return 620;
  if (widget.kind === "bar") {
    const itemCount = Array.isArray(result?.data) ? result.data.length : 0;
    const horizontal = Boolean(widget.valueFields?.length) || itemCount > 4;
    return horizontal ? Math.max(340, itemCount * 52 + 80) : 340;
  }
  if (widget.kind === "stacked_bar") return 380;
  if (widget.kind === "line" || widget.kind === "pie") return 320;
  return 260;
}

function renderWidget(
  result: WidgetQueryResult,
  widget: DashboardWidget,
  filters: DashboardFilter[],
  onFilterChange?: (filterId: string, partial: Partial<DashboardFilter>) => void
) {
  if (result.kind === "kpi") {
    const data = result.data as { value: number; label: string };
    return (
      <div className="flex h-full flex-col justify-center">
        <p className="text-sm text-slate-500">{data.label}</p>
        <p className="mt-2 text-4xl font-semibold">{formatNumber(data.value)}</p>
      </div>
    );
  }

  if (result.kind === "table") {
    return (
      <TableWidget
        rows={result.data as Record<string, unknown>[]}
        columns={(result.meta?.columns as string[]) ?? []}
      />
    );
  }

  if (result.kind === "filter_dropdown") {
    const values = result.data as string[];
    const field = widget.filterField ?? widget.xField;
    const filter = filters.find((item) => item.kind === "select" && item.field === field);
    if (filter && onFilterChange) {
      return (
        <label className="block">
          <span className="text-sm text-slate-500">Filter by {field}</span>
          <select
            className="mt-3 w-full rounded-2xl border border-line bg-white px-4 py-3"
            value={filter.value ?? ""}
            onChange={(event) =>
              onFilterChange(filter.id, { value: event.target.value || null })
            }
          >
            <option value="">All values</option>
            {values.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      );
    }
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-500">Available values</p>
        <div className="flex flex-wrap gap-2">
          {values.map((value) => (
            <span className="rounded-full bg-accentSoft px-3 py-1 text-sm text-accent" key={value}>
              {value}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (result.kind === "date_range") {
    const data = result.data as { min: string | null; max: string | null };
    const field = widget.dateField ?? widget.xField;
    const filter = filters.find((item) => item.kind === "date_range" && item.field === field);
    if (filter && filter.kind === "date_range" && onFilterChange) {
      return (
        <div className="grid h-full content-center gap-3">
          <label className="text-sm text-slate-500">
            Start
            <input
              className="mt-1 block w-full rounded-xl border border-line bg-white px-3 py-2 text-ink"
              max={filter.endDate ?? undefined}
              min={data.min ?? undefined}
              type="date"
              value={filter.startDate ?? ""}
              onChange={(event) =>
                onFilterChange(filter.id, { startDate: event.target.value || null })
              }
            />
          </label>
          <label className="text-sm text-slate-500">
            End
            <input
              className="mt-1 block w-full rounded-xl border border-line bg-white px-3 py-2 text-ink"
              max={data.max ?? undefined}
              min={filter.startDate ?? data.min ?? undefined}
              type="date"
              value={filter.endDate ?? ""}
              onChange={(event) =>
                onFilterChange(filter.id, { endDate: event.target.value || null })
              }
            />
          </label>
        </div>
      );
    }
    return (
      <div className="grid h-full content-center gap-2">
        <div className="rounded-2xl bg-shell p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Start</p>
          <p className="mt-1 text-xl font-semibold">{data.min ?? "-"}</p>
        </div>
        <div className="rounded-2xl bg-shell p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">End</p>
          <p className="mt-1 text-xl font-semibold">{data.max ?? "-"}</p>
        </div>
      </div>
    );
  }

  const data = result.data as Array<{ label: string; value: number }>;
  if (result.kind === "stacked_bar") {
    const series = (result.meta?.series as string[]) ?? [];
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={result.data as Array<Record<string, number | string>>}
          margin={{ top: 28, right: 24, bottom: 46, left: 24 }}
        >
          <CartesianGrid stroke="#e7e0d4" vertical={false} />
          <XAxis
            dataKey="label"
            height={66}
            interval={0}
            label={axisLabel(widget.xField, "หมวดหมู่")}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            allowDecimals={false}
            label={valueAxisLabel("จำนวนผู้สมัคร")}
            tick={{ fontSize: 12 }}
          />
          <Tooltip />
          <Legend />
          {series.map((seriesName, index) => (
            <Bar
              dataKey={seriesName}
              fill={pieColors[index % pieColors.length]}
              key={seriesName}
              stackId="total"
            >
              <LabelList
                dataKey={seriesName}
                fill="#ffffff"
                fontSize={11}
                formatter={(value: unknown) => Number(value) || ""}
                position="center"
              />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (result.kind === "bar") {
    const horizontal = Boolean(widget.valueFields?.length) || data.some((entry) => entry.label.length > 18);
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={
            horizontal
              ? { top: 8, right: 52, bottom: 8, left: 8 }
              : { top: 28, right: 20, bottom: 38, left: 0 }
          }
        >
          <CartesianGrid
            horizontal={!horizontal}
            stroke="#e7e0d4"
            vertical={horizontal}
          />
          {horizontal ? (
            <>
              <XAxis
                allowDecimals={false}
                label={axisLabel(widget.yField, "จำนวน")}
                type="number"
              />
              <YAxis
                dataKey="label"
                interval={0}
                label={valueAxisLabel(widget.xField || "หมวดหมู่")}
                tick={{ fontSize: 11 }}
                type="category"
                width={190}
              />
            </>
          ) : (
            <>
              <XAxis
                dataKey="label"
                height={52}
                interval={0}
                label={axisLabel(widget.xField, "หมวดหมู่")}
                tick={{ fontSize: 11 }}
                tickFormatter={(value) =>
                  String(value).length > 24 ? `${String(value).slice(0, 24)}...` : String(value)
                }
              />
              <YAxis
                allowDecimals={false}
                label={valueAxisLabel(widget.yField || "จำนวน")}
                tick={{ fontSize: 12 }}
              />
            </>
          )}
          <Tooltip />
          <Bar
            dataKey="value"
            fill="#0f766e"
            radius={horizontal ? [0, 10, 10, 0] : [10, 10, 0, 0]}
          >
            <LabelList
              dataKey="value"
              fill="#334155"
              fontSize={12}
              fontWeight={600}
              position={horizontal ? "right" : "top"}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (result.kind === "line") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 28, right: 30, bottom: 40, left: 20 }}>
          <CartesianGrid stroke="#e7e0d4" vertical={false} />
          <XAxis
            dataKey="label"
            height={58}
            label={axisLabel(widget.xField, "ช่วงเวลา")}
            tick={{ fontSize: 12 }}
          />
          <YAxis
            allowDecimals={false}
            label={valueAxisLabel(widget.yField || "จำนวน")}
            tick={{ fontSize: 12 }}
          />
          <Tooltip />
          <Line
            dataKey="value"
            dot={{ fill: "#0f766e", r: 4 }}
            stroke="#0f766e"
            strokeWidth={3}
            type="monotone"
          >
            <LabelList
              dataKey="value"
              fill="#334155"
              fontSize={11}
              fontWeight={600}
              offset={10}
              position="top"
            />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          label={({ name, value, percent }) =>
            `${name}: ${value} (${((percent ?? 0) * 100).toFixed(0)}%)`
          }
          labelLine
          nameKey="label"
          outerRadius={82}
        >
          {data.map((entry) => (
            <Cell key={entry.label} fill={pieColors[data.indexOf(entry) % pieColors.length]} />
          ))}
        </Pie>
        <Legend formatter={(value) => String(value)} />
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}
