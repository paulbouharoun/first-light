export type State = {
  date: string; // YYYY-MM-DD, local to the place
  time: string; // HH:MM, local to the place
  lat: number;
  lon: number;
  place: string;
  caption: string;
  theme: string;
  constellations: boolean;
  labels: boolean;
  milkyWay: boolean;
  grid: boolean;
  mag: number;
};

/** Synthetic default: the Perseids peak over the Royal Observatory, Greenwich. */
export const DEFAULT_STATE: State = {
  date: '1990-08-12',
  time: '23:30',
  lat: 51.4769,
  lon: -0.0005,
  place: 'Royal Observatory, Greenwich',
  caption: 'The sky the moment you arrived',
  theme: 'observatory',
  constellations: true,
  labels: true,
  milkyWay: true,
  grid: true,
  mag: 5.8,
};

const FLAGS: [keyof State, string][] = [
  ['constellations', 'c'],
  ['labels', 'l'],
  ['milkyWay', 'm'],
  ['grid', 'g'],
];

/** Poster state lives in the URL hash so a poster can be shared or bookmarked. */
export function readState(hash: string): State {
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  const s: State = { ...DEFAULT_STATE };
  const d = q.get('d');
  if (d && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(d)) s.date = d;
  const t = q.get('t');
  if (t && /^([01]\d|2[0-3]):[0-5]\d$/.test(t)) s.time = t;
  const lat = Number(q.get('lat')),
    lon = Number(q.get('lon'));
  if (q.has('lat') && q.has('lon') && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    s.lat = lat;
    s.lon = lon;
    s.place = q.get('p') ?? '';
  }
  if (q.has('c')) s.caption = q.get('c')!.slice(0, 60);
  if (q.has('th')) s.theme = q.get('th')!;
  const o = q.get('o');
  if (o !== null) for (const [k, f] of FLAGS) (s[k] as boolean) = o.includes(f);
  const m = Number(q.get('mag'));
  if (q.has('mag') && m >= 3.5 && m <= 6) s.mag = m;
  return s;
}

export function writeState(s: State): string {
  const q = new URLSearchParams({
    d: s.date,
    t: s.time,
    lat: s.lat.toFixed(4),
    lon: s.lon.toFixed(4),
    p: s.place,
    c: s.caption,
    th: s.theme,
    o: FLAGS.filter(([k]) => s[k]).map(([, f]) => f).join(''),
    mag: s.mag.toFixed(1),
  });
  return `#${q.toString()}`;
}
