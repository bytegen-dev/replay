import { NextResponse } from "next/server";
import { addCode, addKey, BadInput, removeCode, removeKey, removeSubscriber, StoreUnavailable, updateCode } from "@/lib/accessStore.ts";
import { isAdmin } from "@/lib/adminAuth.ts";
import { vaultReady } from "@/lib/vault.ts";
import { isTiingoKey } from "@/lib/tiingo.ts";

const noStore = { "cache-control": "no-store" };
const text = (x: unknown, max = 60) => (typeof x === "string" ? x.trim().slice(0, max) : "");
const idOf = (x: unknown) => (typeof x === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(x) ? x : null);

/** Every change the admin page can make, as `{ action, ... }`. Only for a signed-in admin, and only as JSON. */
export async function POST(request: Request) {
  if (!isAdmin(request)) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers: noStore });
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) return NextResponse.json({ error: "Send JSON." }, { status: 415, headers: noStore });
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b.action !== "string") return NextResponse.json({ error: "Missing action." }, { status: 400, headers: noStore });

  try {
    switch (b.action) {
      case "removeSubscriber": {
        const email = text(b.email, 254);
        if (!email) throw new BadInput("Which address?");
        await removeSubscriber(email);
        return NextResponse.json({ ok: true }, { headers: noStore });
      }
      case "addKey": {
        const key = text(b.key, 200);
        if (!isTiingoKey(key)) throw new BadInput("That doesn't look like a Tiingo key. It is a long string of letters and numbers.");
        if (!vaultReady()) throw new BadInput("ADMIN_PASSWORD must be set (8 or more characters) to store keys.");
        const id = await addKey(text(b.label) || "Tiingo key", key);
        return NextResponse.json({ ok: true, id }, { headers: noStore });
      }
      case "removeKey": {
        const id = idOf(b.id);
        if (!id) throw new BadInput("Which key?");
        await removeKey(id);
        return NextResponse.json({ ok: true }, { headers: noStore });
      }
      case "addCode": {
        const made = await addCode({ code: text(b.code, 4), label: text(b.label), keyId: idOf(b.keyId) });
        return NextResponse.json({ ok: true, ...made }, { headers: noStore });
      }
      case "updateCode": {
        const id = idOf(b.id);
        if (!id) throw new BadInput("Which code?");
        await updateCode(id, {
          ...(typeof b.enabled === "boolean" ? { enabled: b.enabled } : {}),
          ...(typeof b.label === "string" ? { label: text(b.label) } : {}),
          ...("keyId" in b ? { keyId: idOf(b.keyId) } : {}),
          ...(typeof b.code === "string" ? { code: text(b.code, 4) } : {}),
        });
        return NextResponse.json({ ok: true }, { headers: noStore });
      }
      case "removeCode": {
        const id = idOf(b.id);
        if (!id) throw new BadInput("Which code?");
        await removeCode(id);
        return NextResponse.json({ ok: true }, { headers: noStore });
      }
      default:
        throw new BadInput("Unknown action.");
    }
  } catch (e) {
    if (e instanceof BadInput) return NextResponse.json({ error: e.message }, { status: 400, headers: noStore });
    if (e instanceof StoreUnavailable) return NextResponse.json({ error: e.message }, { status: 503, headers: noStore });
    console.error("admin action failed", e);
    return NextResponse.json({ error: "That didn't work. Try again." }, { status: 500, headers: noStore });
  }
}
