"use client";

import { Check, Copy, Download, KeyRound, LogOut, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Data {
  subscribers: { email: string; createdAt: string }[];
  keys: { id: string; label: string; last4: string; createdAt: string; codes: number }[];
  codes: { id: string; code: string; label: string; keyId: string | null; enabled: boolean; uses: number; lastUsedAt: string | null; createdAt: string }[];
  env: { code: boolean; key: boolean };
}
type Phase = "loading" | "unavailable" | "login" | "ready";

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "never");
const field = "form-control-h min-w-0 border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const small = "h-8 border border-border px-3 text-xs font-bold transition-colors hover:border-primary hover:text-primary disabled:opacity-40";

async function call(body: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/admin/act", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    return res.ok ? { ok: true } : { ok: false, error: j?.error ?? `Failed (${res.status})` };
  } catch {
    return { ok: false, error: "Couldn't reach the site." };
  }
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border border-border bg-card p-4 sm:p-6">
      <div>
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        {note && <p className="mt-1 text-sm leading-snug text-muted-foreground">{note}</p>}
      </div>
      {children}
    </section>
  );
}

/** The admin page: sign in, then the subscriber list, the Tiingo keys and the access codes. */
export function AdminApp() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [data, setData] = useState<Data | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/data", { cache: "no-store" });
      if (res.status === 401) {
        const s = (await (await fetch("/api/admin/session", { cache: "no-store" })).json()) as { configured?: boolean };
        setPhase(s.configured ? "login" : "unavailable");
        return;
      }
      const j = await res.json();
      if (!res.ok) {
        setError(j?.error ?? "Could not load the data.");
        setPhase("ready");
        return;
      }
      setData(j as Data);
      setError(null);
      setPhase("ready");
    } catch {
      setError("Couldn't reach the site.");
      setPhase("ready");
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [load]);

  async function act(body: unknown, done?: string): Promise<boolean> {
    setMessage(null);
    const r = await call(body);
    if (!r.ok) {
      setError(r.error ?? "That didn't work.");
      return false;
    }
    setError(null);
    if (done) setMessage(done);
    await load();
    return true;
  }

  if (phase === "loading") return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (phase === "unavailable") return <p className="border border-border p-4 text-sm">The admin page is not set up. Set ADMIN_PASSWORD (8 or more characters) in the environment.</p>;
  if (phase === "login") return <Login onDone={load} />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-heading text-2xl font-medium tracking-tight sm:text-3xl">Admin</h1>
        <button
          type="button"
          onClick={async () => {
            await fetch("/api/admin/session", { method: "DELETE" });
            setData(null);
            setPhase("login");
          }}
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <LogOut className="size-4" aria-hidden /> Sign out
        </button>
      </div>
      {error && (
        <p role="alert" className="border border-destructive px-4 py-3 text-sm font-bold">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="flex items-center gap-2 text-sm text-primary">
          <Check className="size-4" aria-hidden /> {message}
        </p>
      )}
      {data && (
        <>
          <Codes data={data} act={act} />
          <Keys data={data} act={act} />
          <Subscribers data={data} act={act} />
        </>
      )}
    </div>
  );
}

function Login({ onDone }: { onDone: () => void | Promise<void> }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: pw }) });
      if (res.ok) {
        setPw("");
        await onDone();
      } else {
        setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Couldn't sign in.");
      }
    } catch {
      setError("Couldn't reach the site.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-sm flex-col gap-4 border border-border bg-card p-5 sm:p-6">
      <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight">
        <KeyRound className="size-5" aria-hidden /> Admin
      </h1>
      <label htmlFor="admin-pw" className="text-sm text-muted-foreground">
        Password
      </label>
      <input id="admin-pw" type="password" autoComplete="current-password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} aria-invalid={!!error} className={cn(field, "w-full")} />
      {error && (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy || !pw} className="form-control-h rounded-none border-2 border-primary font-bold">
        {busy ? "Signing in" : "Sign in"}
      </Button>
    </form>
  );
}

type Act = (body: unknown, done?: string) => Promise<boolean>;

function Codes({ data, act }: { data: Data; act: Act }) {
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [keyId, setKeyId] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const keyName = (id: string | null) => (id ? (data.keys.find((k) => k.id === id)?.label ?? "Unknown key") : data.env.key ? "Site key (environment)" : "No key");

  return (
    <Section title="Access codes" note="A four-digit code lets a browser use a Tiingo key for stock prices (people enter it with Cmd+K, or at /access-code on a phone). Turn a code off to cut it off at once.">
      {data.env.code && <p className="text-xs text-muted-foreground">The built-in code from ACCESS_CODE also works. Change or remove it in the environment.</p>}
      {data.codes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No codes yet.</p>
      ) : (
        <ul className="flex flex-col">
          {data.codes.map((c) => (
            <li key={c.id} className={cn("flex flex-col gap-3 border-b border-border/60 py-3", !c.enabled && "opacity-60")}>
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  title="Copy"
                  onClick={() => {
                    void navigator.clipboard?.writeText(c.code);
                    setCopied(c.id);
                    setTimeout(() => setCopied(null), 1500);
                  }}
                  className="flex items-center gap-2 text-xl font-bold tabular-nums tracking-widest hover:text-primary"
                >
                  {c.code}
                  {copied === c.id ? <Check className="size-4 text-primary" aria-hidden /> : <Copy className="size-4 text-muted-foreground" aria-hidden />}
                </button>
                <div className="flex items-center gap-4">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                    <input type="checkbox" checked={c.enabled} onChange={(e) => void act({ action: "updateCode", id: c.id, enabled: e.target.checked })} className="size-4 cursor-pointer accent-primary" />
                    {c.enabled ? "On" : "Off"}
                  </label>
                  <button
                    type="button"
                    aria-label="Delete code"
                    onClick={() => confirm(`Delete code ${c.code}? Browsers that used it lose access.`) && void act({ action: "removeCode", id: c.id }, "Code deleted.")}
                    className="p-1 text-muted-foreground transition-colors hover:text-destructive"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  defaultValue={c.label}
                  aria-label="Label"
                  placeholder="Who is it for?"
                  onBlur={(e) => e.target.value !== c.label && void act({ action: "updateCode", id: c.id, label: e.target.value })}
                  className="h-9 min-w-0 border border-border bg-transparent px-3 text-sm outline-none focus-visible:border-ring"
                />
                <select value={c.keyId ?? ""} aria-label="Tiingo key" onChange={(e) => void act({ action: "updateCode", id: c.id, keyId: e.target.value || null })} className="h-9 min-w-0 border border-border bg-card px-2 text-sm">
                  <option value="">{data.env.key ? "Site key (environment)" : "No key"}</option>
                  {data.keys.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label} …{k.last4}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-muted-foreground">
                Used {c.uses} {c.uses === 1 ? "time" : "times"} · last {day(c.lastUsedAt)} · made {day(c.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await act({ action: "addCode", code, label, keyId: keyId || null }, "Code added.")) {
            setCode("");
            setLabel("");
          }
        }}
      >
        <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder="4 digits (blank = random)" aria-label="New code" className={cn(field, "sm:w-52")} />
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional)" aria-label="Label" className={cn(field, "flex-1")} />
        <select value={keyId} onChange={(e) => setKeyId(e.target.value)} aria-label="Tiingo key for the new code" className="form-control-h border border-input bg-card px-2 text-sm">
          <option value="">{keyName(null)}</option>
          {data.keys.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label} …{k.last4}
            </option>
          ))}
        </select>
        <Button type="submit" className="form-control-h rounded-none border-2 border-primary px-4 text-sm font-bold">
          Add code
        </Button>
      </form>
    </Section>
  );
}

