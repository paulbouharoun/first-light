import { geoPath, type GeoProjection } from 'd3-geo';
import {
  CONSTELLATIONS,
  FIGURES,
  MILKY_WAY,
  STARS,
  STAR_NAMES,
  aboveHorizon,
  eclipticLine,
  makeProjection,
  radecToVec,
  type Scene,
} from '../sky/scene';
import type { Theme } from './themes';

/** A3 portrait in millimetres. Everything is laid out in mm and scaled. */
export const PAGE_W = 297;
export const PAGE_H = 420;

export type PosterOptions = {
  constellations: boolean;
  labels: boolean;
  milkyWay: boolean;
  grid: boolean;
  magLimit: number;
};

export type PosterSpec = {
  scene: Scene;
  theme: Theme;
  caption: string;
  dateLine: string;
  place: string;
  coordsLine: string;
  options: PosterOptions;
  seed: number;
};

const SERIF = '"IM Fell English", "Iowan Old Style", Georgia, serif';
const SC = '"IM Fell English SC", "IM Fell English", Georgia, serif';
const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';
const TAU = Math.PI * 2;

const CX = PAGE_W / 2;
const CY = 168;
const R = 102;

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

type Ctx = CanvasRenderingContext2D;

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Star radius in mm from magnitude. */
export function starRadius(mag: number, limit: number): number {
  return 0.22 + Math.pow(Math.max(0, limit - mag), 1.12) * 0.17;
}

function setFont(ctx: Ctx, family: string, sizeMm: number, style = '', spacingMm = 0) {
  ctx.font = `${style} ${sizeMm}px ${family}`.trim();
  if ('letterSpacing' in ctx) (ctx as Ctx & { letterSpacing: string }).letterSpacing = `${spacingMm}px`;
}

function spacedWidth(ctx: Ctx, text: string): number {
  return ctx.measureText(text).width;
}

/** Fit text to a maximum width by shrinking the font. Returns the size used. */
function fitText(ctx: Ctx, text: string, family: string, size: number, maxW: number, style = '', sp = 0): number {
  let s = size;
  setFont(ctx, family, s, style, sp);
  while (spacedWidth(ctx, text) > maxW && s > size * 0.35) {
    s *= 0.96;
    setFont(ctx, family, s, style, sp * (s / size));
  }
  return s;
}

