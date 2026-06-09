import { NextResponse } from "next/server";
import { deleteDashboard, getDashboard, saveDashboard } from "@/lib/dashboard";
import { dashboardPayloadSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dashboard = getDashboard(id);
  if (!dashboard) {
    return NextResponse.json({ error: "Dashboard not found." }, { status: 404 });
  }
  return NextResponse.json(dashboard);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const payload = dashboardPayloadSchema.parse(await request.json());
    return NextResponse.json(saveDashboard({ ...payload, id }));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update dashboard." },
      { status: 400 }
    );
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!deleteDashboard(id)) {
    return NextResponse.json({ error: "Dashboard not found." }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
