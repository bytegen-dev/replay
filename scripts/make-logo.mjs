// Builds the Replay logo as SVG. Usage: node scripts/make-logo.mjs [stroke]   [mintScale]   (49 and 1 = the original artwork; defaults 96 and 0.88)
// Geometry was measured from the original 2000px PNG: two identical rounded triangles, one solid mint, one outlined,
// the outline offset up and to the left. Everything is in a 2000 x 2000 box.
import { writeFileSync } from "node:fs";

const stroke = Number(process.argv[2] ?? 96);
// 1 = the original size. Smaller leaves more space between the outline and the solid triangle.
const mintScale = Number(process.argv[3] ?? 0.88);
const S = 866; // side of the "core" triangle, before rounding
const W = (S * Math.sqrt(3)) / 2; // width of the core triangle


function mintPolygon() {
  const r = 94;
  const x = 688, y = 674;
  return { points: `${x},${y} ${x},${y + S} ${x + W},${y + S / 2}`, r };
}

export function logo({ bg, ink, mint = "#39d6a3", strokeWidth = stroke, transparent = false, scale = mintScale }) {
  // Original outline: centre line corner radius 94.5, stroke 49, outer edge x 468..1456. Keep the OUTER edge fixed as the stroke grows.
  const outerLeft = 468, outerTop = 370;
  const half = strokeWidth / 2;
  const rc = 119 - half; // centre-line corner radius = outer radius (119) minus half the stroke
  const x0 = outerLeft + half, y0 = outerTop + half; // centre line left / top of the rounded shape
  const A = [x0 + rc, y0 + rc], B = [x0 + rc, y0 + rc + S], C = [x0 + rc + W, y0 + rc + S / 2];
  const nAB = [-1, 0], nBC = [0.5, 0.8660254], nCA = [0.5, -0.8660254];
  const p = (v, n) => [v[0] + rc * n[0], v[1] + rc * n[1]].map((t) => +t.toFixed(2)).join(" ");
  const d = `M${p(A, nAB)} L${p(B, nAB)} A${rc} ${rc} 0 0 0 ${p(B, nBC)} L${p(C, nBC)} A${rc} ${rc} 0 0 0 ${p(C, nCA)} L${p(A, nCA)} A${rc} ${rc} 0 0 0 ${p(A, nAB)} Z`;
  const m = mintPolygon();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2000 2000" width="2000" height="2000">${transparent ? "" : `<rect width="2000" height="2000" fill="${bg}"/>`}<polygon transform="translate(1063 1107) scale(${scale}) translate(-1063 -1107)" points="${m.points}" fill="${mint}" stroke="${mint}" stroke-width="${m.r * 2}" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${ink}" stroke-width="${strokeWidth}" stroke-linejoin="round"/></svg>\n`;
}

if (process.argv[1].endsWith("make-logo.mjs")) {
  writeFileSync("public/replay-logo.svg", logo({ bg: "#071013", ink: "#ffffff" }));
  writeFileSync("public/replay-mark.svg", logo({ ink: "#ffffff", transparent: true }).replace('viewBox="0 0 2000 2000" width="2000" height="2000"', 'viewBox="350 352 1300 1300" width="1300" height="1300"')); // no background, for the header on the dark theme
  writeFileSync("public/replay-mark-dark.svg", logo({ ink: "#071013", transparent: true }).replace('viewBox="0 0 2000 2000" width="2000" height="2000"', 'viewBox="350 352 1300 1300" width="1300" height="1300"')); // the same with a dark outline, for the light theme
  writeFileSync("public/replay-logo-light.svg", logo({ bg: "#ffffff", ink: "#071013" }));
  console.log(`wrote public/replay-logo.svg and replay-logo-light.svg with stroke ${stroke} and mint scale ${mintScale}`);
}
