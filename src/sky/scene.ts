import * as A from 'astronomy-engine';
import { geoStereographic, type GeoProjection } from 'd3-geo';
import sky from '../data/sky.json';

const DEG = Math.PI / 180;

export type Vec3 = [number, number, number];
export type Star = { ra: number; dec: number; mag: number; bv: number; hip: number; v: Vec3 };

/** Unit vector for RA/Dec in degrees (J2000 equatorial). */
export function radecToVec(raDeg: number, decDeg: number): Vec3 {
  const r = raDeg * DEG,
    d = decDeg * DEG;
  return [Math.cos(d) * Math.cos(r), Math.cos(d) * Math.sin(r), Math.sin(d)];
}
export function vecToRadec(v: Vec3): [number, number] {
  const ra = Math.atan2(v[1], v[0]) / DEG;
  const dec = Math.asin(Math.max(-1, Math.min(1, v[2] / Math.hypot(...v)))) / DEG;
  return [ra > 180 ? ra - 360 : ra, dec];
}
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const STARS: Star[] = (sky.stars as number[][]).map(([ra, dec, mag, bv, hip]) => ({
  ra,
  dec,
  mag,
  bv,
  hip,
  v: radecToVec(ra, dec),
}));
export const STAR_NAMES = sky.starNames as Record<string, string>;
export const FIGURES = sky.lines as { id: string; rank: number; lines: [number, number][][] }[];
export const CONSTELLATIONS = sky.constellations as { id: string; name: string; rank: number; at: [number, number] }[];
export const MILKY_WAY = sky.mw as unknown as [number, number][][][][];

export type BodyName = 'Mercury' | 'Venus' | 'Mars' | 'Jupiter' | 'Saturn';
export const PLANETS: BodyName[] = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];

export type BodyPos = {
  name: string;
  ra: number; // J2000 degrees, topocentric
  dec: number;
  alt: number; // degrees above horizon (no refraction)
  az: number;
  mag?: number;
};

export type MoonInfo = BodyPos & {
  phaseAngle: number; // 0 new → 180 full → 360
  illumination: number; // 0..1
  phaseName: string;
  /** a point 2° from the moon towards the sun, for drawing the bright limb */
  towardSun: [number, number];
};

export type Scene = {
  time: Date;
  lat: number;
  lon: number;
  zenith: [number, number]; // J2000 RA/Dec of the zenith
  north: [number, number]; // J2000 RA/Dec of the north point on the horizon
  zenithVec: Vec3;
  lstHours: number;
  planets: BodyPos[];
  moon: MoonInfo;
  sun: BodyPos;
};

function horToRadec(alt: number, az: number, time: A.AstroTime, rot: A.RotationMatrix): [number, number] {
  const v = A.VectorFromHorizon(new A.Spherical(alt, az, 1), time, '');
  const e = A.RotateVector(rot, v);
  return vecToRadec([e.x, e.y, e.z]);
}

function bodyPos(body: A.Body, time: A.AstroTime, obs: A.Observer): BodyPos {
  const j2000 = A.Equator(body, time, obs, false, true);
  const ofDate = A.Equator(body, time, obs, true, true);
  const hor = A.Horizon(time, obs, ofDate.ra, ofDate.dec);
  let mag: number | undefined;
  try {
    if (body !== A.Body.Sun) mag = A.Illumination(body, time).mag;
  } catch {
    /* ignore */
  }
  let ra = j2000.ra * 15;
  if (ra > 180) ra -= 360;
  return { name: body, ra, dec: j2000.dec, alt: hor.altitude, az: hor.azimuth, mag };
}

export function phaseName(angle: number): string {
  const a = ((angle % 360) + 360) % 360;
  if (a < 6 || a >= 354) return 'New Moon';
  if (a < 84) return 'Waxing Crescent';
  if (a < 96) return 'First Quarter';
  if (a < 174) return 'Waxing Gibbous';
  if (a < 186) return 'Full Moon';
  if (a < 264) return 'Waning Gibbous';
  if (a < 276) return 'Last Quarter';
  return 'Waning Crescent';
}

