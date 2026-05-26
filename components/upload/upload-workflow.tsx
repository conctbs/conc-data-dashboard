"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ColumnType, ParsedWorkbook } from "@/lib/types";
import { ErrorState, LoadingState } from "@/components/shared/states";

const columnTypes: ColumnType[] = ["text", "number", "date", "category"];

export function UploadWorkflow() {
  const router = useRouter();
  const [preview, setPreview] = useState<ParsedWorkbook | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPreviewing, startPreview] = useTransition();
  const [isImporting, startImport] = useTransition();

  function handleFileChange(file: File | null) {
    setError(null);
    if (!file) return;

    startPreview(async () => {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/datasets/preview", {
        method: "POST",
        body: formData
      });

      const json = await response.json();
      if (!response.ok) {
        setError(json.error ?? "Failed to preview file.");
        return;
      }

      setPreview(json);
    });
  }

  function updateColumnType(sheetIndex: number, columnIndex: number, value: ColumnType) {
    setPreview((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      next.sheets[sheetIndex].columns[columnIndex].selectedType = value;
      return next;
    });
  }

  function importDataset() {
    if (!preview) return;

    startImport(async () => {
      const response = await fetch("/api/datasets/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preview)
      });

      const json = await response.json();
      if (!response.ok) {
        setError(json.error ?? "Failed to import dataset.");
        return;
      }

      router.push(`/builder?datasetId=${json.datasetId}&dashboardId=${json.dashboardId}`);
    });
  }

  return (
    <div className="space-y-6">
      <section className="card p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Upload Data</p>
            <h2 className="mt-2 text-2xl font-semibold">Import Excel, CSV, or multi-sheet workbooks</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              The file is parsed first for preview and type mapping before it is written to SQLite.
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center justify-center rounded-2xl bg-accent px-5 py-3 text-sm font-medium text-white">
            Choose file
            <input
              className="hidden"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
            />
          </label>
        </div>
      </section>

      {error ? <ErrorState message={error} /> : null}
      {isPreviewing ? <LoadingState label="Parsing workbook and preparing preview..." /> : null}

      {!preview && !isPreviewing ? (
        <section className="grid gap-4 lg:grid-cols-3">
          <div className="card p-5">
            <p className="font-medium">Supported files</p>
            <p className="mt-2 text-sm text-slate-600">`.xlsx`, `.xls`, and `.csv` with multiple sheets where available.</p>
          </div>
          <div className="card p-5">
            <p className="font-medium">Type mapping</p>
            <p className="mt-2 text-sm text-slate-600">Override inferred fields to `text`, `number`, `date`, or `category` before import.</p>
          </div>
          <div className="card p-5">
            <p className="font-medium">Auto dashboard</p>
            <p className="mt-2 text-sm text-slate-600">A starter dashboard is created immediately after the dataset is saved.</p>
          </div>
        </section>
      ) : null}

      {preview ? (
        <section className="space-y-6">
          <div className="card p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-xl font-semibold">{preview.datasetName}</h3>
                <p className="text-sm text-slate-500">
                  {preview.fileName} • {preview.sheets.length} sheet(s)
                </p>
              </div>
              <button
                className="rounded-2xl bg-accent px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
                disabled={isImporting}
                onClick={importDataset}
                type="button"
              >
                {isImporting ? "Importing..." : "Import to database"}
              </button>
            </div>
          </div>

          {preview.sheets.map((sheet, sheetIndex) => (
            <div className="card overflow-hidden" key={sheet.name}>
              <div className="border-b border-line px-6 py-4">
                <h4 className="font-semibold">{sheet.name}</h4>
                <p className="text-sm text-slate-500">{sheet.rowCount} row(s) detected</p>
              </div>

              <div className="grid gap-6 p-6 lg:grid-cols-[320px_1fr]">
                <div className="space-y-3">
                  <p className="text-sm font-medium">Column types</p>
                  {sheet.columns.map((column, columnIndex) => (
                    <div className="rounded-2xl border border-line bg-white p-3" key={column.slug}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">{column.name}</p>
                          <p className="text-xs text-slate-500">Detected as {column.inferredType}</p>
                        </div>
                        <select
                          className="rounded-xl border border-line bg-shell px-3 py-2 text-sm"
                          value={column.selectedType}
                          onChange={(event) =>
                            updateColumnType(sheetIndex, columnIndex, event.target.value as ColumnType)
                          }
                        >
                          {columnTypes.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="overflow-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-line">
                        {sheet.columns.map((column) => (
                          <th className="px-3 py-2 font-medium" key={column.slug}>
                            {column.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sheet.rows.map((row, rowIndex) => (
                        <tr className="border-b border-line/70" key={rowIndex}>
                          {sheet.columns.map((column) => (
                            <td className="px-3 py-2 text-slate-600" key={column.slug}>
                              {String(row[column.name] ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
