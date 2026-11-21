"use client";

import { GraduationCap, House, Maximize2, Minimize2, Pause, Play, RotateCcw, Trophy, Volume2, VolumeX, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { drawFrame, drawMenuScene, type Frame, type MenuBuddy } from "@/components/play/drawGame";
import { buildCourse, buildEndless, placeCoins, placeObstacles, type Course, type Endless, type Obstacle, type Track } from "@/lib/flappyCourse.ts";
import { finishAt, flap, H, PLAY_H, hitsObstacle, hitsWall, newBird, step, type Bird } from "@/lib/flappyPhysics.ts";
import { setMuted as audioMute, setVolume as audioVolume, sfx, startAudio, startMusic, stopMusic } from "@/lib/gameAudio.ts";
import type { BoardEntry } from "@/lib/gameBoard.ts";
import { gamePrice, SCROLL_SPEED, scoreFor, STORY, SURVIVAL_COURSE, survivalObstacles, survivalSpeed, type Level } from "@/lib/gameLevels.ts";
import type { EndlessSegment } from "@/lib/flappyCourse.ts";
import { cn } from "@/lib/utils";
import { openWaitlist } from "@/lib/viewerClient.ts";

type Screen = "attract" | "intro" | "play" | "clear" | "menu" | "name" | "gameover" | "board";
type Mode = "tutorial" | "survival";
type Phase = "ready" | "running" | "crashed";

interface Save {
  tutorialDone: boolean;
  stars: Record<string, number>;
  username: string | null;
  /** The secret that proves a name is yours. Made in this browser, kept here, and only a hash of it reaches the server. */
  token: string;
  best: number;
  /** The name was kept on this device only, because the board was not reachable. */
  offline: boolean;
}

interface Sim {
  bird: Bird;
  phase: Phase;
  crashAt: number;
  attempts: number;
  taken: Set<string>;
  gotCount: number;
  bits: { x: number; y: number; vx: number; vy: number; age: number }[];
  time: number;
  startedAt: number;
  /** Survival: how many seams (hand-overs between assets) Tony has passed, and the banner showing now. */
  seamsPassed: number;
  syncUntil: number;
  syncLabel: string;
  /** Tutorial: the next hint to give. */
  nextHint: number;
  /** Feedback: shake and flash fade out, a short freeze on a crash, and the effects' own particles. */
  flapAge: number;
  shake: number;
  flash: number;
  stop: number;
  trailT: number;
  trail: { x: number; y: number; age: number }[];
  sparks: { x: number; y: number; vx: number; vy: number; age: number; color: string }[];
  pops: { x: number; y: number; age: number; text: string }[];
}

interface Run {
  mode: Mode;
  level: Level | null;
  track: Track;
  course: Course | null;
  endless: Endless | null;
  segments: EndlessSegment[];
  coins: { x: number; y: number }[];
  /** The red candles of a lap (a level has just lap 0). */
  obstacles: (lap: number) => Obstacle[];
  cycle: number;
}

interface Final {
  score: number;
  best: number;
  distance: number;
  asset: string;
  reached: string;
  rank: number | null;
  note: string | null;
  newBest: boolean;
}

const SAVE_KEY = "replay-tony-stonk-v2";
const PREF_KEY = "replay-tony-audio";
const MINT = "#39d6a3";

function makeToken(): string {
  const a = new Uint8Array(16);
  window.crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}
function loadSave(): Save {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (raw) {
      const j = JSON.parse(raw) as Partial<Save>;
      return {
        tutorialDone: j.tutorialDone === true,
        stars: typeof j.stars === "object" && j.stars ? (j.stars as Record<string, number>) : {},
        username: typeof j.username === "string" ? j.username : null,
        token: typeof j.token === "string" && /^[a-f0-9]{32}$/.test(j.token) ? j.token : makeToken(),
        best: Math.max(0, Math.floor(Number(j.best) || 0)),
        offline: j.offline === true,
      };
    }
  } catch {
    /* no saved progress */
  }
  return { tutorialDone: false, stars: {}, username: null, token: makeToken(), best: 0, offline: false };
}
function writeSave(s: Save) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    /* progress just isn't remembered */
  }
}

function makeSim(bird: Bird, attempts = 0): Sim {
  return { bird, phase: "ready", crashAt: 0, attempts, taken: new Set(), gotCount: 0, bits: [], time: 0, startedAt: 0, seamsPassed: 0, syncUntil: 0, syncLabel: "", nextHint: 0, flapAge: 9, shake: 0, flash: 0, stop: 0, trailT: 0, trail: [], sparks: [], pops: [] };
}
const starsFor = (attempts: number) => (attempts <= 1 ? 3 : attempts <= 3 ? 2 : 1);
const monthLabel = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

/**
 * The whole game. On its own page it fills the screen; with `embedded` it fills the box it is put in (the dialog that opens over other
 * pages), where the top bar has a button to close it in place of the link back to the site.
 */