export function computeScene(time: Date, lat: number, lon: number): Scene {
  const t = A.MakeTime(time);
  const obs = new A.Observer(lat, lon, 0);
  const rot = A.Rotation_HOR_EQJ(t, obs);
  const zenith = horToRadec(90, 0, t, rot);
  const north = horToRadec(0, 0, t, rot);

  const planets = PLANETS.map((p) => bodyPos(A.Body[p], t, obs));
  const sun = bodyPos(A.Body.Sun, t, obs);
  const m = bodyPos(A.Body.Moon, t, obs);
  const phaseAngle = A.MoonPhase(t);
  const illumination = A.Illumination(A.Body.Moon, t).phase_fraction;

  // Point slightly along the great circle from the moon towards the sun.
  const mv = radecToVec(m.ra, m.dec);
  const sv = radecToVec(sun.ra, sun.dec);
  const c = dot(mv, sv);
  const perp: Vec3 = [sv[0] - c * mv[0], sv[1] - c * mv[1], sv[2] - c * mv[2]];
  const pl = Math.hypot(...perp) || 1;
  const k = Math.tan(2 * DEG) / pl;
  const toward = vecToRadec([mv[0] + perp[0] * k, mv[1] + perp[1] * k, mv[2] + perp[2] * k]);

  let lst = (A.SiderealTime(t) + lon / 15) % 24;
  if (lst < 0) lst += 24;

  return {
    time,
    lat,
    lon,
    zenith,
    north,
    zenithVec: radecToVec(...zenith),
    lstHours: lst,
    planets,
    sun,
    moon: { ...m, name: 'Moon', phaseAngle, illumination, phaseName: phaseName(phaseAngle), towardSun: toward },
  };
}

/** Is a J2000 unit vector above the horizon for this scene? */
export function aboveHorizon(scene: Scene, v: Vec3, marginDeg = 0): boolean {
  return dot(scene.zenithVec, v) > Math.sin(marginDeg * DEG);
}

/**
 * Zenith-centred stereographic projection of the sky as seen from below:
 * north up, east to the left, horizon at radius R.
 */
export function makeProjection(scene: Scene, R: number, cx: number, cy: number): GeoProjection {
  const build = (gamma: number) =>
    geoStereographic()
      .reflectX(true)
      .rotate([-scene.zenith[0], -scene.zenith[1], gamma])
      .clipAngle(90)
      .scale(R)
      .translate([cx, cy])
      .precision(0.2);
  const angleOfNorth = (g: number) => {
    const p = build(g)(scene.north)!;
    return Math.atan2(p[0] - cx, -(p[1] - cy)) / DEG; // clockwise from straight up
  };
  // Find the roll that sends the north point straight up (a few secant steps).
  let g0 = 0,
    a0 = angleOfNorth(0),
    g1 = 10,
    a1 = angleOfNorth(10);
  for (let i = 0; i < 8 && Math.abs(a1) > 1e-9; i++) {
    const d = ((a1 - a0 + 540) % 360) - 180 || 1e-9;
    const g2 = g1 - (a1 * (g1 - g0)) / d;
    [g0, a0, g1, a1] = [g1, a1, g2, angleOfNorth(g2)];
  }
  return build(g1);
}

/** Ecliptic as a J2000 line of RA/Dec points. */
export function eclipticLine(): [number, number][] {
  const eps = 23.4392911 * DEG;
  const pts: [number, number][] = [];
  for (let l = 0; l <= 360; l += 2) {
    const L = l * DEG;
    const v: Vec3 = [Math.cos(L), Math.sin(L) * Math.cos(eps), Math.sin(L) * Math.sin(eps)];
    pts.push(vecToRadec(v));
  }
  return pts;
}
