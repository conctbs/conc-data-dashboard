import { NextResponse } from "next/server";
import { listDashboards, saveDashboard } from "@/lib/dashboard";
import { dashboardPayloadSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(listDashboards());
}

export async function POST(request: Request) {
  try {
    const payload = dashboardPayloadSchema.parse(await request.json());
    return NextResponse.json(saveDashboard(payload), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save dashboard." },
      { status: 400 }
    );
  }
}
