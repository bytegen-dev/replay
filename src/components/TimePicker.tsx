"use client";

import { Clock } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { parseTime } from "@/lib/when.ts";
import { cn } from "@/lib/utils";

const SIZE = 208;
const C = SIZE / 2;
const R_NUM = 78; // radius the numbers sit on
const pad = (n: number) => String(n).padStart(2, "0");

/** "1:40pm" for the text box, from the clock's 12-hour parts. */
export function formatClock(hour12: number, minute: number, pm: boolean): string {
  return `${hour12}:${pad(minute)}${pm ? "pm" : "am"}`;
}

/** An analog clock: pick the hour, then the minute, and choose AM or PM. Opens on whatever time the box already holds. */
function Clock12({ value, onPick, onClear }: { value: string; onPick: (text: string) => void; onClear: () => void }) {
  const start = value.trim() ? parseTime(value) : null;
  const parsed = start && typeof start !== "string" ? start : null;
  const [hour, setHour] = useState(parsed ? parsed.hour % 12 || 12 : 12);
  const [minute, setMinute] = useState(parsed ? parsed.minute : 0);
  const [pm, setPm] = useState(parsed ? parsed.hour >= 12 : false);
  const [stage, setStage] = useState<"hour" | "minute">("hour");
  // The hand's turn in degrees. It is only ever moved by the shortest way round, so going from 11 to 1 doesn't spin back through 6.
  const [rot, setRot] = useState(() => ((parsed ? parsed.hour % 12 || 12 : 12) % 12) * 30);
  const [drag, setDrag] = useState(false);
  const aim = (deg: number) => setRot((r) => r + ((((deg - r) % 360) + 540) % 360) - 180);
  const goStage = (next: "hour" | "minute") => {
    setStage(next);
    aim(next === "hour" ? (hour % 12) * 30 : minute * 6);
  };
  const face = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  // Where the press began, so a slight wobble during a click isn't mistaken for a drag.
  const downAt = useRef<{ x: number; y: number } | null>(null);

  /** The angle of the pointer around the clock's centre, clockwise from 12, in degrees. */
  function angleOf(e: React.PointerEvent) {
    const r = face.current!.getBoundingClientRect();
    const x = e.clientX - (r.left + r.width / 2);
    const y = e.clientY - (r.top + r.height / 2);
    return (Math.atan2(x, -y) * 180) / Math.PI + (x < 0 ? 360 : 0);
  }
  function setFromPointer(e: React.PointerEvent) {
    const a = angleOf(e);
    if (stage === "hour") {
      const h = Math.round(a / 30) % 12 || 12;
      setHour(h);
      aim((h % 12) * 30);
    } else {
      const m = Math.round(a / 6) % 60;
      setMinute(m);
      aim(m * 6);
    }
  }

  const reach = R_NUM;
  const tipBig = stage === "hour" || minute % 5 === 0;
  const marks = stage === "hour" ? Array.from({ length: 12 }, (_, i) => ({ label: String(i === 0 ? 12 : i), pos: i * 30, on: (i === 0 ? 12 : i) === hour })) : Array.from({ length: 12 }, (_, i) => ({ label: pad(i * 5), pos: i * 30, on: i * 5 === minute }));

  return (
    <div className="flex flex-col items-center gap-3">
      {/* The digital readout doubles as the switch between choosing hours and minutes. */}
      <div className="flex items-center gap-2 text-2xl font-bold tabular-nums">
        <button type="button" onClick={() => goStage("hour")} aria-pressed={stage === "hour"} className={cn("px-1.5 py-0.5", stage === "hour" ? "bg-primary text-primary-foreground" : "bg-secondary")}>
          {pad(hour)}
        </button>
        :
        <button type="button" onClick={() => goStage("minute")} aria-pressed={stage === "minute"} className={cn("px-1.5 py-0.5", stage === "minute" ? "bg-primary text-primary-foreground" : "bg-secondary")}>
          {pad(minute)}
        </button>
        <div role="group" aria-label="AM or PM" className="ml-1 flex flex-col text-xs">
          {(["AM", "PM"] as const).map((l) => (
            <button key={l} type="button" aria-pressed={pm === (l === "PM")} onClick={() => setPm(l === "PM")} className={cn("px-2 py-0.5 font-bold", pm === (l === "PM") ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <svg
        ref={face}
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="touch-none select-none"
        role="group"
        aria-label={stage === "hour" ? "Choose the hour" : "Choose the minute"}
        onPointerDown={(e) => {
          dragging.current = true;
          downAt.current = { x: e.clientX, y: e.clientY };
          e.currentTarget.setPointerCapture(e.pointerId);
          setFromPointer(e);
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return;
          // Only a real drag (more than a few pixels) follows the pointer closely; a plain click glides.
          const d = downAt.current;
          if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
          setDrag(true);
          setFromPointer(e);
        }}
        onPointerUp={() => {
          dragging.current = false;
          setDrag(false);
        }}
        // A double click on an hour moves on to the minutes, the same as pressing Next.
        onDoubleClick={() => stage === "hour" && goStage("minute")}
      >
        <circle cx={C} cy={C} r={C - 2} fill="var(--secondary)" stroke="var(--border)" />
        {/* The hand is drawn pointing at 12 and turned, so its movement can glide. It follows the pointer exactly while dragging. */}
        <g style={{ transform: `rotate(${rot}deg)`, transformOrigin: `${C}px ${C}px`, transition: drag ? "transform 70ms linear" : "transform 320ms cubic-bezier(0.3, 1.25, 0.5, 1)" }}>
          <line x1={C} y1={C} x2={C} y2={C - reach + 6} stroke="var(--primary)" strokeWidth="2" />
          <circle cx={C} cy={C - reach} r={tipBig ? 15 : 5} fill="var(--primary)" />
        </g>
        <circle cx={C} cy={C} r="3.5" fill="var(--primary)" />
        {marks.map((m) => {
          const a = (m.pos * Math.PI) / 180;
          const x = C + Math.sin(a) * R_NUM;
          const y = C - Math.cos(a) * R_NUM;
          return (
            <g key={m.label}>
              <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize="13" fontWeight={m.on ? 700 : 400} fill={m.on && tipBig ? "var(--primary-foreground)" : "var(--foreground)"} pointerEvents="none" style={{ transition: "fill 100ms ease-out 40ms" }}>
                {m.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="flex w-full gap-2">
        <Button type="button" variant="outline" className="h-8 flex-1 rounded-none" onClick={onClear}>
          Day&apos;s close
        </Button>
        {stage === "hour" ? (
          <Button type="button" className="h-8 flex-1 rounded-none" onClick={() => goStage("minute")}>
            Next
          </Button>
        ) : (
          <Button type="button" className="h-8 flex-1 rounded-none" onClick={() => onPick(formatClock(hour, minute, pm))}>
            Set {hour}:{pad(minute)} {pm ? "PM" : "AM"}
          </Button>
        )}
      </div>
    </div>
  );
}

/** A clock button that sits inside a text field. It hands back text the field already understands ("1:40pm"). */
export function TimePickerButton({ value, onPick }: { value: string; onPick: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Open clock" className="absolute inset-y-px right-px flex w-11 items-center justify-center border-l border-input text-muted-foreground transition-colors hover:bg-secondary hover:text-primary">
          <Clock className="size-4" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[240px] rounded-none p-[12px] border border-border bg-popover ring-0">
        <Clock12
          value={value}
          onPick={(t) => {
            onPick(t);
            setOpen(false);
          }}
          onClear={() => {
            onPick("");
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
