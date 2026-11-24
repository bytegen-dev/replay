/**
 * Runs `change` (which switches the page's theme) as a View Transition that shows the new look through the Replay mark growing out of `from`, over
 * the old one. The mark's centre and final size go to the stylesheet as custom properties on <html>, and `data-theme-wipe` turns the animation on while
 * it runs, and `data-theme-wipe-from` says which side it comes from, so the mark can point back the other way (the CSS is in globals.css). The mark is a triangle, so its final size is several times the distance to the farthest corner: the circle
 * that fits inside it is about a quarter of its width. Where the browser can't do it, or the viewer wants less motion, `change` just runs.
 */
export function wipeTheme(from: HTMLElement, change: () => void, reduceMotion: boolean): void {
  if (reduceMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof document.startViewTransition !== "function") return change();
  const root = document.documentElement;
  const box = from.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  root.style.setProperty("--wipe-x", `${x}px`);
  root.style.setProperty("--wipe-y", `${y}px`);
  const reach = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  root.style.setProperty("--wipe-s", `${Math.ceil(reach * 5.4)}px`);
  // The longer the way to the farthest corner, the longer it takes, so a wide screen is not swept faster than a phone: 0.9s up to 1.8s.
  root.style.setProperty("--wipe-t", `${Math.round(Math.min(1800, Math.max(900, 400 + reach * 1.1)))}ms`);
  // The mark points back the way it came: a button on the right half of the screen sends it pointing left, one on the left half pointing right.
  root.dataset.themeWipeFrom = x > window.innerWidth / 2 ? "right" : "left";
  root.dataset.themeWipe = "on";
  void document.startViewTransition(change).finished.finally(() => {
    delete root.dataset.themeWipe;
    delete root.dataset.themeWipeFrom;
  });
}
