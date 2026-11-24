import { hashString, type PosterSpec } from './render/poster';
import { themeById } from './render/themes';
import { formatHours, formatLat, formatLon, formatLongDate, formatUtc, zoneLabel } from './sky/format';
import { computeScene } from './sky/scene';
import { zoneFor, zonedToUtc } from './sky/time';
import type { State } from './ui/state';

/** Everything the renderer needs, derived from the form state. */
export function buildSpecFromState(s: State): PosterSpec {
  const zone = zoneFor(s.lat, s.lon);
  const utc = zonedToUtc(s.date, s.time, zone);
  const scene = computeScene(utc, s.lat, s.lon);
  return {
    scene,
    theme: themeById(s.theme),
    caption: s.caption,
    dateLine: `${formatLongDate(s.date)}  ·  ${s.time} ${zoneLabel(zone, utc)}`,
    place: s.place,
    coordsLine: `${formatLat(s.lat)}   ${formatLon(s.lon)}   ·   ${formatUtc(utc)}   ·   LST ${formatHours(scene.lstHours)}`,
    options: { constellations: s.constellations, labels: s.labels, milkyWay: s.milkyWay, grid: s.grid, magLimit: s.mag },
    seed: hashString(`${s.date}${s.time}${s.lat.toFixed(3)}${s.lon.toFixed(3)}`),
  };
}
