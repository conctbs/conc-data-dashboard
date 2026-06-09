import { NextResponse } from "next/server";
import { z } from "zod";
import { createAutomaticDashboard, listDashboards } from "@/lib/dashboard";

export const runtime = "nodejs";

const payloadSchema = z.object({
  datasetId: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    const { datasetId } = payloadSchema.parse(await request.json());
    const existing = listDashboards().find(
      (dashboard) =>
        dashboard.datasetId === datasetId &&
        dashboard.description?.toLowerCase().startsWith("auto-generated")
    );
    return NextResponse.json(createAutomaticDashboard(datasetId, existing?.id), {
      status: existing ? 200 : 201
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate dashboard." },
      { status: 400 }
    );
  }
}
