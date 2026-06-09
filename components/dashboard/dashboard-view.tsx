"use client";

import { useEffect, useState } from "react";
import type { DashboardFilter, DashboardRecord } from "@/lib/types";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { WidgetCard } from "@/components/dashboard/widget-card";
import { ExportActions } from "@/components/dashboard/export-actions";
import { cn } from "@/lib/utils";
import { parseJsonResponse } from "@/lib/http";

export function DashboardView({ dashboardId }: { dashboardId: string }) {
  const [dashboard, setDashboard] = useState<DashboardRecord | null>(null);
  const [filters, setFilters] = useState<DashboardFilter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const response = await fetch(`/api/dashboards/${dashboardId}`);
      const { body, error: responseError } = await parseJsonResponse<DashboardRecord>(response);
      if (!response.ok || responseError || !body) {
        setError(responseError ?? "Failed to load dashboard.");
        setLoading(false);
        return;
      }
      setDashboard(body);
      setFilters(body.config.filters);
      setLoading(false);
    }
    void load();
  }, [dashboardId]);

  if (loading) return <LoadingState label="Loading dashboard..." />;
  if (error || !dashboard) return <ErrorState message={error ?? "Dashboard not found."} />;

  function updateFilter(filterId: string, partial: Partial<DashboardFilter>) {
    setFilters((current) =>
      current.map((filter) => (filter.id === filterId ? { ...filter, ...partial } as DashboardFilter : filter))
    );
  }

  return (
    <div className="space-y-6">
      <section className="card p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold">{dashboard.name}</h2>
            <p className="mt-2 text-sm text-slate-500">{dashboard.description ?? "Published dashboard view"}</p>
          </div>
          <ExportActions targetId="dashboard-export" />
        </div>
      </section>

      <section className="grid gap-4" id="dashboard-export">
        <div className="grid grid-cols-12 gap-4">
          {dashboard.config.widgets.map((widget) => (
            <div
              className={cn("col-span-12", widget.layout.w <= 3 && "lg:col-span-3", widget.layout.w === 4 && "lg:col-span-4", widget.layout.w >= 5 && widget.layout.w <= 6 && "lg:col-span-6", widget.layout.w >= 7 && widget.layout.w <= 8 && "lg:col-span-8", widget.layout.w >= 9 && "lg:col-span-12")}
              key={widget.id}
            >
              <WidgetCard
                datasetId={dashboard.datasetId}
                filters={filters}
                onFilterChange={updateFilter}
                widget={widget}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
