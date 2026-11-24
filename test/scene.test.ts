import { describe, expect, it } from 'vitest';
import {
  STARS,
  aboveHorizon,
  computeScene,
  eclipticLine,
  makeProjection,
  phaseName,
} from '../src/sky/scene';

// Synthetic observing sites
const GREENWICH = { lat: 51.4769, lon: -0.0005 };
const SYDNEY = { lat: -33.8688, lon: 151.2093 };
const R = 1000,
  CX = 1200,
  CY = 1300;

describe('computeScene', () => {
  it('puts the zenith at the chart centre', () => {
    const s = computeScene(new Date('1990-08-12T22:30:00Z'), GREENWICH.lat, GREENWICH.lon);
    const p = makeProjection(s, R, CX, CY)(s.zenith)!;
    expect(p[0]).toBeCloseTo(CX, 3);
    expect(p[1]).toBeCloseTo(CY, 3);
  });

  it('puts the north horizon point straight up at radius R', () => {
    const s = computeScene(new Date('2001-03-02T03:15:00Z'), GREENWICH.lat, GREENWICH.lon);
    const p = makeProjection(s, R, CX, CY)(s.north)!;
    expect(p[0]).toBeCloseTo(CX, 1);
    expect(p[1]).toBeCloseTo(CY - R, 1);
  });

  it('places Polaris at roughly the observer latitude, due north', () => {
    const s = computeScene(new Date('2015-11-20T21:00:00Z'), GREENWICH.lat, GREENWICH.lon);
    const polaris = STARS.find((x) => x.hip === 11767)!;
    const [x, y] = makeProjection(s, R, CX, CY)([polaris.ra, polaris.dec])!;
    // Stereographic: r = R·tan(zenith distance / 2)
    const zd = 90 - GREENWICH.lat;
    const expected = R * Math.tan(((zd / 2) * Math.PI) / 180);
    expect(Math.hypot(x - CX, y - CY)).toBeGreaterThan(expected * 0.95);
    expect(Math.hypot(x - CX, y - CY)).toBeLessThan(expected * 1.05);
    expect(Math.abs(x - CX)).toBeLessThan(R * 0.03);
    expect(y).toBeLessThan(CY);
  });

  it('draws the sky as seen from below: east on the left, west on the right', () => {
    // Midsummer at Greenwich: sun low in the north-east at dawn, north-west at dusk.
    const dawn = computeScene(new Date('2024-06-21T04:30:00Z'), GREENWICH.lat, GREENWICH.lon);
    const dusk = computeScene(new Date('2024-06-21T20:00:00Z'), GREENWICH.lat, GREENWICH.lon);
    expect(dawn.sun.az).toBeGreaterThan(30);
    expect(dawn.sun.az).toBeLessThan(90);
    expect(makeProjection(dawn, R, CX, CY)([dawn.sun.ra, dawn.sun.dec])![0]).toBeLessThan(CX);
    expect(makeProjection(dusk, R, CX, CY)([dusk.sun.ra, dusk.sun.dec])![0]).toBeGreaterThan(CX);
  });

  it('shows the south celestial pole region from Sydney', () => {
    const s = computeScene(new Date('2010-05-01T12:00:00Z'), SYDNEY.lat, SYDNEY.lon);
    const sigmaOct = STARS.find((x) => x.hip === 104382)!; // σ Octantis, near the south pole
    expect(aboveHorizon(s, sigmaOct.v)).toBe(true);
    const polaris = STARS.find((x) => x.hip === 11767)!;
    expect(aboveHorizon(s, polaris.v)).toBe(false);
  });

  it('keeps about half the catalogue above the horizon', () => {
    const s = computeScene(new Date('1987-02-24T05:00:00Z'), SYDNEY.lat, SYDNEY.lon);
    const n = STARS.filter((x) => aboveHorizon(s, x.v)).length;
    expect(n / STARS.length).toBeGreaterThan(0.4);
    expect(n / STARS.length).toBeLessThan(0.6);
  });

  it('computes moon phases', () => {
    const full = computeScene(new Date('2024-01-25T17:54:00Z'), 0, 0).moon;
    expect(full.phaseName).toBe('Full Moon');
    expect(full.illumination).toBeGreaterThan(0.99);
    const fresh = computeScene(new Date('2024-01-11T11:57:00Z'), 0, 0).moon;
    expect(fresh.phaseName).toBe('New Moon');
    expect(fresh.illumination).toBeLessThan(0.01);
    expect(phaseName(45)).toBe('Waxing Crescent');
    expect(phaseName(300)).toBe('Waning Crescent');
  });

  it('returns sensible planet data', () => {
    const s = computeScene(new Date('2020-12-21T18:00:00Z'), GREENWICH.lat, GREENWICH.lon);
    // The 2020 great conjunction: Jupiter and Saturn ~0.1° apart.
    const j = s.planets.find((p) => p.name === 'Jupiter')!;
    const sat = s.planets.find((p) => p.name === 'Saturn')!;
    const sep = Math.hypot((j.ra - sat.ra) * Math.cos((j.dec * Math.PI) / 180), j.dec - sat.dec);
    expect(sep).toBeLessThan(0.3);
    expect(j.mag).toBeLessThan(-1.5);
  });

  it('computes local sidereal time in range', () => {
    const s = computeScene(new Date('1999-12-31T23:59:00Z'), 40, -74);
    expect(s.lstHours).toBeGreaterThanOrEqual(0);
    expect(s.lstHours).toBeLessThan(24);
  });

  it('builds a closed ecliptic', () => {
    const e = eclipticLine();
    expect(e[0][0]).toBeCloseTo(e.at(-1)![0], 6);
    expect(Math.max(...e.map((p) => p[1]))).toBeCloseTo(23.44, 1);
  });
});
