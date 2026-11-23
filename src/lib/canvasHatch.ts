/**
 * The site's slanted lines, drawn in the top right corner of a picture: faint "/" lines that fade out toward the middle, the same texture as the
 * page's backdrop. `color` is the line colour (the page's --hatch), `scale` is how many canvas pixels make one drawing unit (2 for a picture drawn at
 * twice the size, 1 for the video).
 */
export function drawHatch(ctx: CanvasRenderingContext2D, pictureWidth: number, color: string, scale = 1) {
  const rw = 600;
  const rh = 340;
  const spacing = 26;
  const part = document.createElement("canvas");
  part.width = Math.round(rw * scale);
  part.height = Math.round(rh * scale);
  const p = part.getContext("2d");
  if (!p) return;
  p.scale(scale, scale);
  p.strokeStyle = color;
  p.lineWidth = 1.4;
  p.beginPath();
  for (let x = -rh; x <= rw; x += spacing) {
    p.moveTo(x, rh);
    p.lineTo(x + rh, 0);
  }
  p.stroke();
  // Strongest in the very corner, gone by the far edge.
  p.setTransform(1, 0, 0, 1, 0, 0);
  p.globalCompositeOperation = "destination-in";
  const fade = p.createLinearGradient(part.width, 0, part.width * 0.15, part.height);
  fade.addColorStop(0, "rgba(0,0,0,1)");
  fade.addColorStop(1, "rgba(0,0,0,0)");
  p.fillStyle = fade;
  p.fillRect(0, 0, part.width, part.height);
  ctx.drawImage(part, pictureWidth - rw, 0, rw, rh);
}
