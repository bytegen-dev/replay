import { NextResponse } from "next/server";
import { isShareId } from "@/lib/share.ts";
import { deleteShare, ShareUnavailable } from "@/lib/shareStore.ts";

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const token = request.headers.get("x-delete-token") ?? "";
  if (!isShareId(id) || !token) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    // Same answer for a wrong token and a missing share, so ids can't be probed.
    const ok = await deleteShare(id, token);
    return ok ? NextResponse.json({ deleted: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (e) {
    if (e instanceof ShareUnavailable) return NextResponse.json({ error: e.message }, { status: 503 });
    console.error("share delete failed", e);
    return NextResponse.json({ error: "Could not delete this link. Try again." }, { status: 500 });
  }
}
