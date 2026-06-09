"use client";

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable
} from "@tanstack/react-table";

export function TableWidget({
  rows,
  columns
}: {
  rows: Record<string, unknown>[];
  columns: string[];
}) {
  const columnHelper = createColumnHelper<Record<string, unknown>>();
  function formatCellValue(value: unknown) {
    if (value === null || value === undefined || value === "") return "-";
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        return new Intl.DateTimeFormat("th-TH", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        }).format(date);
      }
    }
    return String(value);
  }

  const table = useReactTable({
    data: rows,
    columns: columns.map((column, index) =>
      columnHelper.accessor((row) => row[column], {
        id: `${column}_${index}`,
        header: column,
        cell: (info) => formatCellValue(info.getValue())
      })
    ),
    getCoreRowModel: getCoreRowModel()
  });

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
        <span>แสดงข้อมูล {rows.length.toLocaleString("th-TH")} รายการ</span>
        <span>{columns.length.toLocaleString("th-TH")} คอลัมน์</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-line">
        <table className="w-max min-w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-white">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr className="border-b border-line" key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    className="min-w-36 whitespace-nowrap border-b border-line px-3 py-3 font-medium"
                    key={header.id}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr className="border-b border-line/70" key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td
                    className="max-w-80 whitespace-normal px-3 py-3 align-top leading-5 text-slate-600"
                    key={cell.id}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
