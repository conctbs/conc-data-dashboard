import * as XLSX from "xlsx";
import { slugify, parseNumber, parseDate } from "@/lib/utils";
import type { ColumnType, ParsedWorkbook, SheetPreview } from "@/lib/types";

function inferColumnType(values: unknown[]): ColumnType {
  const meaningful = values.filter((value) => value !== null && value !== "");
  if (meaningful.length === 0) return "text";

  const numberHits = meaningful.filter((value) => parseNumber(value) !== null).length;
  const dateHits = meaningful.filter((value) => parseDate(value) !== null).length;
  const uniqueCount = new Set(meaningful.map(String)).size;

  if (numberHits / meaningful.length > 0.8) return "number";
  if (dateHits / meaningful.length > 0.8) return "date";
  if (uniqueCount / meaningful.length < 0.5) return "category";
  return "text";
}

function rowsToObjects(rows: unknown[][]): Record<string, unknown>[] {
  const [headerRow = [], ...bodyRows] = rows;
  const headers = headerRow.map((cell, index) => {
    const fallback = `Column ${index + 1}`;
    const value = String(cell ?? "").trim();
    return value || fallback;
  });

  return bodyRows
    .filter((row) => row.some((cell) => cell !== null && cell !== ""))
    .map((row) =>
      headers.reduce<Record<string, unknown>>((acc, header, index) => {
        acc[header] = row[index] ?? null;
        return acc;
      }, {})
    );
}

function buildSheetPreview(name: string, rows: unknown[][]): SheetPreview {
  const records = rowsToObjects(rows);
  const headers = Object.keys(records[0] ?? {});
  const columns = headers.map((header, index) => {
    const values = records.slice(0, 50).map((row) => row[header]);
    const inferredType = inferColumnType(values);

    return {
      name: header,
      slug: slugify(header),
      inferredType,
      selectedType: inferredType
    };
  });

  return {
    name,
    rowCount: records.length,
    columns,
    rows: records.slice(0, 20),
    allRows: records
  };
}

export function parseWorkbook(buffer: Buffer, fileName: string): ParsedWorkbook {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheets = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: null
    });
    return buildSheetPreview(sheetName, rows);
  }).filter((sheet) => sheet.columns.length > 0);

  return {
    datasetName: fileName.replace(/\.[^.]+$/, ""),
    fileName,
    fileType: fileName.split(".").pop()?.toLowerCase() ?? "xlsx",
    sheets
  };
}
