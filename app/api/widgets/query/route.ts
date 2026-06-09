import { NextResponse } from "next/server";
import { queryWidgetData } from "@/lib/dashboard";
import { widgetQuerySchema } from "@/lib/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = widgetQuerySchema.parse(await request.json());
    return NextResponse.json(queryWidgetData(payload.datasetId, payload.widget, payload.filters));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch widget data." },
      { status: 400 }
    );
  }
}
