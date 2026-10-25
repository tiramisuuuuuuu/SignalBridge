import { API } from "@/lib/api";

export interface Place {
  id: string; category: string; name: string; lat: number; lng: number; distanceMiles: number;
  address: string; phone?: string | null; openingHours?: string | null; osmUrl: string;
}
export interface PlacesData {
  center: { lat: number; lng: number }; radiusMiles: number; fetchedAt: string;
  places: Place[]; source: string; errors: string[];
}

const key = (lat: number, lng: number) => `signalbridge.places:${lat.toFixed(2)},${lng.toFixed(2)}`;
const LAST = "signalbridge.places:last";

export function loadCachedPlaces(lat: number, lng: number): PlacesData | null {
  try { return JSON.parse(localStorage.getItem(key(lat, lng)) ?? "null"); } catch { return null; }
}
export function loadLastPlaces(): PlacesData | null {
  try { return JSON.parse(localStorage.getItem(LAST) ?? "null"); } catch { return null; }
}
export async function loadPlaces(lat: number, lng: number, radius = 5): Promise<PlacesData> {
  const r = await fetch(`${API}/api/places?lat=${lat}&lng=${lng}&radius=${radius}`, { signal: AbortSignal.timeout(45000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  try {
    localStorage.setItem(key(lat, lng), JSON.stringify(d));
    localStorage.setItem(LAST, JSON.stringify(d));
  } catch { /* ignore */ }
  return d;
}