function Keys({ data, act }: { data: Data; act: Act }) {
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  return (
    <Section title="Tiingo keys" note="Keys are stored encrypted and never shown again; only the last four characters are. Link a key to a code above. A code with no key uses the site key from the environment, if there is one.">
      {data.keys.length === 0 ? (
        <p className="text-sm text-muted-foreground">No keys added.</p>
      ) : (
        <ul className="flex flex-col">
          {data.keys.map((k) => (
            <li key={k.id} className="flex items-center justify-between gap-3 border-b border-border/60 py-2 text-sm">
              <span className="min-w-0">
                <b>{k.label}</b> <span className="text-muted-foreground tabular-nums">…{k.last4}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {k.codes} {k.codes === 1 ? "code" : "codes"} · added {day(k.createdAt)}
                </span>
              </span>
              <button
                type="button"
                aria-label="Delete key"
                onClick={() => confirm(`Delete the key "${k.label}"? ${k.codes ? "Codes using it fall back to the site key." : ""}`) && void act({ action: "removeKey", id: k.id }, "Key deleted.")}
                className="p-1 text-muted-foreground transition-colors hover:text-destructive"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await act({ action: "addKey", label, key }, "Key added.")) {
            setLabel("");
            setKey("");
          }
        }}
      >
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label, e.g. Main" aria-label="Key label" className={cn(field, "sm:w-48")} />
        <input value={key} onChange={(e) => setKey(e.target.value)} type="password" autoComplete="off" spellCheck={false} placeholder="Paste the Tiingo key" aria-label="Tiingo key" className={cn(field, "flex-1")} />
        <Button type="submit" disabled={!key.trim()} className="form-control-h rounded-none border-2 border-primary px-4 text-sm font-bold">
          Add key
        </Button>
      </form>
    </Section>
  );
}

function Subscribers({ data, act }: { data: Data; act: Act }) {
  const [copied, setCopied] = useState(false);
  const list = data.subscribers;
  function csv() {
    const body = ["email,subscribed", ...list.map((s) => `${s.email},${s.createdAt.slice(0, 10)}`)].join("\n");
    const url = URL.createObjectURL(new Blob([body], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "replay-subscribers.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <Section title={`Subscribers (${list.length})`} note="Everyone who asked to hear about new features, newest first.">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!list.length}
          className={cn(small, "flex items-center gap-1.5")}
          onClick={() => {
            void navigator.clipboard?.writeText(list.map((s) => s.email).join(", "));
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />} Copy all addresses
        </button>
        <button type="button" disabled={!list.length} onClick={csv} className={cn(small, "flex items-center gap-1.5")}>
          <Download className="size-3.5" aria-hidden /> Download CSV
        </button>
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">No subscribers yet.</p>
      ) : (
        <ul className="flex max-h-[28rem] flex-col overflow-y-auto">
          {list.map((s) => (
            <li key={s.email} className="flex items-center justify-between gap-3 border-b border-border/60 py-2 text-sm">
              <span className="min-w-0 truncate">{s.email}</span>
              <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                {day(s.createdAt)}
                <button type="button" aria-label={`Remove ${s.email}`} onClick={() => confirm(`Remove ${s.email} from the list?`) && void act({ action: "removeSubscriber", email: s.email }, "Removed.")} className="p-1 transition-colors hover:text-destructive">
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
