"use client";

import { RotateCcw, Settings } from "lucide-react";
import { useId } from "react";
import { useSettings } from "@/components/SettingsProvider";
import { ThemeSelector } from "@/components/ThemeSelector";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_SETTINGS } from "@/lib/settings.ts";

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
