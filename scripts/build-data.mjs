// Compacts the d3-celestial catalogues (BSD-3, © Olaf Frohn) into one small
// JSON file the app ships with. Run with `npm run data`.
import { readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('../node_modules/d3-celestial/data/', import.meta.url);
const read = (f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;
const r3 = (n) => Math.round(n * 1000) / 1000;

// Stars: [ra°, dec°, mag, bv] to magnitude 6
const stars = read('stars.6.json').features.map((f) => [
  r3(f.geometry.coordinates[0]),
  r3(f.geometry.coordinates[1]),
  r2(f.properties.mag),
  r2(parseFloat(f.properties.bv) || 0),
  f.id,
]);

// Proper names for the brightest stars only
const names = read('starnames.json');
const magById = new Map(stars.map((s) => [s[4], s[2]]));
const starNames = {};
for (const [id, v] of Object.entries(names)) {
  const m = magById.get(+id);
  if (v.name && m !== undefined && m < 1.7) starNames[id] = v.name;
}

// Constellation stick figures
const lines = read('constellations.lines.json').features.map((f) => ({
  id: f.id,
  rank: +f.properties.rank,
  lines: f.geometry.coordinates.map((l) => l.map(([a, b]) => [r2(a), r2(b)])),
}));

// Constellation labels (Latin names)
const constellations = read('constellations.json').features.map((f) => ({
  id: f.id,
  name: f.properties.la || f.properties.name,
  rank: +f.properties.rank,
  at: f.geometry.coordinates.map(r1),
}));

// Milky Way: five density levels, decimated to ~0.4° spacing
const mw = read('mw.json').features.map((f) =>
  f.geometry.coordinates.map((poly) =>
    poly.map((ring) => {
      const out = [];
      let last = null;
      for (const [a, b] of ring) {
        if (last && Math.hypot((a - last[0]) * Math.cos((b * Math.PI) / 180), b - last[1]) < 0.4)
          continue;
        last = [a, b];
        out.push([r1(a), r1(b)]);
      }
      if (out.length && (out[0][0] !== out.at(-1)[0] || out[0][1] !== out.at(-1)[1])) out.push(out[0]);
      return out;
    }).filter((ring) => ring.length >= 4),
  ).filter((poly) => poly.length > 0),
);

const data = { stars: stars.map((s) => s.slice(0, 5)), starNames, lines, constellations, mw };
writeFileSync(new URL('../src/data/sky.json', import.meta.url), JSON.stringify(data));
console.log(
  `stars ${stars.length}, names ${Object.keys(starNames).length}, figures ${lines.length}, ` +
    `mw points ${mw.flat(3).length / 2 | 0}`,
);
