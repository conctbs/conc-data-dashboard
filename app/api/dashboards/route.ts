import { NextResponse } from "next/server";
import { z } from "zod";
import { listDashboards, saveDashboard } from "@/lib/dashboard";

export const runtime = "nodejs";

const dashboardSchema = z.object({
  id: z.string().optional(),
  datasetId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
  config: z.object({
    datasetId: z.string().min(1),
    widgets: z.array(z.any()),
    filters: z.array(z.any())
  })
});

export async function GET() {
  return NextResponse.json(listDashboards());
}

export async function POST(request: Request) {
  try {
    const payload = dashboardSchema.parse(await request.json());
    return NextResponse.json(saveDashboard(payload), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save dashboard." },
      { status: 400 }
    );
  }
}
