import { NextResponse } from "next/server";
import { listDatasets } from "@/lib/dashboard";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(listDatasets());
}
