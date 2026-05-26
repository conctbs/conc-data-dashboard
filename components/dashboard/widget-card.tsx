"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  CartesianGrid,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { DashboardFilter, DashboardWidget, WidgetQueryResult } from "@/lib/types";
import { formatNumber } from "@/lib/utils";
import { LoadingState, ErrorState } from "@/components/shared/states";
import { TableWidget } from "@/components/dashboard/table-widget";

const pieColors = ["#0f766e", "#14b8a6", "#2dd4bf", "#99f6e4", "#115e59", "#0f172a"];

export function WidgetCard({
  datasetId,
  widget,
  filters,
  selected,
  onClick
}: {
  datasetId: string;
  widget: DashboardWidget;
  filters: DashboardFilter[];
  selected?: boolean;
  onClick?: () => void;
}) {
  const [result, setResult] = useState<WidgetQueryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/widgets/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datasetId, widget, filters })
      });
      const json = await response.json();
      if (!response.ok) {
        setError(json.error ?? "Failed to load widget.");
        setLoading(false);
        return;
      }
      setResult(json);
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
      <div className="h-[260px] p-4">
        {loading ? <LoadingState label="Loading widget..." /> : null}
        {error ? <ErrorState message={error} /> : null}
        {!loading && !error && result ? renderWidget(result) : null}
      </div>
    </div>
  );
}

function renderWidget(result: WidgetQueryResult) {
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
  if (result.kind === "bar") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid stroke="#e7e0d4" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip />
          <Bar dataKey="value" fill="#0f766e" radius={[10, 10, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (result.kind === "line") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid stroke="#e7e0d4" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip />
          <Line type="monotone" dataKey="value" stroke="#0f766e" strokeWidth={3} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="label" outerRadius={90}>
          {data.map((entry) => (
            <Cell key={entry.label} fill={pieColors[data.indexOf(entry) % pieColors.length]} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}
