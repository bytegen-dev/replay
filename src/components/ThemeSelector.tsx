"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSettings } from "@/components/SettingsProvider";
import type { ThemePref } from "@/lib/settings.ts";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ThemePref; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "system", label: "System", Icon: Monitor },
  { value: "dark", label: "Dark", Icon: Moon },
];

/** Light, System or Dark as one segmented control with a highlight that slides to the chosen option. */
export function ThemeSelector({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { settings, set } = useSettings();
  const index = OPTIONS.findIndex((o) => o.value === settings.theme);
  return (
    <div role="radiogroup" aria-label="Theme" className={cn("relative grid grid-cols-3 border border-border", className)}>
      {/* The sliding highlight sits under the three buttons and moves a full third per step. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1/3 bg-primary transition-transform duration-300 ease-[cubic-bezier(0.34,1.3,0.5,1)]"
        style={{ transform: `translateX(${Math.max(index, 0) * 100}%)` }}
      />
      {OPTIONS.map(({ value, label, Icon }) => {
        const on = settings.theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={label}
            onClick={() => set({ theme: value })}
            className={cn("relative z-10 flex items-center justify-center gap-2 text-sm transition-colors duration-300", compact ? "h-8 px-3" : "h-10 px-3", on ? "font-bold text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {!compact && label}
          </button>
        );
      })}
    </div>
  );
}
