import { describe, expect, it } from 'vitest';
import { formatOffset, offsetMinutes, zoneFor, zonedToUtc } from '../src/sky/time';

describe('time zones', () => {
  it('finds zones from coordinates', () => {
    expect(zoneFor(51.5074, -0.1278)).toBe('Europe/London');
    expect(zoneFor(35.6762, 139.6503)).toBe('Asia/Tokyo');
    expect(zoneFor(40.7128, -74.006)).toBe('America/New_York');
    expect(zoneFor(-33.8688, 151.2093)).toBe('Australia/Sydney');
  });

  it('converts wall-clock time to UTC including DST', () => {
    expect(zonedToUtc('2024-07-01', '12:00', 'Europe/London').toISOString()).toBe('2024-07-01T11:00:00.000Z');
    expect(zonedToUtc('2024-01-01', '12:00', 'Europe/London').toISOString()).toBe('2024-01-01T12:00:00.000Z');
    expect(zonedToUtc('2024-01-01', '12:00', 'America/New_York').toISOString()).toBe('2024-01-01T17:00:00.000Z');
    expect(zonedToUtc('1995-03-14', '23:40', 'Asia/Kolkata').toISOString()).toBe('1995-03-14T18:10:00.000Z');
    expect(zonedToUtc('2024-01-15', '03:00', 'Australia/Sydney').toISOString()).toBe('2024-01-14T16:00:00.000Z');
  });

  it('handles the day boundary', () => {
    expect(zonedToUtc('2000-01-01', '00:30', 'Asia/Tokyo').toISOString()).toBe('1999-12-31T15:30:00.000Z');
  });

  it('formats offsets', () => {
    expect(formatOffset(330)).toBe('UTC+5:30');
    expect(formatOffset(-300)).toBe('UTC−5');
    expect(formatOffset(0)).toBe('UTC');
    expect(offsetMinutes('UTC', Date.UTC(2020, 0, 1))).toBe(0);
  });
});

describe('zone labels', async () => {
  const { zoneLabel } = await import('../src/sky/format');
  it('prefers familiar abbreviations, falls back to offsets', () => {
    expect(zoneLabel('Europe/London', new Date('1990-08-12T22:30:00Z'))).toBe('BST');
    expect(zoneLabel('America/New_York', new Date('2020-12-21T17:00:00Z'))).toBe('EST');
    expect(zoneLabel('Asia/Kolkata', new Date('2020-01-01T00:00:00Z'))).toBe('IST');
    expect(zoneLabel('Atlantic/Reykjavik', new Date('2003-12-21T17:45:00Z'))).toBe('GMT');
  });
});
