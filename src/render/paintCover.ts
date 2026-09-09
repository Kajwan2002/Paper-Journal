import { grainTile, mulberry32 } from "@/lib/noise";
import { mix, type Palette } from "@/lib/theme";
import type { CoverStyle } from "@/lib/db";

/** Leather covers, painted. Colours are per-style rather than themed — a
 *  forest notebook is forest by lamplight too. */
const HIDES: Record<CoverStyle, [string, string, string, string]> = {
  // base, highlight, shadow, emboss
  oxblood: ["#5a2a2f", "#7c3c40", "#38181c", "#d9b98c"],
  tan: ["#8a6a45", "#a9895f", "#553d29", "#efdcbc"],
  forest: ["#2f4436", "#42604b", "#1a2a20", "#cfe0cf"],
  "black-cloth": ["#2a2a2c", "#3c3c3f", "#141416", "#c8c8cc"],
};

function prep(
  canvas: HTMLCanvasElement,
  w: number,
  h: number,
  dpr: number,
): CanvasRenderingContext2D {
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

export function paintCover(
  canvas: HTMLCanvasElement,
  w: number,
  h: number,
  dpr: number,
  title: string,
  style: CoverStyle,
  lightWarmth = 0,
): void {
  const [base, hi, lo, emboss] = HIDES[style];
  const ctx = prep(canvas, w, h, dpr);

  // hide, lit from the upper right
  const g = ctx.createRadialGradient(
    w * 0.72,
    h * 0.22,
    0,
    w * 0.5,
    h * 0.5,
    Math.max(w, h) * 0.95,
  );
  g.addColorStop(0, mix(hi, "#ffffff", 0.05 + lightWarmth * 0.12));
  g.addColorStop(0.45, base);
  g.addColorStop(1, lo);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // pebbled grain
  const pat = ctx.createPattern(grainTile(), "repeat");
  if (pat) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.globalCompositeOperation = "overlay";
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // long creases in the hide
  const rnd = mulberry32(style.length * 977 + Math.round(w));
  ctx.save();
  ctx.globalCompositeOperation = "soft-light";
  for (let i = 0; i < 7; i++) {
    ctx.strokeStyle = i % 2 ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.14)";
    ctx.lineWidth = 1 + rnd() * 1.6;
    ctx.beginPath();
    const y0 = rnd() * h;
    ctx.moveTo(-10, y0);
    ctx.bezierCurveTo(
      w * 0.3,
      y0 + (rnd() - 0.5) * h * 0.3,
      w * 0.7,
      y0 + (rnd() - 0.5) * h * 0.3,
      w + 10,
      rnd() * h,
    );
    ctx.stroke();
  }
  ctx.restore();

  // spine lip
  const lip = ctx.createLinearGradient(0, 0, w * 0.09, 0);
  lip.addColorStop(0, "rgba(0,0,0,0.42)");
  lip.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = lip;
  ctx.fillRect(0, 0, w * 0.09, h);

  // right-edge sheen
  const edge = ctx.createLinearGradient(w, 0, w * 0.9, 0);
  edge.addColorStop(0, "rgba(255,255,255,0.06)");
  edge.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = edge;
  ctx.fillRect(w * 0.9, 0, w * 0.1, h);

  // embossed frame
  const m = w * 0.09;
  ctx.strokeStyle = mix(emboss, base, 0.35, 0.5);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(m, m, w - m * 2, h - m * 2);
  ctx.strokeStyle = "rgba(0,0,0,0.28)";
  ctx.lineWidth = 1;
  ctx.strokeRect(m + 3, m + 3, w - m * 2 - 6, h - m * 2 - 6);

  // title, blind-stamped: dark then light offset
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${w * 0.12}px "Fraunces", Georgia, serif`;
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillText(title, w / 2 + 1, h / 2 + 1.5);
  ctx.fillStyle = mix(emboss, "#ffffff", 0.05);
  ctx.fillText(title, w / 2, h / 2);
  ctx.textAlign = "left";
}

/** The paste-down endpaper seen when the cover lifts. */
export function paintEndpaper(
  canvas: HTMLCanvasElement,
  w: number,
  h: number,
  dpr: number,
  pal: Palette,
): void {
  const ctx = prep(canvas, w, h, dpr);
  ctx.fillStyle = mix(pal.paper, pal.brass, 0.18);
  ctx.fillRect(0, 0, w, h);

  // combed marbling, faint
  const rnd = mulberry32(4242 + Math.round(w));
  ctx.save();
  ctx.globalAlpha = 0.14;
  for (let i = 0; i < 26; i++) {
    ctx.strokeStyle = i % 3 === 0 ? pal.oxblood : pal.brass;
    ctx.lineWidth = 1 + rnd() * 2;
    ctx.beginPath();
    const x = rnd() * w;
    ctx.moveTo(x, -10);
    ctx.bezierCurveTo(
      x + (rnd() - 0.5) * w * 0.5,
      h * 0.35,
      x + (rnd() - 0.5) * w * 0.5,
      h * 0.7,
      x + (rnd() - 0.5) * w * 0.3,
      h + 10,
    );
    ctx.stroke();
  }
  ctx.restore();

  const pat = ctx.createPattern(grainTile(), "repeat");
  if (pat) {
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.globalCompositeOperation = "overlay";
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  const g = ctx.createLinearGradient(0, 0, w * 0.12, 0);
  g.addColorStop(0, "rgba(0,0,0,0.22)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w * 0.12, h);
}
