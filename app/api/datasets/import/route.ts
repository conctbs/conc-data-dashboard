import { NextResponse } from "next/server";
import { z } from "zod";
import { saveDatasetFromPreview } from "@/lib/dashboard";

export const runtime = "nodejs";

const payloadSchema = z
  .object({
    datasetName: z.string().trim().min(1).max(200),
    fileName: z.string().min(1).max(255),
    fileType: z.enum(["xlsx", "xls", "csv"]),
    sheets: z
      .array(
        z.object({
          name: z.string().min(1),
          rowCount: z.number().int().nonnegative(),
          columns: z
            .array(
              z.object({
                name: z.string().min(1),
                slug: z.string().min(1),
                inferredType: z.enum(["text", "number", "date", "category"]),
                selectedType: z.enum(["text", "number", "date", "category"])
              })
            )
            .min(1)
            .max(1000),
          rows: z.array(z.record(z.unknown())).max(100),
          allRows: z.array(z.record(z.unknown())).max(100000)
        })
      )
      .min(1)
      .max(100)
  })
  .superRefine((payload, context) => {
    const sheetNames = payload.sheets.map((sheet) => sheet.name);
    if (new Set(sheetNames).size !== sheetNames.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Sheet names must be unique.",
        path: ["sheets"]
      });
    }

    payload.sheets.forEach((sheet, sheetIndex) => {
      const columnNames = sheet.columns.map((column) => column.name);
      const columnSlugs = sheet.columns.map((column) => column.slug);
      if (new Set(columnNames).size !== columnNames.length || new Set(columnSlugs).size !== columnSlugs.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Column names and slugs must be unique within a sheet.",
          path: ["sheets", sheetIndex, "columns"]
        });
      }
    });
  });

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const payload = payloadSchema.parse(json);
    const result = saveDatasetFromPreview(payload);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to import dataset." },
      { status: 400 }
    );
  }
}
