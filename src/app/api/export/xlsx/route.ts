import { NextResponse } from "next/server";
import { parsePayload, xlsxFileName } from "@/lib/exportData.ts";
import { buildWorkbook } from "@/lib/xlsx.ts";


export async function POST(request: Request) {
  const payload = parsePayload(await request.json().catch(() => null));
  if (typeof payload === "string") return NextResponse.json({ error: payload }, { status: 400 });
  const buf = await buildWorkbook(payload);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${xlsxFileName(payload)}"`,
    },
  });
}
