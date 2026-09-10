import {
  isToday,
  longDate,
  ordinalDay,
  weekday,
  type DayKey,
} from "@/lib/date";
import { glyphFor, isStruck, type Line } from "@/lib/rapidlog";
import { grainTile, mulberry32 } from "@/lib/noise";
import { mix, type Palette } from "@/lib/theme";
import type { PaperStyle } from "@/lib/db";

export interface PagePaint {
  canvas: HTMLCanvasElement;
  pageW: number;
  pageH: number;
  dpr: number;
  date: DayKey;
  lines: Line[];
  paper: PaperStyle;
  palette: Palette;
}

const DISPLAY = '"Fraunces", "Iowan Old Style", Georgia, serif';
const SERIF = '"Newsreader", Georgia, "Times New Roman", serif';
const MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';

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

function paperGround(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  pal: Palette,
): void {
  ctx.fillStyle = pal.paper;
  ctx.fillRect(0, 0, w, h);

  // soft aging toward the edges
  const vig = ctx.createRadialGradient(
    w * 0.42,
    h * 0.4,
    Math.min(w, h) * 0.2,
    w * 0.5,
    h * 0.5,
    Math.max(w, h) * 0.75,
  );
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, mix(pal.paper, "#000000", 0.09, 0.5));
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  // fibre grain
  const pat = ctx.createPattern(grainTile(), "repeat");
  if (pat) {
    ctx.save();
    ctx.globalAlpha = 0.04;
    ctx.globalCompositeOperation = "overlay";
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // a couple of faint foxing blotches, deterministic per size
  const rnd = mulberry32(Math.round(w * 100 + h));
  ctx.save();
  ctx.globalAlpha = 0.05;
  for (let i = 0; i < 3; i++) {
    const bx = rnd() * w;
    const by = rnd() * h;
    const br = (0.06 + rnd() * 0.1) * w;
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
    g.addColorStop(0, mix(pal.paper, pal.brass, 0.5));
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(bx - br, by - br, br * 2, br * 2);
  }
  ctx.restore();

  // gutter shadow at the spine
  const gut = ctx.createLinearGradient(0, 0, w * 0.14, 0);
  gut.addColorStop(0, "rgba(0,0,0,0.16)");
  gut.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gut;
  ctx.fillRect(0, 0, w * 0.14, h);
}

function rules(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bodyTop: number,
  rowH: number,
  paper: PaperStyle,
  pal: Palette,
): void {
  if (paper === "blank") return;
  ctx.save();
  if (paper === "dot-grid") {
    ctx.fillStyle = mix(pal.paper, pal.ink, 0.22);
    const step = rowH * 0.62;
    for (let y = bodyTop; y < h - rowH * 0.5; y += step) {
      for (let x = w * 0.1; x < w * 0.94; x += step) {
        ctx.beginPath();
        ctx.arc(x, y, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    ctx.strokeStyle = mix(pal.paper, pal.ink, 0.13);
    ctx.lineWidth = 1;
    for (let y = bodyTop + rowH; y < h - rowH * 0.4; y += rowH) {
      ctx.beginPath();
      ctx.moveTo(w * 0.06, y + 0.5);
      ctx.lineTo(w * 0.94, y + 0.5);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function clipText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + "…").width > maxW) {
    s = s.slice(0, -1);
  }
  return s + "…";
}

export function paintPage(o: PagePaint): void {
  const { pageW: w, pageH: h, dpr, date, lines, paper, palette: pal } = o;
  const ctx = prep(o.canvas, w, h, dpr);

  paperGround(ctx, w, h, pal);

  const marginX = w * 0.155;
  const textX = marginX + w * 0.045;
  const glyphX = marginX * 0.52;
  const padT = h * 0.07;
  const bodyTop = h * 0.235;
  const rowH = h * 0.052;
  const today = isToday(date);

  // red margin rule
  ctx.strokeStyle = pal.rule;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(marginX, 0);
  ctx.lineTo(marginX, h);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // header
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = pal.oxblood;
  ctx.font = `500 ${w * 0.033}px ${MONO}`;
  const wd = weekday(date).toUpperCase().split("").join("  ");
  ctx.fillText(wd, textX, padT + w * 0.03);

  ctx.fillStyle = today ? pal.oxblood : pal.inkFaint;
  ctx.font = `400 ${w * 0.028}px ${MONO}`;
  const folio = today ? "TODAY" : `NO. ${ordinalDay(date)}`;
  const fw = ctx.measureText(folio).width;
  ctx.fillText(folio, w * 0.94 - fw, padT + w * 0.03);

  ctx.fillStyle = pal.ink;
  ctx.font = `500 ${w * 0.083}px ${DISPLAY}`;
  ctx.fillText(
    clipText(ctx, longDate(date), w * 0.78),
    textX,
    bodyTop - h * 0.05,
  );

  // header underline
  ctx.strokeStyle = pal.rule;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(textX, bodyTop - h * 0.018);
  ctx.lineTo(w * 0.94, bodyTop - h * 0.018);
  ctx.stroke();
  ctx.globalAlpha = 1;

  rules(ctx, w, h, bodyTop, rowH, paper, pal);

  // lines
  const written = lines.filter((l) => l.text.trim().length > 0);
  if (written.length === 0) {
    ctx.fillStyle = pal.inkFaint;
    ctx.font = `italic 400 ${w * 0.045}px ${SERIF}`;
    ctx.fillText("What matters today?", textX, bodyTop + rowH * 0.7);
    return;
  }

  written.forEach((line, i) => {
    const y = bodyTop + rowH * (i + 0.72);
    if (y > h - rowH * 0.5) return;
    const struck = isStruck(line);
    const lx = textX + (line.indent ? w * 0.045 : 0);

    ctx.fillStyle =
      struck || line.kind === "priority"
        ? pal.oxblood
        : line.kind === "event"
          ? pal.thread
          : pal.inkFaint;
    ctx.font = `400 ${w * 0.038}px ${MONO}`;
    ctx.fillText(glyphFor(line), glyphX, y);

    const bold = !struck && line.kind === "priority" ? "600" : "400";
    const italic = line.kind === "idea" ? "italic " : "";
    ctx.font = `${italic}${bold} ${w * 0.043}px ${SERIF}`;
    ctx.fillStyle = struck
      ? pal.inkFaint
      : line.kind === "migrated"
        ? pal.inkSoft
        : pal.ink;
    const t = clipText(ctx, line.text.trim(), w * 0.94 - lx);
    ctx.fillText(t, lx, y);

    if (struck) {
      const tw = ctx.measureText(t).width;
      ctx.strokeStyle = pal.inkSoft;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(lx, y - w * 0.013);
      ctx.lineTo(lx + tw, y - w * 0.013);
      ctx.stroke();
    }
  });
}

/** The reverse of a leaf: paper with a whisper of show-through. */
export function paintPaperBack(
  canvas: HTMLCanvasElement,
  w: number,
  h: number,
  dpr: number,
  pal: Palette,
): void {
  const ctx = prep(canvas, w, h, dpr);
  paperGround(ctx, w, h, pal);
  const g = ctx.createLinearGradient(w, 0, w * 0.86, 0);
  g.addColorStop(0, "rgba(0,0,0,0.12)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(w * 0.86, 0, w * 0.14, h);
}