/** Grain tile of random speckles, generated at device resolution. */
function speckleTile(rand: () => number, size: number, color: string, density: number, maxAlpha: number) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  const [r, gg, b] = hexToRgb(color);
  for (let i = 0; i < size * size; i++) {
    if (rand() < density) {
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = gg;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = Math.round(rand() * maxAlpha * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Stipple tile in mm units, for the engraved Milky Way. */
function stippleTile(rand: () => number, u: number, tileMm: number, dots: number, dotMm: number, color: string) {
  const px = Math.max(8, Math.round(tileMm * u));
  const c = makeCanvas(px, px);
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  for (let i = 0; i < dots; i++) {
    const x = rand() * px,
      y = rand() * px,
      r = Math.max(0.5, dotMm * u * (0.6 + rand() * 0.8));
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  }
  return c;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgba(hex: string, a: number) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

type Box = { x: number; y: number; w: number; h: number };
class Labeller {
  boxes: Box[] = [];
  /** Try right, left, above, below a point; keep the label inside the horizon. */
  place(x: number, y: number, gap: number, w: number, h: number): Box | null {
    const tries: Box[] = [
      { x: x + gap, y: y - h / 2, w, h },
      { x: x - gap - w, y: y - h / 2, w, h },
      { x: x - w / 2, y: y - gap - h, w, h },
      { x: x - w / 2, y: y + gap, w, h },
    ];
    const inside = (b: Box) =>
      [b.x, b.x + b.w].every((bx) => [b.y, b.y + b.h].every((by) => Math.hypot(bx - CX, by - CY) < R - 1));
    for (const b of tries) if (inside(b) && this.free(b)) return this.take(b), b;
    for (const b of tries) if (inside(b)) return this.take(b), b;
    return null;
  }
  free(b: Box) {
    const pad = 0.6;
    return !this.boxes.some(
      (o) => b.x < o.x + o.w + pad && b.x + b.w + pad > o.x && b.y < o.y + o.h + pad && b.y + b.h + pad > o.y,
    );
  }
  take(b: Box) {
    this.boxes.push(b);
  }
}

/** Draws a moon disc. `limbAngle` points from centre to the bright limb (radians, canvas space). */
export function drawMoonGlyph(ctx: Ctx, x: number, y: number, r: number, phaseAngle: number, limbAngle: number, lit: string, dark: string, line: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(limbAngle);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = dark;
  ctx.fill();
  const ex = r * Math.cos((phaseAngle * Math.PI) / 180);
  ctx.beginPath();
  ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
  ctx.ellipse(0, 0, Math.abs(ex), r, 0, Math.PI / 2, -Math.PI / 2, ex > 0);
  ctx.closePath();
  ctx.fillStyle = lit;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.lineWidth = line;
  ctx.strokeStyle = lit;
  ctx.stroke();
  ctx.restore();
}

function ornamentRule(ctx: Ctx, cx: number, y: number, half: number, color: string) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 0.22;
  ctx.beginPath();
  ctx.moveTo(cx - half, y);
  ctx.lineTo(cx - 3.2, y);
  ctx.moveTo(cx + 3.2, y);
  ctx.lineTo(cx + half, y);
  ctx.stroke();
  // four-pointed star
  ctx.beginPath();
  const a = 1.9,
    b = 0.45;
  ctx.moveTo(cx, y - a);
  ctx.lineTo(cx + b, y - b);
  ctx.lineTo(cx + a, y);
  ctx.lineTo(cx + b, y + b);
  ctx.lineTo(cx, y + a);
  ctx.lineTo(cx - b, y + b);
  ctx.lineTo(cx - a, y);
  ctx.lineTo(cx - b, y - b);
  ctx.closePath();
  ctx.fill();
}

/** Point on the chart for an azimuth/altitude given the horizon radius. */
function azAltXY(az: number, alt: number): [number, number] {
  const r = R * Math.tan(((90 - alt) / 2) * (Math.PI / 180));
  const a = (az * Math.PI) / 180;
  return [CX - r * Math.sin(a), CY - r * Math.cos(a)];
}

// ---------------------------------------------------------------- ink layer

function drawInk(ctx: Ctx, spec: PosterSpec, proj: GeoProjection, u: number, rand: () => number, labels: Labeller) {
  const { theme, options, scene } = spec;
  const ink = theme.ink;
  const path = geoPath(proj, ctx);

  // Frame: heavy outer rule, hairline inner rule
  ctx.strokeStyle = ink;
  ctx.lineWidth = 0.9;
  ctx.strokeRect(13, 13, PAGE_W - 26, PAGE_H - 26);
  ctx.lineWidth = 0.22;
  ctx.strokeRect(15.2, 15.2, PAGE_W - 30.4, PAGE_H - 30.4);

  // Header
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  setFont(ctx, SC, 4.4, '', 1.1);
  ctx.fillText('a chart of the heavens', CX, 32);
  setFont(ctx, SERIF, 3.1, 'italic', 0.1);
  ctx.globalAlpha = 0.8;
  ctx.fillText(
    scene.sun.alt > 0
      ? 'as they stood, unseen behind the daylight, above the place & hour here recorded'
      : 'as they stood above the place & hour here recorded',
    CX,
    37.6,
  );
  ctx.globalAlpha = 1;

  // ---- inside the horizon
  ctx.save();
  ctx.beginPath();
  ctx.arc(CX, CY, R, 0, TAU);
  ctx.clip();

  if (options.milkyWay) {
    const tile = stippleTile(rand, u, 12, 210, 0.1, ink);
    const pat = ctx.createPattern(tile, 'repeat')!;
    const m = new DOMMatrix().scaleSelf(1 / u, 1 / u);
    MILKY_WAY.forEach((level, i) => {
      m.translateSelf(37 * u * (i + 1), 53 * u * (i + 1));
      pat.setTransform(m);
      ctx.fillStyle = pat;
      ctx.globalAlpha = theme.blend === 'multiply' ? 0.72 : 0.6;
      ctx.beginPath();
      path({ type: 'MultiPolygon', coordinates: level } as GeoJSON.MultiPolygon);
      ctx.fill('evenodd');
    });
    ctx.globalAlpha = 1;
  }

  if (options.grid) {
    ctx.strokeStyle = rgba(ink, 0.45);
    ctx.lineWidth = 0.16;
    ctx.setLineDash([0.5, 1.1]);
    for (const alt of [30, 60]) {
      const r = R * Math.tan(((90 - alt) / 2) * (Math.PI / 180));
      ctx.beginPath();
      ctx.arc(CX, CY, r, 0, TAU);
      ctx.stroke();
    }
    ctx.beginPath();
    for (let az = 0; az < 360; az += 45) {
      const [x1, y1] = azAltXY(az, 60);
      const [x2, y2] = azAltXY(az, 0);
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    // zenith cross
    ctx.strokeStyle = rgba(ink, 0.6);
    ctx.lineWidth = 0.18;
    ctx.beginPath();
    ctx.moveTo(CX - 1.6, CY);
    ctx.lineTo(CX + 1.6, CY);
    ctx.moveTo(CX, CY - 1.6);
    ctx.lineTo(CX, CY + 1.6);
    ctx.stroke();
  }

  if (options.constellations) {
    ctx.strokeStyle = rgba(ink, 0.62);
    ctx.lineWidth = 0.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (const f of FIGURES) path({ type: 'MultiLineString', coordinates: f.lines } as GeoJSON.MultiLineString);
    ctx.stroke();
  }

  // Stars: paper halo knocks out lines, then the ink dot — the engraver's trick.
  const visible = STARS.filter((s) => s.mag <= options.magLimit && aboveHorizon(scene, s.v, -0.5)).sort(
    (a, b) => b.mag - a.mag,
  );
  const placed: { x: number; y: number; r: number; hip: number; mag: number }[] = [];
  for (const s of visible) {
    const p = proj([s.ra, s.dec]);
    if (!p) continue;
    const r = starRadius(s.mag, options.magLimit);
    placed.push({ x: p[0], y: p[1], r, hip: s.hip, mag: s.mag });
  }
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  for (const s of placed) {
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r + 0.38, 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  for (const s of placed) {
    // slight irregularity, like a hand-punched plate
    const j = 1 + (rand() - 0.5) * 0.08;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r * j, 0, TAU);
    ctx.fill();
    if (s.mag < 1.6) {
      // engraved rays for the first-magnitude stars
      const L = s.r * 2.3,
        w = s.r * 0.28;
      const rot = rand() * 0.3;
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        const a = rot + (k * Math.PI) / 2;
        const ca = Math.cos(a),
          sa = Math.sin(a);
        ctx.moveTo(s.x + ca * L, s.y + sa * L);
        ctx.lineTo(s.x - sa * w, s.y + ca * w);
        ctx.lineTo(s.x + sa * w, s.y - ca * w);
        ctx.closePath();
      }
      ctx.fill();
    }
    if (s.mag < 3.5) labels.take({ x: s.x - s.r, y: s.y - s.r, w: s.r * 2, h: s.r * 2 });
  }

  // Star names
  if (options.labels) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    setFont(ctx, SERIF, 2.45, 'italic', 0.05);
    const named = placed.filter((s) => STAR_NAMES[s.hip]).sort((a, b) => a.mag - b.mag);
    const seen = new Set<string>();
    for (const s of named) {
      const name = STAR_NAMES[s.hip];
      if (seen.has(name) || name === 'Toliman') continue;
      seen.add(name);
      const w = spacedWidth(ctx, name);
      const box = { x: s.x + s.r + 0.9, y: s.y - 1.4, w, h: 2.8 };
      if (Math.hypot(box.x + w - CX, s.y - CY) > R - 1.5 || !labels.free(box)) continue;
      labels.take(box);
      ctx.fillText(name, box.x, s.y);
    }
  }
  ctx.restore();

  // Horizon and the graduated ring
  ctx.strokeStyle = ink;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.arc(CX, CY, R, 0, TAU);
  ctx.stroke();
  ctx.lineWidth = 0.2;
  for (const rr of [R + 1.6, R + 6.6]) {
    ctx.beginPath();
    ctx.arc(CX, CY, rr, 0, TAU);
    ctx.stroke();
  }
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  ctx.arc(CX, CY, R + 7.6, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  for (let az = 0; az < 360; az++) {
    const len = az % 10 === 0 ? 5 : az % 5 === 0 ? 3 : 1.6;
    const a = (az * Math.PI) / 180;
    const sx = -Math.sin(a),
      sy = -Math.cos(a);
    ctx.moveTo(CX + sx * (R + 1.6), CY + sy * (R + 1.6));
    ctx.lineTo(CX + sx * (R + 1.6 + len), CY + sy * (R + 1.6 + len));
  }
  ctx.lineWidth = 0.15;
  ctx.stroke();

  // Degree numerals around the ring
  setFont(ctx, MONO, 1.75, '', 0.05);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = ink;
  for (let az = 10; az < 360; az += 10) {
    if (az % 90 === 0) continue;
    const a = (az * Math.PI) / 180;
    ctx.save();
    ctx.translate(CX - Math.sin(a) * (R + 10.2), CY - Math.cos(a) * (R + 10.2));
    ctx.rotate(-a);
    ctx.fillText(String(az), 0, 0);
    ctx.restore();
  }

  // Cardinal points
  const cards: [string, number][] = [
    ['N', 0],
    ['E', 90],
    ['S', 180],
    ['W', 270],
  ];
  setFont(ctx, SC, 6.2, '', 0);
  for (const [t, az] of cards) {
    const a = (az * Math.PI) / 180;
    ctx.fillText(t, CX - Math.sin(a) * (R + 12.4), CY - Math.cos(a) * (R + 12.4) + 0.3);
  }
  setFont(ctx, SERIF, 2.5, 'italic', 0);
  for (const [t, az] of [
    ['ne', 45],
    ['se', 135],
    ['sw', 225],
    ['nw', 315],
  ] as [string, number][]) {
    const a = (az * Math.PI) / 180;
    ctx.fillText(t, CX - Math.sin(a) * (R + 12.4), CY - Math.cos(a) * (R + 12.4));
  }

  // ---- letterpress block beneath the chart
  const textW = PAGE_W - 70;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const caption = spec.caption.trim() || 'The sky the moment you arrived';
  fitText(ctx, caption, SERIF, 13.5, textW);
  ctx.fillText(caption, CX, 316);

  fitText(ctx, spec.dateLine, SERIF, 5.6, textW, 'italic', 0.05);
  ctx.globalAlpha = 0.92;
  ctx.fillText(spec.dateLine, CX, 329.5);
  ctx.globalAlpha = 1;

  if (spec.place) {
    fitText(ctx, spec.place.toLowerCase(), SC, 4.3, textW, '', 0.9);
    ctx.fillText(spec.place.toLowerCase(), CX, 340);
  }

  fitText(ctx, spec.coordsLine, MONO, 2.7, textW, '', 0.35);
  ctx.globalAlpha = 0.85;
  ctx.fillText(spec.coordsLine, CX, 364);
  ctx.globalAlpha = 1;

  // Footer legend
  setFont(ctx, MONO, 2.05, '', 0.3);
  ctx.globalAlpha = 0.78;
  ctx.textAlign = 'left';
  const m = scene.moon;
  ctx.fillText(
    `MOON · ${m.phaseName.toUpperCase()} · ${Math.round(m.illumination * 100)}% LIT`,
    30.5,
    392,
  );
  ctx.textAlign = 'right';
  ctx.fillText(
    `STARS TO MAG ${options.magLimit.toFixed(1)} · STEREOGRAPHIC, ZENITH CENTRED`,
    PAGE_W - 24,
    392,
  );
  ctx.globalAlpha = 1;

  // Legend line art separating footer
  ctx.lineWidth = 0.18;
  ctx.beginPath();
  ctx.moveTo(24, 384);
  ctx.lineTo(PAGE_W - 24, 384);
  ctx.stroke();
}

// ------------------------------------------------------------- accent layer

function drawAccent(ctx: Ctx, spec: PosterSpec, proj: GeoProjection, labels: Labeller) {
  const { theme, scene, options } = spec;
  const acc = theme.accent;
  const path = geoPath(proj, ctx);
  ctx.strokeStyle = acc;
  ctx.fillStyle = acc;

  ctx.save();
  ctx.beginPath();
  ctx.arc(CX, CY, R, 0, TAU);
  ctx.clip();

  if (options.grid) {
    ctx.lineWidth = 0.28;
    ctx.setLineDash([2.2, 1.2]);
    ctx.beginPath();
    path({ type: 'LineString', coordinates: eclipticLine() } as GeoJSON.LineString);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Constellation names in red small caps, like a hand-coloured atlas
  if (options.constellations && options.labels) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    setFont(ctx, SC, 2.6, '', 0.6);
    for (const c of CONSTELLATIONS) {
      if (c.rank > 2) continue;
      if (!aboveHorizon(scene, radecToVec(c.at[0], c.at[1]), 6)) continue;
      const p = proj(c.at);
      if (!p) continue;
      const t = c.name.toLowerCase();
      const w = spacedWidth(ctx, t);
      const box = { x: p[0] - w / 2, y: p[1] - 1.3, w, h: 2.6 };
      if (!labels.free(box)) continue;
      labels.take(box);
      ctx.globalAlpha = 0.85;
      ctx.fillText(t, p[0], p[1]);
      ctx.globalAlpha = 1;
    }
  }

  // Planets
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const pl of scene.planets) {
    if (pl.alt < -0.5) continue;
    const p = proj([pl.ra, pl.dec]);
    if (!p) continue;
    const r = 0.95 + Math.min(0.6, Math.max(0, 1.5 - (pl.mag ?? 1)) * 0.11);
    ctx.beginPath();
    ctx.arc(p[0], p[1], r, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 0.18;
    ctx.beginPath();
    ctx.arc(p[0], p[1], r + 0.75, 0, TAU);
    ctx.stroke();
    setFont(ctx, SERIF, 2.8, 'italic', 0.05);
    const w = spacedWidth(ctx, pl.name);
    const box = labels.place(p[0], p[1], r + 1.4, w, 3);
    if (box) ctx.fillText(pl.name, box.x, box.y + 1.5);
  }

  // Sun, if it is up
  if (scene.sun.alt > -0.5) {
    const p = proj([scene.sun.ra, scene.sun.dec]);
    if (p) {
      ctx.lineWidth = 0.3;
      ctx.beginPath();
      ctx.arc(p[0], p[1], 2.6, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p[0], p[1], 0.6, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      for (let k = 0; k < 16; k++) {
        const a = (k * TAU) / 16;
        const l = k % 2 ? 4.1 : 5.2;
        ctx.moveTo(p[0] + Math.cos(a) * 3.2, p[1] + Math.sin(a) * 3.2);
        ctx.lineTo(p[0] + Math.cos(a) * l, p[1] + Math.sin(a) * l);
      }
      ctx.stroke();
      setFont(ctx, SERIF, 2.9, 'italic', 0.05);
      const box = labels.place(p[0], p[1], 6, spacedWidth(ctx, 'Sol'), 3);
      if (box) ctx.fillText('Sol', box.x, box.y + 1.5);
    }
  }

  // Moon
  const m = scene.moon;
  let limb = 0;
  const mp = proj([m.ra, m.dec]);
  const tp = proj(m.towardSun);
  if (mp && tp) limb = Math.atan2(tp[1] - mp[1], tp[0] - mp[0]);
  if (m.alt > -0.5 && mp) {
    drawMoonGlyph(ctx, mp[0], mp[1], 3.4, m.phaseAngle, limb, acc, rgba(acc, 0.16), 0.22);
    setFont(ctx, SERIF, 2.9, 'italic', 0.05);
    const w = spacedWidth(ctx, 'Luna');
    const box = labels.place(mp[0], mp[1], 4.6, w, 3);
    if (box) ctx.fillText('Luna', box.x, box.y + 1.5);
  }
  ctx.restore();

  // Ornament rules
  ornamentRule(ctx, CX, 350.5, 52, acc);
  ornamentRule(ctx, CX, 42.5, 34, acc);

  // Footer moon glyph — bright limb as seen from the observer's hemisphere
  const waxing = m.phaseAngle < 180;
  const right = waxing === scene.lat >= 0;
  drawMoonGlyph(ctx, 26.6, 391.3, 1.9, m.phaseAngle, right ? 0 : Math.PI, acc, rgba(acc, 0.16), 0.2);

  // Cardinal N in accent, a small flourish
  ctx.beginPath();
  ctx.moveTo(CX, CY - R - 7.6);
  ctx.lineTo(CX - 1.2, CY - R - 4.6);
  ctx.lineTo(CX + 1.2, CY - R - 4.6);
  ctx.closePath();
  ctx.fill();
}

// ---------------------------------------------------------------- composite

/**
 * Render the poster to a canvas `widthPx` wide (height follows A3 ratio).
 * Ink and accent are printed as separate "drums": each layer gets ink
 * dropouts, and the accent layer is slightly mis-registered.
 */
export function renderPoster(spec: PosterSpec, widthPx: number, target?: HTMLCanvasElement): HTMLCanvasElement {
  const W = Math.round(widthPx);
  const H = Math.round((widthPx * PAGE_H) / PAGE_W);
  const u = W / PAGE_W;
  const out = target ?? makeCanvas(W, H);
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d')!;
  const rand = mulberry32(spec.seed);
  const { theme } = spec;

  // Paper
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = theme.paper;
  ctx.fillRect(0, 0, W, H);
  // Mottling and faint foxing
  ctx.setTransform(u, 0, 0, u, 0, 0);
  for (let i = 0; i < 16; i++) {
    const x = rand() * PAGE_W,
      y = rand() * PAGE_H,
      r = 40 + rand() * 140;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(theme.paperShade, 0.11 * rand()));
    g.addColorStop(1, rgba(theme.paperShade, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  }
  const edge = ctx.createRadialGradient(CX, PAGE_H / 2, PAGE_H * 0.35, CX, PAGE_H / 2, PAGE_H * 0.75);
  edge.addColorStop(0, rgba(theme.paperShade, 0));
  edge.addColorStop(1, rgba(theme.paperShade, 0.28));
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);

  const proj = makeProjection(spec.scene, R, CX, CY);
  const labels = new Labeller();
  const layer = makeCanvas(W, H);
  const lctx = layer.getContext('2d')!;
  const dropTile = speckleTile(rand, 384, '#000000', 0.16, 0.85);
  const dropPattern = (c: Ctx) => {
    const p = c.createPattern(dropTile, 'repeat')!;
    const s = Math.max(1, u / 9);
    p.setTransform(new DOMMatrix().scaleSelf(s, s));
    return p;
  };

  const printLayer = (draw: (c: Ctx) => void, dx: number, dy: number, alpha: number) => {
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = 'source-over';
    lctx.clearRect(0, 0, W, H);
    lctx.setTransform(u, 0, 0, u, 0, 0);
    draw(lctx);
    // ink dropouts
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = 'destination-out';
    lctx.fillStyle = dropPattern(lctx);
    lctx.fillRect(0, 0, W, H);
    lctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = theme.blend;
    ctx.globalAlpha = alpha;
    ctx.drawImage(layer, dx * u, dy * u);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };

  printLayer((c) => drawInk(c, spec, proj, u, rand, labels), 0, 0, 0.94);
  const mis = 0.12 + rand() * 0.1;
  const ang = rand() * TAU;
  printLayer((c) => drawAccent(c, spec, proj, labels), Math.cos(ang) * mis, Math.sin(ang) * mis, 0.92);

  // Overall print grain: dark and light specks
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const s = Math.max(1, u / 10);
  for (const [color, density, alpha] of [
    [theme.blend === 'multiply' ? theme.ink : '#000000', 0.09, 0.16],
    ['#ffffff', 0.06, theme.blend === 'multiply' ? 0.22 : 0.07],
  ] as [string, number, number][]) {
    const pat = ctx.createPattern(speckleTile(rand, 256, color, density, alpha), 'repeat')!;
    pat.setTransform(new DOMMatrix().scaleSelf(s, s));
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W, H);
  }
  return out;
}
