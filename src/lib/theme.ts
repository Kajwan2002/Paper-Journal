/** Reads the live CSS custom properties so the canvas painters draw with the
 *  exact same palette as the DOM — in either theme. Cheap; call at paint time. */

export interface Palette {
  paper: string;
  paperEdge: string;
  paperShade: string;
  ink: string;
  inkSoft: string;
  inkFaint: string;
  oxblood: string;
  brass: string;
  thread: string;
  rule: string;
  leather: string;
  leatherHi: string;
  leatherLo: string;
  emboss: string;
}

const VARS: Record<keyof Palette, string> = {
  paper: "--paper",
  paperEdge: "--paper-edge",
  paperShade: "--paper-shade",
  ink: "--ink",
  inkSoft: "--ink-soft",
  inkFaint: "--ink-faint",
  oxblood: "--oxblood",
  brass: "--brass",
  thread: "--thread",
  rule: "--rule",
  leather: "--leather",
  leatherHi: "--leather-hi",
  leatherLo: "--leather-lo",
  emboss: "--emboss",
};

export function readPalette(el: Element = document.documentElement): Palette {
  const cs = getComputedStyle(el);
  const out = {} as Palette;
  for (const key of Object.keys(VARS) as Array<keyof Palette>) {
    out[key] = cs.getPropertyValue(VARS[key]).trim() || "#000";
  }
  return out;
}

/** Parse `#rgb` / `#rrggbb` into [r,g,b] 0-255. */
export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(a: string, b: string, t: number, alpha = 1): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgba(${r}, ${g}, ${bl}, ${alpha})`;
}
