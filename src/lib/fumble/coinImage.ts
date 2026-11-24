/**
 * A coin's picture for a canvas, or null when it can't be had. It is fetched through this site (`/api/fumble/image`, which only passes on the pictures the
 * token data names), so the canvas stays one that can be saved or recorded; when it fails the picture that is being drawn carries on with the coin's
 * first letter instead.
 */
export function loadCoinImage(src: string, ms = 5000): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const done = (v: HTMLImageElement | null) => {
      clearTimeout(timer);
      resolve(v);
    };
    const timer = setTimeout(() => done(null), ms);
    img.onload = () => done(img);
    img.onerror = () => done(null);
    img.src = `/api/fumble/image?src=${encodeURIComponent(src)}`;
  });
}
