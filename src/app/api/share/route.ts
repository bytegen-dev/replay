import { NextResponse } from "next/server";
import { MAX_SHARE_BYTES, newDeleteToken, parseShare } from "@/lib/share.ts";
import { saveShare, ShareUnavailable } from "@/lib/shareStore.ts";

export async function POST(request: Request) {
  const text = await request.text();
  if (text.length > MAX_SHARE_BYTES) return NextResponse.json({ error: "This result is too large to share." }, { status: 413 });

  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* falls through to the validation error */
  }
  const payload = parseShare(body);
  if (typeof payload === "string") return NextResponse.json({ error: payload }, { status: 400 });

  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const deleteToken = newDeleteToken();
  try {
    const saved = await saveShare(payload, deleteToken, client);
    if (saved === "rate-limited") {
      return NextResponse.json({ error: "Too many shares from this connection. Try again in an hour." }, { status: 429 });
    }
    return NextResponse.json({ id: saved.id, path: `/r/${saved.id}`, deleteToken }, { status: 201 });
  } catch (e) {
    if (e instanceof ShareUnavailable) return NextResponse.json({ error: e.message }, { status: 503 });
    console.error("share save failed", e);
    return NextResponse.json({ error: "Could not save this result. Try again." }, { status: 500 });
  }
}
