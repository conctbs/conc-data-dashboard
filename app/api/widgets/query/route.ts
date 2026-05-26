import { NextResponse } from "next/server";
import { z } from "zod";
import { queryWidgetData } from "@/lib/dashboard";

export const runtime = "nodejs";

const querySchema = z.object({
  datasetId: z.string().min(1),
  widget: z.any(),
  filters: z.array(z.any()).default([])
});

export async function POST(request: Request) {
  try {
    const payload = querySchema.parse(await request.json());
    return NextResponse.json(queryWidgetData(payload.datasetId, payload.widget, payload.filters));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch widget data." },
      { status: 400 }
    );
  }
}
