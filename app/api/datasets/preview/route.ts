import { NextResponse } from "next/server";
import { parseWorkbook } from "@/lib/excel";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File is required." }, { status: 400 });
  }

  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !["xlsx", "xls", "csv"].includes(extension)) {
    return NextResponse.json(
      { error: "Unsupported file format. Please upload .xlsx, .xls, or .csv." },
      { status: 400 }
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = parseWorkbook(buffer, file.name);

    if (!workbook.sheets.length) {
      return NextResponse.json(
        { error: "The uploaded file does not contain readable rows." },
        { status: 400 }
      );
    }

    return NextResponse.json(workbook);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to parse file." },
      { status: 500 }
    );
  }
}
