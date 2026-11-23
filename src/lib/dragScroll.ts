"use client";

import { useEffect, type RefObject } from "react";

/**
 * Lets a mouse drag a scrollable box sideways (and up and down), the way a finger does on a phone. Touch and trackpads already scroll natively, so only
 * a mouse is handled. A press on a link or button is left alone, and a drag that moved is not also a click on whatever was under the pointer.
 * `selector` finds the scrolling element inside `root` (the table's own container); `active` is false while there is nothing in it yet.
 */
export function useDragScroll(root: RefObject<HTMLElement | null>, selector: string, active = true) {
  useEffect(() => {
    if (!active) return;
    const host = root.current;
    const box = host?.querySelector<HTMLElement>(selector);
    if (!box) return;
    let start: { x: number; y: number; left: number; top: number } | null = null;
    let moved = false;

    const down = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      if ((e.target as HTMLElement).closest("a, button, input, select, textarea")) return;
      start = { x: e.clientX, y: e.clientY, left: box.scrollLeft, top: box.scrollTop };
      moved = false;
    };
    const move = (e: PointerEvent) => {
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      if (!moved) {
        moved = true;
        box.style.cursor = "grabbing";
        box.style.userSelect = "none";
      }
      box.scrollLeft = start.left - dx;
      box.scrollTop = start.top - dy;
    };
    const up = () => {
      if (!start) return;
      start = null;
      box.style.cursor = "";
      box.style.userSelect = "";
      // The click that ends a drag is swallowed once.
      if (moved) {
        const swallow = (ev: Event) => ev.stopPropagation();
        box.addEventListener("click", swallow, { capture: true, once: true });
        setTimeout(() => box.removeEventListener("click", swallow, { capture: true }), 0);
      }
    };

    box.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      box.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [root, selector, active]);
}
