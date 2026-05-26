import { NextResponse } from "next/server";
import { getDataset } from "@/lib/dashboard";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dataset = getDataset(id);

  if (!dataset) {
    return NextResponse.json({ error: "Dataset not found." }, { status: 404 });
  }

  return NextResponse.json(dataset);
}
