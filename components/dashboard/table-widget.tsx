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
  const table = useReactTable({
    data: rows,
    columns: columns.map((column) =>
      columnHelper.accessor((row) => row[column], {
        id: column,
        header: column,
        cell: (info) => String(info.getValue() ?? "")
      })
    ),
    getCoreRowModel: getCoreRowModel()
  });

  return (
    <div className="overflow-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr className="border-b border-line" key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th className="px-3 py-2 font-medium" key={header.id}>
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
                <td className="px-3 py-2 text-slate-600" key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