export function TonyGame({ levels, segments, embedded = false, onClose }: { levels: Level[]; segments: EndlessSegment[]; embedded?: boolean; onClose?: () => void }) {
  const [screen, setScreen] = useState<Screen>("attract");
  const [mode, setMode] = useState<Mode>("tutorial");
  const [levelIdx, setLevelIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("ready");
  const [save, setSave] = useState<Save>({ tutorialDone: false, stars: {}, username: null, token: "", best: 0, offline: false });
  const [result, setResult] = useState<{ stars: number; coins: number; total: number } | null>(null);
  const [final, setFinal] = useState<Final | null>(null);
  const [board, setBoard] = useState<{ available: boolean; entries: BoardEntry[] } | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [volume, setVolume] = useState(0.6);
  const [muted, setMutedState] = useState(false);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [leverage, setLeverage] = useState(1);
  const [uiScale, setUiScale] = useState(1);
  const [canFull, setCanFull] = useState(false);
  const [isFull, setIsFull] = useState(false);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);

  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ x: number; y: number; on: boolean }>({ x: 0, y: 0, on: false });
  const buddy = useRef<MenuBuddy>({ x: 320, y: 180, vx: 0, vy: 0, acc: 0, smoke: [] });
  const levRef = useRef(1);
  const lightRef = useRef(false);
  const rippleId = useRef(0);
  const screenRef = useRef<Screen>("attract");
  const saveRef = useRef(save);
  const run = useRef<Run | null>(null);
  const sim = useRef<Sim | null>(null);
  const pausedRef = useRef(false);
  const fonts = useRef({ head: "sans-serif", body: "monospace" });
  /** The person asked for less motion: no shake or flashes. */
  const calm = useRef(false);
  const hintTimer = useRef(0);
  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // On big screens the text and buttons over the game grow with the scene behind them (up to 1.8x), never below their normal size.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setUiScale(Math.round(Math.min(1.8, Math.max(1, Math.min(r.height / 600, r.width / 700))) * 20) / 20);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The game follows the site's theme: the scene is drawn in a light or a dark palette, and the text over it takes the theme's colours.
  useEffect(() => {
    const read = () => {
      const light = document.documentElement.dataset.theme === "light";
      lightRef.current = light;
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);

  // Full screen: where the browser has it for elements, a button turns it on and off.
  useEffect(() => {
    const on = () => setIsFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", on);
    const id = setTimeout(() => setCanFull(Boolean(document.fullscreenEnabled)), 0);
    return () => {
      document.removeEventListener("fullscreenchange", on);
      clearTimeout(id);
    };
  }, []);
  const toggleFull = async () => {
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
    else await root.current?.requestFullscreen().catch(() => undefined);
  };
  const setLev = useCallback((v: number) => {
    const n = Math.min(10, Math.max(1, Math.round(v)));
    levRef.current = n;
    setLeverage(n);
  }, []);

  // Saved progress and audio settings, and the site's fonts for the canvas.
  useEffect(() => {
    const id = setTimeout(() => {
      const s = loadSave();
      setSave(s);
      writeSave(s);
      try {
        const p = JSON.parse(window.localStorage.getItem(PREF_KEY) ?? "{}") as { volume?: number; muted?: boolean };
        if (typeof p.volume === "number") {
          setVolume(Math.min(1, Math.max(0, p.volume)));
          audioVolume(p.volume);
        }
        if (p.muted === true) {
          setMutedState(true);
          audioMute(true);
        }
      } catch {
        /* default volume */
      }
      calm.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduce";
      const cs = getComputedStyle(document.documentElement);
      fonts.current = { head: cs.getPropertyValue("--font-display").trim() || "sans-serif", body: cs.getPropertyValue("--font-data").trim() || "monospace" };
    }, 0);
    return () => {
      clearTimeout(id);
      stopMusic();
    };
  }, []);

  const keep = useCallback((next: Save) => {
    setSave(next);
    saveRef.current = next;
    writeSave(next);
  }, []);
  const prefs = (v: number, m: boolean) => {
    try {
      window.localStorage.setItem(PREF_KEY, JSON.stringify({ volume: v, muted: m }));
    } catch {
      /* not remembered */
    }
  };
  const changeVolume = (v: number) => {
    startAudio();
    setVolume(v);
    audioVolume(v);
    if (muted && v > 0) {
      setMutedState(false);
      audioMute(false);
    }
    prefs(v, v === 0 ? muted : false);
    sfx.select();
  };
  const toggleMute = () => {
    startAudio();
    const m = !muted;
    setMutedState(m);
    audioMute(m);
    prefs(volume, m);
  };

  const fetchBoard = useCallback(async () => {
    try {
      const r = await fetch("/api/game/leaderboard", { cache: "no-store" });
      const j = (await r.json()) as { available?: boolean; entries?: BoardEntry[] };
      setBoard({ available: j.available === true, entries: Array.isArray(j.entries) ? j.entries : [] });
    } catch {
      setBoard({ available: false, entries: [] });
    }
  }, []);

  /* ----------------------------- starting a run ----------------------------- */

  const showHint = useCallback((text: string) => {
    setHint(text);
    window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHint(null), 4200);
  }, []);

  const startTutorial = useCallback(
    (i: number) => {
      const level = levels[i];
      const course = buildCourse(level.prices, { ...level.course, length: level.seconds * SCROLL_SPEED, height: PLAY_H, runway: 220, margin: 18 });
      const candles = level.obstacles ? placeObstacles(course, { from: 700, to: finishAt(course) - 500, ...level.obstacles }) : [];
      run.current = { mode: "tutorial", level, track: course, course, endless: null, segments: [], coins: placeCoins(course), obstacles: () => candles, cycle: Infinity };
      sim.current = makeSim(newBird(course));
      setMode("tutorial");
      setLevelIdx(i);
      setPhase("ready");
      setResult(null);
      setHint(null);
      setPaused(false);
      setScreen("play");
      startMusic();
    },
    [levels],
  );

  const startSurvival = useCallback(() => {
    const e = buildEndless(segments, SURVIVAL_COURSE);
    // Coins for one lap, swung a little either side of the middle (the same for every lap).
    const coins: { x: number; y: number }[] = [];
    for (let x = 420, i = 0; x < e.cycle - 300; x += 120, i++) coins.push({ x, y: e.centerAt(x) + Math.sin(i * 2.1 + 0.7) * e.gapAt(x) * 0.28 });
    const laps = new Map<number, Obstacle[]>();
    const candles = (lap: number) => {
      const k = Math.min(lap, 12);
      if (!laps.has(k)) laps.set(k, survivalObstacles(e, k));
      return laps.get(k)!;
    };
    run.current = { mode: "survival", level: null, track: e, course: null, endless: e, segments, coins, obstacles: candles, cycle: e.cycle };
    sim.current = makeSim(newBird(e));
    setMode("survival");
    setPhase("ready");
    setFinal(null);
    setHint(null);
    setPaused(false);
    setScreen("play");
    startMusic();
  }, [segments]);

  /* ----------------------------- the controls ----------------------------- */

  const finishSurvival = useCallback(
    async (s: Sim, r: Run) => {
      const score = scoreFor(s.bird.x, s.gotCount);
      const seg = r.endless!.segmentAt(s.bird.x);
      const asset = r.segments[seg.segment].label;
      const reached = monthLabel(r.segments[seg.segment].times[seg.index]);
      const cur = saveRef.current;
      const newBest = score > cur.best;
      if (newBest) keep({ ...cur, best: score });
      const base: Final = { score, best: Math.max(cur.best, score), distance: Math.floor(s.bird.x / 10), asset, reached, rank: null, note: null, newBest };
      setFinal(base);
      setScreen("gameover");
      void fetchBoard();
      if (cur.username && !cur.offline && score > 0) {
        try {
          const res = await fetch("/api/game/score", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ username: cur.username, token: cur.token, score, durationMs: Math.round(performance.now() - s.startedAt), asset, reached }),
          });
          const j = (await res.json().catch(() => null)) as { ok?: boolean; rank?: number; best?: number; error?: string; offline?: boolean } | null;
          if (res.ok && j?.ok) {
            setFinal({ ...base, rank: j.rank ?? null, best: Math.max(base.best, j.best ?? 0) });
            void fetchBoard();
          } else {
            setFinal({ ...base, note: j?.offline ? "The leaderboard is offline, so this run is only saved on this device." : (j?.error ?? "Your run could not be saved to the leaderboard.") });
          }
        } catch {
          setFinal({ ...base, note: "Could not reach the leaderboard. Your best is saved on this device." });
        }
      } else if (cur.offline) {
        setFinal({ ...base, note: "Playing offline: scores stay on this device." });
      }
    },
    [fetchBoard, keep],
  );

  const flapNow = useCallback(() => {
    const s = sim.current;
    const r = run.current;
    if (!s || !r || screenRef.current !== "play") return;
    if (pausedRef.current) {
      setPaused(false);
      return;
    }
    if (s.phase === "ready") {
      s.phase = "running";
      s.startedAt = performance.now();
      flap(s.bird);
      s.flapAge = 0;
      sfx.flap();
      setPhase("running");
    } else if (s.phase === "running") {
      flap(s.bird);
      s.flapAge = 0;
      sfx.flap();
    } else if (s.phase === "crashed" && r.mode === "tutorial" && performance.now() - s.crashAt > 500) {
      sim.current = makeSim(newBird(r.track), s.attempts);
      setPhase("ready");
      setHint(null);
    }
  }, []);

  const togglePause = useCallback(() => {
    if (screenRef.current !== "play" || sim.current?.phase !== "running") return;
    setPaused((p) => !p);
  }, []);

  const goMenu = useCallback(() => {
    stopMusic();
    setPaused(false);
    setHint(null);
    void fetchBoard();
    setScreen(saveRef.current.tutorialDone ? "menu" : "attract");
  }, [fetchBoard]);

  const pressStart = useCallback(() => {
    if (screenRef.current !== "attract") return;
    startAudio();
    sfx.coinDrop();
    if (saveRef.current.tutorialDone) {
      void fetchBoard();
      setScreen("menu");
    } else {
      setScreen("intro");
    }
  }, [fetchBoard]);

  const enterScreen = useCallback(() => {
    sfx.select();
    if (saveRef.current.username) startSurvival();
    else {
      setNameError(null);
      setScreen("name");
    }
  }, [startSurvival]);

  async function claim(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    setNameError(null);
    if (!/^[A-Za-z0-9_-]{3,16}$/.test(n)) {
      setNameError("Use 3 to 16 letters, numbers, dashes or underscores.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/game/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: n, token: saveRef.current.token }) });
      const j = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; offline?: boolean } | null;
      if (res.ok && j?.ok) {
        keep({ ...saveRef.current, username: n, offline: false });
        startSurvival();
      } else if (res.status === 503 || j?.offline) {
        keep({ ...saveRef.current, username: n, offline: true });
        startSurvival();
      } else {
        setNameError(j?.error ?? "That name could not be used. Try another.");
      }
    } catch {
      keep({ ...saveRef.current, username: n, offline: true });
      startSurvival();
    } finally {
      setBusy(false);
    }
  }

  /* ----------------------------- the game loop ----------------------------- */

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(1 / 30, (now - last) / 1000);
      last = now;
      const cv = canvas.current;
      const r = run.current;
      const s = sim.current;
      const sc = screenRef.current;
      // The title screen and the main menu have their own little scene: Tony floating after the cursor among drifting motes.
      const demoMode = sc === "attract" || sc === "menu" || sc === "intro" || sc === "name" || sc === "board";
      if (!cv || (!demoMode && (!r || !s || (sc !== "play" && sc !== "clear" && sc !== "gameover")))) return;
      // keep the backing store matched to the box on screen (sharp on high-density screens)
      // The playing area is always H tall; it is as wide as the screen's shape asks (within limits), so a wide screen sees further ahead.
      const rect = box.current?.getBoundingClientRect();
      const bx = Math.max(1, rect?.width ?? 640);
      const by = Math.max(1, rect?.height ?? 360);
      // The title screen and menus fill the whole box, whatever its shape: the scene is drawn 640 wide at least and as tall as it needs to be.
      const sceneScale = Math.min(bx / 640, by / H);
      const W = demoMode ? bx / sceneScale : Math.min(1100, Math.max(400, Math.round((H * bx) / by)));
      const Hs = demoMode ? by / sceneScale : H;
      let cw = bx;
      let ch = by;
      if (!demoMode) {
        if (cw / ch > W / H) cw = (ch * W) / H;
        else ch = (cw * H) / W;
      }
      cv.style.width = `${cw}px`;
      cv.style.height = `${ch}px`;
      cv.style.left = `${(bx - cw) / 2}px`;
      cv.style.top = `${(by - ch) / 2}px`;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const bw = Math.max(1, Math.round(cw * dpr));
      const bh = Math.max(1, Math.round(ch * dpr));
      if (cv.width !== bw || cv.height !== bh) {
        cv.width = bw;
        cv.height = bh;
      }
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(cv.width / W, 0, 0, cv.height / Hs, 0, 0);

      if (demoMode) {
        const pt = pointer.current;
        const gp = pt.on ? { x: pt.x / sceneScale, y: pt.y / sceneScale } : null;
        drawMenuScene(ctx, { w: W, h: Hs, dt, time: now / 1000, buddy: buddy.current, pointer: gp, tony: sc === "attract" || sc === "menu", unit: sceneScale, light: lightRef.current });
        return;
      }
      if (!r || !s) return;

      const frozen = pausedRef.current || sc !== "play";
      if (!frozen) s.time += dt;
      const stopped = s.stop > 0;
      if (stopped && !pausedRef.current) s.stop -= dt;
      const survival = r.mode === "survival" && r.endless;
      if (!frozen && !stopped) {
        if (s.phase === "ready") {
          s.bird.y = r.track.centerAt(0) + Math.sin(s.time * 2) * 5;
        } else if (s.phase === "running") {
          // Leverage multiplies the speed of the tunnel. At high speeds the bird moves in small steps so it cannot skip over a candle.
          const lev = survival ? levRef.current : 1;
          const speed = (survival ? survivalSpeed(s.bird.x) : SCROLL_SPEED) * lev;
          const n = Math.max(1, Math.ceil((speed * dt) / 6));
          const sdt = dt / n;
          for (let k = 0; k < n && s.phase === "running"; k++) {
          step(s.bird, sdt, speed);
          s.trailT -= sdt;
          if (s.trailT <= 0 && s.flapAge < 0.3) {
            s.trail.push({ x: s.bird.x - 10, y: s.bird.y + 22, age: 0 });
            s.trailT = 0.03;
          }
          // coins
          const lap = survival ? Math.floor(s.bird.x / r.cycle) : 0;
          const local = survival ? s.bird.x - lap * r.cycle : s.bird.x;
          r.coins.forEach((k, i) => {
            const key = `${lap}:${i}`;
            if (!s.taken.has(key) && Math.abs(k.x - local) < 16 && Math.abs(k.y - s.bird.y) < 18) {
              s.taken.add(key);
              s.gotCount++;
              sfx.coin();
              s.pops.push({ x: (survival ? lap * r.cycle : 0) + k.x, y: k.y, age: 0, text: "+5" });
              for (let n = 0; n < 9; n++) {
                const a = (n / 9) * Math.PI * 2;
                s.sparks.push({ x: (survival ? lap * r.cycle : 0) + k.x, y: k.y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, age: 0, color: n % 2 ? "#ffe08a" : "#f5c451" });
              }
            }
          });
          // hand-overs between assets (Survival)
          if (survival && r.endless) {
            const seams = r.endless.seams;
            const g = s.seamsPassed;
            const pos = Math.floor(g / seams.length) * r.cycle + seams[g % seams.length];
            if (s.bird.x >= pos) {
              s.seamsPassed++;
              const nextSeg = r.segments[(g + 1) % r.segments.length];
              s.syncLabel = `SYNC  >  ${nextSeg.label.toUpperCase()}`;
              s.syncUntil = s.time + 2.2;
              sfx.sync();
            }
          }
          // coach hints (tutorial)
          if (r.mode === "tutorial" && r.level && r.course) {
            const progress = s.bird.x / finishAt(r.course);
            const h = r.level.hints[s.nextHint];
            if (h && progress >= h.at) {
              s.nextHint++;
              showHint(h.text);
            }
          }
          if (hitsWall(s.bird, r.track) || hitsObstacle(s.bird, r.track, r.obstacles(lap), r.cycle)) {
            s.phase = "crashed";
            s.crashAt = performance.now();
            s.attempts++;
            sfx.crash();
            if (!calm.current) {
              s.shake = 0.85;
              s.flash = 1;
              s.stop = 0.1;
            }
            for (let i = 0; i < 18; i++) s.bits.push({ x: s.bird.x, y: s.bird.y, vx: (Math.random() - 0.5) * 220, vy: (Math.random() - 0.7) * 220, age: 0 });
            setPhase("crashed");
            if (survival) window.setTimeout(() => void finishSurvival(s, r), 900);
          } else if (r.mode === "tutorial" && r.course && r.level && s.bird.x >= finishAt(r.course)) {
            const st = starsFor(s.attempts + 1);
            setResult({ stars: st, coins: s.gotCount, total: r.coins.length });
            const cur = saveRef.current;
            const lastLevel = levelIdx >= levels.length - 1;
            keep({ ...cur, tutorialDone: cur.tutorialDone || lastLevel, stars: { ...cur.stars, [r.level.id]: Math.max(cur.stars[r.level.id] ?? 0, st) } });
            sfx.clear();
            if (r.course) {
              const gx = finishAt(r.course);
              const gy = r.track.centerAt(gx);
              for (let n = 0; n < 44; n++) s.sparks.push({ x: gx, y: gy, vx: (Math.random() - 0.2) * 220, vy: (Math.random() - 0.85) * 240, age: -Math.random() * 0.1, color: ["#39d6a3", "#ffe08a", "#f3f8f8", "#fb7185"][n % 4] });
            }
            setHint(null);
            setScreen("clear");
            s.phase = "ready";
          }
          }
        } else if (s.phase === "crashed") {
          s.bird.vy = Math.min(560, s.bird.vy + 1500 * dt);
          s.bird.y += s.bird.vy * dt;
        }
        s.bits.forEach((b) => {
          b.age += dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.vy += 600 * dt;
        });
        s.bits = s.bits.filter((b) => b.age < 0.8);
      }
      // Feedback effects keep running while the game is frozen on a crash or sitting on the clear screen, but not while paused.
      if (!pausedRef.current) {
        s.flapAge += dt;
        s.shake = Math.max(0, s.shake - dt * 1.6);
        s.flash = Math.max(0, s.flash - dt * 2.4);
        s.trail.forEach((d) => (d.age += dt));
        s.trail = s.trail.filter((d) => d.age < 0.5);
        s.pops.forEach((p) => (p.age += dt));
        s.pops = s.pops.filter((p) => p.age < 0.8);
        s.sparks.forEach((p) => {
          p.age += dt;
          if (p.age > 0) {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 420 * dt;
          }
        });
        s.sparks = s.sparks.filter((p) => p.age < 0.7);
      }

      const idx = survival && r.endless ? r.endless.segmentAt(s.bird.x) : null;
      const lv = r.level;
      let center = "";
      let logo: string | undefined;
      let timeline: Frame["timeline"];
      if (survival && r.endless && idx) {
        const seg = r.segments[idx.segment];
        center = `${seg.label}   ${gamePrice(seg.prices[idx.index])}`;
        logo = seg.logo;
        timeline = { from: seg.times[0], to: seg.times[seg.times.length - 1], at: seg.times[idx.index] };
      } else if (lv && r.course) {
        const i = r.course.indexAt(s.bird.x);
        center = `${lv.asset}   ${gamePrice(lv.prices[i])}`;
        logo = lv.logo;
        timeline = { from: lv.times[0], to: lv.times[lv.times.length - 1], at: lv.times[i] };
      }
      const frame: Frame = {
        track: r.track,
        bird: s.bird,
        coins: r.coins,
        obstacles: r.obstacles,
        taken: (lap, i) => s.taken.has(`${lap}:${i}`),
        cycle: r.cycle,
        gate: r.mode === "tutorial" && r.course ? { x: finishAt(r.course), label: levelIdx >= levels.length - 1 ? "FINISH" : "NEXT LEVEL" } : undefined,
        progress: r.mode === "tutorial" && r.course ? s.bird.x / finishAt(r.course) : undefined,
        time: s.time,
        phase: s.phase,
        bits: s.bits,
        hud:
          survival
            ? { left: `${saveRef.current.username ?? "Guest"}${levRef.current > 1 ? `  ${levRef.current}x` : ""}`, right: `${scoreFor(s.bird.x, s.gotCount)}`, center, logo }
            : { left: `${levelIdx + 1}  ${lv?.title ?? ""}`, right: `${s.gotCount} / ${r.coins.length}`, center, logo },
        sync: survival && s.syncUntil > s.time ? { amount: Math.min(1, (s.syncUntil - s.time) / 1.4), label: s.syncLabel } : undefined,
        w: W,
        light: lightRef.current,
        speed: survival ? levRef.current : 1,
        timeline,
        fonts: fonts.current,
        fx: { shake: calm.current ? 0 : s.shake, flash: calm.current ? 0 : s.flash, flapAge: s.flapAge, trail: s.trail, sparks: s.sparks, pops: s.pops },
      };
      drawFrame(ctx, frame);
      if (pausedRef.current) {
        ctx.fillStyle = lightRef.current ? "rgba(234,246,243,0.7)" : "rgba(3,9,11,0.6)";
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = lightRef.current ? "#0b2b2c" : "#f3f8f8";
        ctx.font = `700 22px ${fonts.current.head}`;
        ctx.textAlign = "center";
        ctx.fillText("PAUSED", W / 2, H / 2);
        ctx.font = `500 12px ${fonts.current.body}`;
        ctx.fillStyle = MINT;
        ctx.fillText("press the pause button or flap to go on", W / 2, H / 2 + 24);
        ctx.textAlign = "left";
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [levels, levelIdx, finishSurvival, keep, showHint]);

  // Keyboard: space, up arrow or W flaps; P pauses; Enter puts a coin in.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (screenRef.current === "play" && (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW")) {
        e.preventDefault();
        if (!e.repeat) flapNow();
      } else if (e.code === "KeyP") togglePause();
      else if (screenRef.current === "attract" && (e.code === "Enter" || e.code === "Space")) {
        e.preventDefault();
        pressStart();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flapNow, togglePause, pressStart]);

  /* ----------------------------- the screens ----------------------------- */

  const isLast = levelIdx >= levels.length - 1;
  const level = levels[levelIdx];
  const btn = "cut-btn cut-btn-solid h-10 px-6 text-sm font-bold";
  const ghost = "h-9 border border-primary/50 px-4 text-xs font-bold tracking-widest text-primary uppercase transition-colors hover:bg-primary/10";
  const panel = "cut-card pulse-ring flex w-full max-w-sm flex-col items-center gap-3 border border-border bg-card p-5 text-center sm:gap-4 sm:p-6";
  const showCanvas = screen === "play" || screen === "clear" || screen === "gameover" || screen === "attract" || screen === "menu" || screen === "intro" || screen === "name" || screen === "board";
  const inRun = screen === "play";

  const boardTable = (entries: BoardEntry[], me: string | null, compact = false) =>
    entries.length === 0 ? (
      <p className="text-xs text-muted-foreground">No traders on the leaderboard yet. Be the first.</p>
    ) : (
      <ol className="flex w-full flex-col gap-1 text-left text-xs sm:text-sm">
        {entries.slice(0, compact ? 5 : 12).map((e, i) => (
          <li key={e.username} className={cn("flex items-baseline gap-2 border-b border-border/50 pb-1", me && e.username.toLowerCase() === me.toLowerCase() && "text-primary")}>
            <span className="w-5 text-right text-muted-foreground">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate font-bold">{e.username}</span>
            <span className="hidden truncate text-[0.7rem] text-muted-foreground sm:inline">{e.asset ? `${e.asset.split(" ")[0]}, ${e.reached}` : ""}</span>
            <span className="text-[var(--game-gold)] tabular-nums">{e.score}</span>
          </li>
        ))}
      </ol>
    );

  const canPauseNow = inRun && phase === "running";
  const barBtn = "grid size-8 place-items-center border border-primary/30 text-foreground/90 transition-colors hover:bg-primary/10 disabled:opacity-40";

  return (
    <div ref={root} className={cn("game-theme flex flex-col bg-background", embedded ? "absolute inset-0" : "fixed inset-0 z-40")}>
      {/* The top bar: the way back, the desk, leverage while playing Survival, and the sound, pause and full screen controls. */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-primary/20 bg-card px-2 sm:gap-3 sm:px-3" style={{ zoom: Math.min(uiScale, 1.4) }}>
        {embedded ? (
          <span className="flex h-8 items-center gap-2 pr-2 font-heading text-base font-bold text-foreground/90">
            <BrandMark size={28} className="size-7 shrink-0 object-contain" />
            Tony Stonk
          </span>
        ) : (
          <Link href="/" aria-label="Back to the Replay site" className="flex h-8 items-center gap-2 pr-2 font-heading text-base font-bold text-foreground/90 transition-colors hover:text-primary">
            <BrandMark size={28} className="size-7 shrink-0 object-contain" />
            Replay
          </Link>
        )}
        {screen !== "attract" && screen !== "intro" && screen !== "menu" && (
          <button type="button" onClick={goMenu} className="h-8 border border-primary/30 px-3 text-xs font-bold tracking-widest text-primary uppercase transition-colors hover:bg-primary/10">
            Main menu
          </button>
        )}
        <div className="min-w-0 flex-1" />
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={togglePause} disabled={!canPauseNow} aria-label={paused ? "Resume" : "Pause"} className={barBtn}>
            {paused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}
          </button>
          <button type="button" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"} aria-pressed={muted} className={barBtn}>
            {muted || volume === 0 ? <VolumeX className="size-4" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}
          </button>
          <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={(e) => changeVolume(Number(e.target.value))} aria-label="Volume" className="hidden h-1.5 w-20 cursor-pointer accent-primary sm:block" />
          {canFull && (
            <button type="button" onClick={() => void toggleFull()} aria-label={isFull ? "Exit full screen" : "Full screen"} aria-pressed={isFull} className={barBtn}>
              {isFull ? <Minimize2 className="size-4" aria-hidden /> : <Maximize2 className="size-4" aria-hidden />}
            </button>
          )}
          {embedded && (
            <button type="button" onClick={onClose} aria-label="Close" title="Close" className={barBtn}>
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>
      </div>

      <div className="relative min-h-0 flex-1 bg-[var(--game-wall)]">
      <div
        ref={box}
        onPointerMove={(e) => {
          const r = box.current?.getBoundingClientRect();
          if (r) pointer.current = { x: e.clientX - r.left, y: e.clientY - r.top, on: true };
        }}
        onPointerLeave={() => (pointer.current.on = false)}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button,a,input")) return;
          startAudio();
          if (screenRef.current === "attract") pressStart();
          else flapNow();
          if (screenRef.current === "play" && !calm.current) {
            const r = box.current?.getBoundingClientRect();
            if (r) {
              const id = ++rippleId.current;
              setRipples((l) => [...l.slice(-3), { id, x: e.clientX - r.left, y: e.clientY - r.top }]);
              window.setTimeout(() => setRipples((l) => l.filter((x) => x.id !== id)), 460);
            }
          }
        }}
        className="absolute inset-0 touch-none select-none"
      >
        {ripples.map((r) => (
          <span key={r.id} aria-hidden className="tap-ripple z-10" style={{ left: r.x, top: r.y }} />
        ))}
        <canvas ref={canvas} className={cn("absolute", !showCanvas && "invisible")} aria-label="Tony Stonk flying through a price chart. Tap, click or press space to jetpack." role="img" />

        {/* Everything drawn over the game: scaled up on big screens, so the text and buttons keep their size against the scene behind. */}
        <div className="absolute inset-0" style={{ zoom: uiScale }}>
        {/* Attract: waiting for a coin */}
        {screen === "attract" && (
          <div className={"absolute inset-0 flex items-center justify-center p-4"}>
            <div className="flex max-w-lg flex-col items-center gap-3 text-center sm:gap-4">
              <p className="font-heading text-3xl font-bold tracking-tight sm:text-6xl">{STORY.title}</p>
              <p className="text-xs text-muted-foreground sm:text-base">{STORY.tagline}</p>
              <button type="button" onClick={pressStart} className="font-heading animate-pulse text-sm font-bold tracking-[0.3em] text-[var(--game-gold)] uppercase sm:text-lg">
                Start
              </button>
              {save.username && <p className="text-[0.7rem] text-muted-foreground">Welcome back, {save.username}. Best: {save.best}</p>}
            </div>
          </div>
        )}

        {/* Before the first game: play the tutorial or skip it */}
        {screen === "intro" && (
          <div className={"absolute inset-0 flex items-center justify-center p-4"}>
            <div className="flex w-full max-w-xs flex-col items-center gap-5 text-center">
              <div>
                <p className="font-heading text-2xl font-bold sm:text-3xl">Play the tutorial?</p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">Three short levels teach the controls. Stay inside the chart and do not crash into the walls.</p>
              </div>
              <div className="flex w-full flex-col gap-2">
                <button type="button" className="cut-btn cut-btn-solid h-11 w-full text-sm font-bold" onClick={() => startTutorial(0)}>
                  Play tutorial
                </button>
                <button
                  type="button"
                  className="cut-btn h-10 w-full text-sm font-bold text-primary"
                  onClick={() => {
                    keep({ ...saveRef.current, tutorialDone: true });
                    void fetchBoard();
                    setScreen("menu");
                  }}
                >
                  Skip
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Level start: the narrator, and the controls (tutorial) */}
        {screen === "play" && phase === "ready" && (
          <div className="pointer-events-none absolute inset-x-0 top-[12%] flex justify-center px-4">
            <div className="max-w-md border border-primary/30 bg-background/75 p-2.5 text-center backdrop-blur-sm sm:p-3">
              {mode === "tutorial" && level ? (
                <>
                  <p className="font-heading text-xs font-bold sm:text-sm">
                    Tutorial {levelIdx + 1} of {levels.length}: {level.title}
                  </p>
                  <p className="text-[0.65rem] text-muted-foreground sm:text-xs">
                    {level.asset}, {level.period}
                  </p>
                  <p className="mt-1 text-[0.65rem] leading-snug text-foreground/90 sm:text-xs">{level.intro}</p>
                </>
              ) : (
                <>
                  <p className="font-heading text-xs font-bold sm:text-sm">Survival</p>
                  <p className="mt-1 text-[0.65rem] leading-snug text-foreground/90 sm:text-xs">One endless run since 2018. It starts with Bitcoin and hands over from asset to asset, getting faster and narrower, with red candles in the way.{leverage > 1 ? ` Leverage ${leverage}x.` : ""}</p>
                </>
              )}
              <p className="mt-1.5 text-[0.65rem] font-bold text-primary sm:text-xs">Tap, click or press space to start</p>
            </div>
          </div>
        )}
        {screen === "play" && hint && phase === "running" && (
          <div className="pointer-events-none absolute inset-x-0 bottom-9 flex justify-center px-4">
            <p className="max-w-sm border border-primary/40 bg-background/80 px-3 py-1.5 text-center text-[0.68rem] leading-snug backdrop-blur-sm sm:text-xs">{hint}</p>
          </div>
        )}
        {screen === "play" && phase === "crashed" && mode === "tutorial" && (
          <div className="pointer-events-none absolute inset-x-0 bottom-10 flex justify-center px-4">
            <p className="border border-border bg-background/80 px-3 py-2 text-xs backdrop-blur-sm">Liquidated. Tap to try again.</p>
          </div>
        )}

        {/* A tutorial level cleared */}
        {screen === "clear" && level && result && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 p-3 backdrop-blur-sm">
            <div className={panel}>
              <p className="font-heading text-lg font-bold sm:text-2xl">{isLast ? "Tutorial complete" : "Level cleared"}</p>
              <p aria-label={`${result.stars} of 3 stars`} className="text-xl tracking-widest text-[var(--game-gold)] sm:text-2xl">
                {"★".repeat(result.stars)}
                <span className="text-muted-foreground/40">{"★".repeat(3 - result.stars)}</span>
              </p>
              <p className="text-[0.7rem] text-muted-foreground sm:text-xs">
                {result.coins} of {result.total} coins
              </p>
              <p className="text-xs leading-snug sm:text-sm">{level.outro}</p>
              <button
                type="button"
                className={btn}
                onClick={() => {
                  if (!isLast) startTutorial(levelIdx + 1);
                  else {
                    stopMusic();
                    setScreen("menu");
                    void fetchBoard();
                  }
                }}
              >
                {isLast ? "Main menu" : "Next level"}
              </button>
            </div>
          </div>
        )}

        {/* The desk: the main menu */}
        {screen === "menu" && (
          <div className={"absolute inset-0 flex items-center justify-center p-4"}>
            <div className="flex w-full max-w-xs flex-col items-center gap-5">
              <div className="text-center">
                <p className="font-heading text-3xl font-bold tracking-tight sm:text-5xl">{STORY.title}</p>
                <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{STORY.tagline}</p>
              </div>
              <div className="flex w-full flex-col gap-2">
                <button type="button" className="cut-btn cut-btn-solid flex h-11 w-full items-center justify-center gap-2 text-sm font-bold" onClick={enterScreen}>
                  <Play className="size-4 fill-current" aria-hidden />
                  Play
                </button>
                <label className="flex flex-col gap-1.5 py-2 text-left">
                  <span className="flex items-center justify-between text-xs font-bold">
                    <span>Leverage</span>
                    <span className={cn("tabular-nums", leverage >= 7 ? "text-[var(--game-red)]" : leverage > 1 ? "text-[var(--game-gold)]" : "text-muted-foreground")}>{leverage}x</span>
                  </span>
                  <input type="range" min={1} max={10} step={1} value={leverage} onChange={(e) => setLev(Number(e.target.value))} aria-label="Leverage" className="h-1.5 w-full cursor-pointer accent-primary" />
                  <span className="text-[0.65rem] text-muted-foreground">Faster tunnel, higher score.</span>
                </label>
                <button type="button" className="cut-btn flex h-10 w-full items-center justify-center gap-2 text-sm font-bold text-primary" onClick={() => (sfx.select(), void fetchBoard(), setScreen("board"))}>
                  <Trophy className="size-4" aria-hidden />
                  Leaderboard
                </button>
                <button type="button" className="cut-btn flex h-10 w-full items-center justify-center gap-2 text-sm font-bold text-primary" onClick={() => (sfx.select(), startTutorial(0))}>
                  <GraduationCap className="size-4" aria-hidden />
                  Tutorial
                </button>
              </div>
              <p className="text-[0.7rem] text-muted-foreground">
                Playing as {save.username ?? "Guest"}. Best: {save.best}
              </p>
            </div>
          </div>
        )}

        {/* Choosing a name for Survival */}
        {screen === "name" && (
          <div className={"absolute inset-0 flex items-center justify-center p-4"}>
            <form onSubmit={claim} className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
              <p className="font-heading text-lg font-bold sm:text-2xl">Choose a name</p>
              <p className="text-[0.7rem] leading-snug text-muted-foreground sm:text-xs">Other traders are in there. Pick the name they will see on the leaderboard.</p>
              <div className="flex w-full text-left">
                {/* The name box and the button meet with no gap, like the waitlist form: the box has its bottom-left corner cut, the button its top-right. */}
                <div className="cut-bl h-11 min-w-0 flex-1">
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 16))}
                    placeholder="Your name"
                    aria-label="Your name"
                    maxLength={16}
                    autoComplete="off"
                    autoFocus
                    spellCheck={false}
                    aria-invalid={!!nameError}
                    className="h-full w-full rounded-none border-0 bg-transparent px-3 text-sm shadow-none focus-visible:ring-0"
                  />
                </div>
                <Button type="submit" disabled={busy || name.trim().length < 3} className="cut-tr cut-primary h-11 shrink-0 rounded-none border-0 px-5 text-sm font-bold text-primary-foreground">
                  {busy ? "Saving" : "Save"}
                </Button>
              </div>
              {nameError && (
                <p role="alert" className="text-[0.7rem] font-bold text-destructive sm:text-xs">
                  {nameError}
                </p>
              )}
              <button type="button" className="text-xs text-muted-foreground underline underline-offset-4 hover:text-primary" onClick={() => setScreen("menu")}>
                Back to the main menu
              </button>
            </form>
          </div>
        )}

        {/* The board */}
        {screen === "board" && (
          <div className={"absolute inset-0 flex items-center justify-center p-3"}>
            <div className="flex max-h-full w-full max-w-md flex-col items-center gap-2 overflow-y-auto sm:gap-3">
              <p className="font-heading text-lg font-bold sm:text-2xl">Leaderboard</p>
              <p className="text-[0.65rem] text-muted-foreground sm:text-xs">Every trader&apos;s best run in Survival</p>
              {!board ? <p className="text-xs text-muted-foreground">Loading</p> : !board.available ? <p className="text-xs text-muted-foreground">The leaderboard is offline right now.</p> : boardTable(board.entries, save.username)}
              <button type="button" className={ghost} onClick={() => setScreen(save.tutorialDone ? "menu" : "attract")}>
                Main menu
              </button>
            </div>
          </div>
        )}

        {/* Survival over */}
        {screen === "gameover" && final && (
          <div className="absolute inset-0 flex items-center justify-center overflow-y-auto bg-background/70 p-3 backdrop-blur-sm">
            <div className="cut-card pulse-ring flex w-full max-w-sm flex-col gap-4 border border-border bg-card p-5 sm:gap-5 sm:p-6" style={{ "--pulse": "#fb7185" } as React.CSSProperties}>
              <div>
                <p className="font-heading text-xl font-bold text-[var(--game-red)] sm:text-2xl">Liquidated</p>
                <p className="text-xs text-muted-foreground">
                  Reached {final.asset}, {final.reached}
                </p>
              </div>
              <div className="flex items-end justify-between gap-4 border-y border-border/70 py-3">
                <div>
                  <p className="text-[0.65rem] text-muted-foreground">Score</p>
                  <p className="font-heading text-4xl leading-none font-bold text-[var(--game-gold)] tabular-nums sm:text-5xl">{final.score}</p>
                </div>
                <div className="text-right text-xs">
                  <p className="text-muted-foreground">{final.newBest ? "New best" : "Best"}</p>
                  <p className="font-heading text-lg font-bold tabular-nums">{final.best}</p>
                </div>
              </div>
              {final.rank !== null && <p className="text-sm font-bold text-primary">You are #{final.rank} on the leaderboard</p>}
              {final.note && <p className="text-xs text-muted-foreground">{final.note}</p>}
              {board?.available && <div className="w-full">{boardTable(board.entries, save.username, true)}</div>}
              <div className="flex flex-col gap-2">
                <button type="button" className="cut-btn cut-btn-solid flex h-11 w-full items-center justify-center gap-2 text-sm font-bold" onClick={startSurvival}>
                  <RotateCcw className="size-4" aria-hidden />
                  Play again
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className="cut-btn flex h-10 items-center justify-center gap-2 text-sm font-bold text-primary" onClick={goMenu}>
                    <House className="size-4" aria-hidden />
                    Main menu
                  </button>
                  <button type="button" className="cut-btn flex h-10 items-center justify-center gap-2 text-sm font-bold text-primary" onClick={() => (void fetchBoard(), setScreen("board"))}>
                    <Trophy className="size-4" aria-hidden />
                    Leaderboard
                  </button>
                </div>
              </div>
              <button type="button" onClick={() => openWaitlist()} className="self-center text-xs text-muted-foreground underline underline-offset-4 hover:text-primary">
                Get notified when the Replay app launches
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
      </div>
    </div>
  );
}
