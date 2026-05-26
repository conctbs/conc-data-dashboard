import { NextResponse } from "next/server";
import { getSettings } from "@/lib/dashboard";
import { getAuthStatus } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    app: getSettings(),
    auth: getAuthStatus()
  });
}
