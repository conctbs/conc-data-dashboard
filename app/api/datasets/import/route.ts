import { NextResponse } from "next/server";
import { z } from "zod";
import { saveDatasetFromPreview } from "@/lib/dashboard";

export const runtime = "nodejs";

const payloadSchema = z.object({
  datasetName: z.string().min(1),
  fileName: z.string().min(1),
  fileType: z.string().min(1),
  sheets: z.array(
    z.object({
      name: z.string().min(1),
      rowCount: z.number().int().nonnegative(),
      columns: z.array(
        z.object({
          name: z.string().min(1),
          slug: z.string().min(1),
          inferredType: z.enum(["text", "number", "date", "category"]),
          selectedType: z.enum(["text", "number", "date", "category"])
        })
      ),
      rows: z.array(z.record(z.any())),
      allRows: z.array(z.record(z.any()))
    })
  )
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
