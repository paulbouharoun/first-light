import { describe, expect, it, vi } from 'vitest';
import { geocode, parseCoords, shortName } from '../src/ui/geocode';
import { DEFAULT_STATE, readState, writeState } from '../src/ui/state';
import { formatLat, formatLon, formatHours, formatLongDate } from '../src/sky/format';

// Synthetic Nominatim payload — no network in tests.
const HITS = [
  {
    display_name: 'Royal Observatory, Blackheath Avenue, Greenwich, London, England, SE10 8XJ, United Kingdom',
    name: 'Royal Observatory',
    lat: '51.4769',
    lon: '-0.0005',
    address: { city: 'London', state: 'England', country: 'United Kingdom' },
  },
  {
    display_name: 'Ouagadougou, Kadiogo, Centre, Burkina Faso',
    name: 'Ouagadougou',
    lat: '12.3681',
    lon: '-1.5271',
    address: { city: 'Ouagadougou', state: 'Centre', country: 'Burkina Faso' },
  },
  { display_name: 'Broken', lat: 'x', lon: 'y' },
];

describe('geocode', () => {
  it('queries Nominatim once and shortens names', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(HITS)));
    const places = await geocode('  royal observatory  ', fetcher as unknown as typeof fetch);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const url = String((fetcher.mock.calls[0] as unknown[])[0]);
    expect(url).toContain('nominatim.openstreetmap.org/search');
    expect(url).toContain('q=royal%20observatory');
    expect(places).toHaveLength(2);
    expect(places[0]).toMatchObject({ name: 'Royal Observatory, London, United Kingdom', lat: 51.4769 });
    expect(places[1].name).toBe('Ouagadougou, Centre, Burkina Faso');
  });

  it('does nothing for an empty query', async () => {
    const fetcher = vi.fn();
    expect(await geocode('   ', fetcher as unknown as typeof fetch)).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('surfaces HTTP failures', async () => {
    const fetcher = vi.fn(async () => new Response('slow down', { status: 429 }));
    await expect(geocode('x', fetcher as unknown as typeof fetch)).rejects.toThrow('429');
  });

  it('builds short names without duplicates', () => {
    expect(shortName({ display_name: 'Paris, France', name: 'Paris', lat: '0', lon: '0', address: { city: 'Paris', state: 'Île-de-France', country: 'France' } })).toBe(
      'Paris, Île-de-France, France',
    );
  });

  it('parses typed coordinates', () => {
    expect(parseCoords('51.48, -0.0')).toEqual({ lat: 51.48, lon: -0 });
    expect(parseCoords('-33.86 151.2')).toEqual({ lat: -33.86, lon: 151.2 });
    expect(parseCoords('91, 0')).toBeNull();
    expect(parseCoords('London')).toBeNull();
  });
});

describe('url state', () => {
  it('round-trips through the hash', () => {
    const s = { ...DEFAULT_STATE, caption: 'Für Zoë & Ana — 1 of 1', theme: 'nocturne', milkyWay: false, mag: 5 };
    expect(readState(writeState(s))).toEqual({ ...s, lat: 51.4769, lon: -0.0005 });
  });

  it('falls back to defaults on garbage', () => {
    expect(readState('#d=nope&t=25:99&lat=200&lon=0&mag=12')).toEqual(DEFAULT_STATE);
  });
});

describe('formatting', () => {
  it('formats coordinates and times', () => {
    expect(formatLat(51.4769)).toBe('51°28′37″N');
    expect(formatLon(-0.0005)).toBe('0°00′02″W');
    expect(formatLat(-33.99999)).toBe('34°00′00″S');
    expect(formatHours(23.9999)).toBe('00h00m');
    expect(formatLongDate('1990-08-12')).toBe('Sunday, 12 August 1990');
    expect(formatLongDate('1066-10-14')).toContain('1066');
  });
});
