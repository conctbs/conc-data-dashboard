"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DatasetRecord } from "@/lib/types";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";

export function DatasetsPage() {
  const [items, setItems] = useState<DatasetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const response = await fetch("/api/datasets");
      const json = await response.json();
      if (!response.ok) {
        setError(json.error ?? "Failed to load datasets.");
        setLoading(false);
        return;
      }
      setItems(json);
      setLoading(false);
    }

    void load();
  }, []);

  if (loading) return <LoadingState label="Loading datasets..." />;
  if (error) return <ErrorState message={error} />;
  if (!items.length) {
    return (
      <EmptyState
        title="No datasets imported yet"
        description="Start from Upload Data to bring Excel or CSV files into SQLite and generate dashboards."
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="card p-6">
        <h2 className="text-2xl font-semibold">Dataset List</h2>
        <p className="mt-2 text-sm text-slate-500">Browse imported files and jump into dashboard building.</p>
      </section>

      <div className="card overflow-hidden">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-white/60">
            <tr className="border-b border-line">
              <th className="px-5 py-3 font-medium">Dataset</th>
              <th className="px-5 py-3 font-medium">File</th>
              <th className="px-5 py-3 font-medium">Rows</th>
              <th className="px-5 py-3 font-medium">Sheets</th>
              <th className="px-5 py-3 font-medium">Updated</th>
              <th className="px-5 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((dataset) => (
              <tr className="border-b border-line/70" key={dataset.id}>
                <td className="px-5 py-4 font-medium">{dataset.name}</td>
                <td className="px-5 py-4 text-slate-600">{dataset.sourceFileName}</td>
                <td className="px-5 py-4 text-slate-600">{dataset.rowCount}</td>
                <td className="px-5 py-4 text-slate-600">{dataset.sheetCount}</td>
                <td className="px-5 py-4 text-slate-600">
                  {new Date(dataset.updatedAt).toLocaleString()}
                </td>
                <td className="px-5 py-4">
                  <Link
                    className="rounded-xl bg-accent px-4 py-2 text-white"
                    href={`/builder?datasetId=${dataset.id}`}
                  >
                    Open builder
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
