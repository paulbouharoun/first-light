export type Place = { name: string; full: string; lat: number; lon: number };

type NominatimHit = {
  display_name: string;
  name?: string;
  lat: string;
  lon: string;
  address?: Record<string, string>;
};

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';

/** A short, poster-friendly label: "Greenwich, London" rather than the full address. */
export function shortName(hit: NominatimHit): string {
  const a = hit.address ?? {};
  const primary = hit.name || a.city || a.town || a.village || a.hamlet || hit.display_name.split(',')[0];
  const region = a.city && a.city !== primary ? a.city : a.state || a.county;
  const country = a.country;
  const parts = [primary, region !== primary ? region : undefined, country].filter(Boolean) as string[];
  return [...new Set(parts)].slice(0, 3).join(', ');
}

/**
 * Search OpenStreetMap's Nominatim. Called only on an explicit search
 * (never per keystroke), per the Nominatim usage policy.
 */
export async function geocode(query: string, fetcher: typeof fetch = fetch): Promise<Place[]> {
  const q = query.trim();
  if (!q) return [];
  const url = `${ENDPOINT}?format=jsonv2&addressdetails=1&limit=5&accept-language=en&q=${encodeURIComponent(q)}`;
  const res = await fetcher(url);
  if (!res.ok) throw new Error(`Place search failed (${res.status})`);
  const hits = (await res.json()) as NominatimHit[];
  return hits
    .map((h) => ({ name: shortName(h), full: h.display_name, lat: Number(h.lat), lon: Number(h.lon) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
}

/** Accepts "51.4769, -0.0005" or "51.4769 -0.0005" as a direct coordinate entry. */
export function parseCoords(text: string): { lat: number; lon: number } | null {
  const m = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]),
    lon = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}
