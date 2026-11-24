/**
 * How far something small (the lens of an icon) should lean toward the pointer. It points the way the pointer is, and how far it leans depends on how far
 * away the pointer is:
 *  - on top of it the lens sits still, and grows toward its full lean over the first `inner` pixels (so it does not jump to one side the moment the pointer
 *    crosses the middle);
 *  - then it holds its full lean while the pointer is still close;
 *  - then it fades back to the middle, and is back there for good once the pointer is `reach` pixels away.
 * Returns the offset in the units of `max` (the biggest lean).
 */
export function trackOffset(center: { x: number; y: number }, pointer: { x: number; y: number }, reach: number, max: number, inner = 28): { x: number; y: number } {
  const dx = pointer.x - center.x;
  const dy = pointer.y - center.y;
  const d = Math.hypot(dx, dy);
  if (d === 0 || d >= reach) return { x: 0, y: 0 };
  const grow = Math.min(1, d / inner);
  const fade = Math.min(1, (1 - d / reach) * 1.6);
  const lean = max * grow * fade;
  return { x: (dx / d) * lean, y: (dy / d) * lean };
}
