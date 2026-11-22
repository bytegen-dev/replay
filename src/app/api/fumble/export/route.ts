import { NextResponse } from "next/server";
import { buildFumbleWorkbook, fumbleFileName, parseFumbleExport } from "@/lib/fumble/export.ts";

/**
 * The scan result as a spreadsheet.
 *
 *   POST <the ApiResult a finished scan returned>
 *
 * The page sends back the result it already holds, so nothing is scanned again and nothing is stored: this only lays the numbers out as a file.
 */
export async function POST(request: Request) {
  const result = parseFumbleExport(await request.json().catch(() => null));
  if (typeof result === "string") return NextResponse.json({ error: result }, { status: 400 });
  const buf = await buildFumbleWorkbook(result);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${fumbleFileName(result)}"`,
      "cache-control": "no-store",
    },
  });
}
