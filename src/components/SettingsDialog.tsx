"use client";

import { Check, KeyRound, RotateCcw, Settings } from "lucide-react";
import { useId, useState } from "react";
import { useSettings } from "@/components/SettingsProvider";
import { ThemeSelector } from "@/components/ThemeSelector";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_SETTINGS } from "@/lib/settings.ts";
import { isTiingoKey } from "@/lib/tiingo.ts";
import { getTiingoKey, setTiingoKey } from "@/lib/userKeys.ts";

function Row({ id, title, note, children }: { id: string; title: string; note: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-4">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-bold">
          {title}
        </label>
        <p id={`${id}-note`} className="mt-0.5 text-xs leading-snug text-muted-foreground">
          {note}
        </p>
      </div>
      {children}
    </div>
  );
}

/** Where a person pastes their own Tiingo key, used for stock prices when Yahoo Finance refuses. Kept in this browser only. */
function StockKey() {
  const uid = useId();
  // Read after mount: the dialog only renders client-side, so localStorage is available here.
  const [saved, setSaved] = useState<string | null>(() => getTiingoKey());
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  function save() {
    const k = draft.trim();
    if (!isTiingoKey(k)) {
      setError("That doesn't look like a Tiingo key. It is a long string of letters and numbers.");
      return;
    }
    if (!setTiingoKey(k)) {
      setError("This browser won't let the key be saved.");
      return;
    }
    setSaved(k);
    setDraft("");
    setError(null);
  }

  return (
    <div className="flex flex-col gap-2 pt-4">
      <label htmlFor={`${uid}-key`} className="flex items-center gap-2 text-sm font-bold">
        <KeyRound className="size-4" aria-hidden />
        Your stock price key
      </label>
      <p className="text-xs leading-snug text-muted-foreground">
        Optional. When Yahoo Finance is rate limiting, stock prices come from Tiingo using your own free key, with the full history and dividends. It stays in this browser and is sent only to look up the prices you ask for.{" "}
        <a href="https://www.tiingo.com/account/api/token" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
          Get a free key
        </a>
        .
      </p>
      {saved ? (
        <div className="flex items-center justify-between gap-3 border border-border px-3 py-2 text-sm">
          <span className="flex items-center gap-2">
            <Check className="size-4 text-primary" aria-hidden />
            Key saved <span className="text-muted-foreground tabular-nums">ending {saved.slice(-4)}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              setTiingoKey(null);
              setSaved(null);
            }}
            className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Remove
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            id={`${uid}-key`}
            type="password"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="Paste your Tiingo key"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={!!error}
            className="form-control-h min-w-0 flex-1 border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <button type="button" onClick={save} disabled={!draft.trim()} className="form-control-h border border-border px-4 text-sm font-bold hover:border-primary hover:text-primary disabled:opacity-40">
            Save
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs font-bold">
          {error}
        </p>
      )}
    </div>
  );
}

/** The footer's Settings button and the box it opens: theme, reduced animation and high contrast. Changes apply at once and are remembered. */
export function SettingsDialog() {
  const { settings, set, reset } = useSettings();
  const uid = useId();
  const changed = JSON.stringify(settings) !== JSON.stringify(DEFAULT_SETTINGS);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className="flex h-8 items-center gap-2 border border-border px-3 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary">
          <Settings className="size-4" aria-hidden />
          Settings
        </button>
      </DialogTrigger>
      <DialogContent>
        <div className="flex flex-col gap-1 pr-6">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Saved in this browser. Changes apply straight away.</DialogDescription>
        </div>

        <div className="divide-y divide-border">
          <div className="flex flex-col gap-3 pb-4">
            <p className="text-sm font-bold">Theme</p>
            <ThemeSelector />
          </div>
          <Row id={`${uid}-motion`} title="Reduce animations" note="Turns off movement and transitions across the app. Your device's own setting is always respected too.">
            <Switch id={`${uid}-motion`} aria-describedby={`${uid}-motion-note`} checked={settings.reduceMotion} onCheckedChange={(v) => set({ reduceMotion: v })} />
          </Row>
          <Row id={`${uid}-contrast`} title="High contrast" note="Brighter text, stronger borders and focus rings, and a plain background.">
            <Switch id={`${uid}-contrast`} aria-describedby={`${uid}-contrast-note`} checked={settings.highContrast} onCheckedChange={(v) => set({ highContrast: v })} />
          </Row>
          <StockKey />
        </div>

        <button
          type="button"
          disabled={!changed}
          onClick={reset}
          className="flex items-center gap-2 self-start text-sm text-muted-foreground underline-offset-4 transition-opacity hover:text-foreground hover:underline disabled:opacity-40"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Reset to defaults
        </button>
      </DialogContent>
    </Dialog>
  );
}
