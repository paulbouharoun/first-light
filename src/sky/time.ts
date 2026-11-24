import tzlookup from '@photostructure/tz-lookup';

/** IANA time zone for a coordinate, or UTC if the lookup fails (e.g. open ocean edge cases). */
export function zoneFor(lat: number, lon: number): string {
  try {
    return tzlookup(lat, lon);
  } catch {
    return 'UTC';
  }
}

/** Offset (minutes east of UTC) of `zone` at the instant `utcMs`. */
export function offsetMinutes(zone: string, utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
}

/**
 * Convert a wall-clock date + time in `zone` to a UTC Date.
 * `date` is YYYY-MM-DD, `time` is HH:MM. Uses the browser's tz database,
 * so historical DST rules apply.
 */
export function zonedToUtc(date: string, time: string, zone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  // Two passes settle the offset across DST transitions.
  let guess = wall - offsetMinutes(zone, wall) * 60000;
  guess = wall - offsetMinutes(zone, guess) * 60000;
  return new Date(guess);
}

export function formatOffset(mins: number): string {
  const sign = mins < 0 ? '−' : '+';
  const a = Math.abs(mins);
  if (a === 0) return 'UTC';
  const h = Math.floor(a / 60);
  return a % 60 ? `UTC${sign}${h}:${String(a % 60).padStart(2, '0')}` : `UTC${sign}${h}`;
}
