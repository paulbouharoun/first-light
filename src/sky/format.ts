import { formatOffset, offsetMinutes } from './time';

function dms(value: number, pos: string, neg: string): string {
  const hemi = value < 0 ? neg : pos;
  let a = Math.abs(value);
  let d = Math.floor(a);
  let m = Math.floor((a - d) * 60);
  let s = Math.round(((a - d) * 60 - m) * 60);
  if (s === 60) [s, m] = [0, m + 1];
  if (m === 60) [m, d] = [0, d + 1];
  return `${d}°${String(m).padStart(2, '0')}′${String(s).padStart(2, '0')}″${hemi}`;
}

export const formatLat = (lat: number) => dms(lat, 'N', 'S');
export const formatLon = (lon: number) => dms(lon, 'E', 'W');

export function formatHours(h: number): string {
  let hh = Math.floor(h);
  let mm = Math.round((h - hh) * 60);
  if (mm === 60) [mm, hh] = [0, (hh + 1) % 24];
  return `${String(hh).padStart(2, '0')}h${String(mm).padStart(2, '0')}m`;
}

/** "Sunday, 12 August 1990" */
export function formatLongDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(2000, m - 1, d));
  dt.setUTCFullYear(y);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(dt);
}

export function formatUtc(t: Date): string {
  return `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')} UTC`;
}

export function zoneLabel(zone: string, t: Date): string {
  for (const locale of ['en-GB', 'en-US', 'en-AU', 'en-IN']) {
    try {
      const name = new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: 'short' })
        .formatToParts(t)
        .find((p) => p.type === 'timeZoneName')?.value;
      if (name && /^[A-Z]{2,5}$/.test(name) && name !== 'UTC') return name;
    } catch {
      /* try the next locale */
    }
  }
  return formatOffset(offsetMinutes(zone, t.getTime()));
}
