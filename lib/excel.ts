import * as XLSX from "xlsx";
import { slugify, parseNumber, parseDate } from "@/lib/utils";
import type { ColumnType, ParsedWorkbook, SheetPreview } from "@/lib/types";

function isIdentifierColumn(name: string) {
  const normalized = name.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
  return [
    "โทรศัพท์",
    "มือถือ",
    "รหัสไปรษณีย์",
    "อีเมล์",
    "email",
    "lineid",
    "ทะเบียนรถ",
    "phone",
    "mobile",
    "postcode",
    "zipcode"
  ].some((term) => normalized.includes(term));
}

function inferColumnType(name: string, values: unknown[]): ColumnType {
  const meaningful = values.filter((value) => value !== null && value !== "");
  if (meaningful.length === 0) return "text";
  if (isIdentifierColumn(name)) return "text";

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
  const seenHeaders = new Map<string, number>();
  const headers = headerRow.map((cell, index) => {
    const fallback = `Column ${index + 1}`;
    const value = String(cell ?? "").trim();
    const header = value || fallback;
    const count = seenHeaders.get(header) ?? 0;
    seenHeaders.set(header, count + 1);
    return count === 0 ? header : `${header} (${count + 1})`;
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
  const seenSlugs = new Map<string, number>();
  const columns = headers.map((header, index) => {
    const values = records.slice(0, 50).map((row) => row[header]);
    const inferredType = inferColumnType(header, values);
    const baseSlug = slugify(header);
    const count = seenSlugs.get(baseSlug) ?? 0;
    seenSlugs.set(baseSlug, count + 1);

    return {
      name: header,
      slug: count === 0 ? baseSlug : `${baseSlug}_${count + 1}`,
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
