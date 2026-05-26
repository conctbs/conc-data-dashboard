import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteDashboard, getDashboard, saveDashboard } from "@/lib/dashboard";

export const runtime = "nodejs";

const dashboardSchema = z.object({
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
    const payload = dashboardSchema.parse(await request.json());
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
  deleteDashboard(id);
  return NextResponse.json({ success: true });
}
