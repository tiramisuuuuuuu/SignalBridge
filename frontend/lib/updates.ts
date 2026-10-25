/* eslint-disable @typescript-eslint/no-explicit-any */
import type { UserLocation } from "@/types";
import { API } from "@/lib/api";

export type Severity = "high" | "medium" | "low";
export interface UpdateItem {
  id: string;
  category: "disaster" | "earthquake" | "wildfire" | "weather" | "forecast" | "shelter" | "road";
  severity: Severity;
  title: string;
  summary: string;
  where: string;
  lat: number | null;
  lng: number | null;
  distanceMiles: number | null;
  sourceName: string;
  sourceUrl: string;
  updatedAt: string | null;
  expiresAt?: string | null;
  details?: string[];
}
export interface UpdatesData {
  place: { label: string; lat: number; lng: number };
  radiusMiles: number;
  fetchedAt: string;
  updates: UpdateItem[];
  sources: { name: string; ok: boolean; count: number; error?: string }[];
}

const key = (label: string) => `signalbridge.updates:${label.toLowerCase()}`;

export function loadCachedUpdates(label: string): UpdatesData | null {
  try { return JSON.parse(localStorage.getItem(key(label)) ?? "null"); } catch { return null; }
}

export async function loadUpdates(loc: UserLocation): Promise<UpdatesData> {
  const q = loc.lat != null && loc.lng != null
    ? `lat=${loc.lat}&lng=${loc.lng}&place=${encodeURIComponent(loc.label)}`
    : `place=${encodeURIComponent(loc.label)}`;
  const r = await fetch(`${API}/api/updates?${q}`, { signal: AbortSignal.timeout(40000) });
  if (!r.ok) {
    const body: any = await r.json().catch(() => ({}));
    throw new Error(`${r.status} ${body.error ?? ""}`.trim());
  }
  const d = await r.json();
  try { localStorage.setItem(key(loc.label), JSON.stringify(d)); } catch { /* ignore */ }
  return d;
}

export function ago(iso?: string | null) {
  if (!iso) return "";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(m)) return "";
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} hr ago` : `${Math.round(h / 24)} days ago`;
}

export const CATEGORY_META: Record<string, [string, string]> = {
  disaster: ["⚠️", "Disaster"],
  earthquake: ["🌎", "Earthquake"],
  wildfire: ["🔥", "Wildfire"],
  weather: ["🌦️", "Weather"],
  forecast: ["📅", "Forecast"],
  shelter: ["🏠", "Shelter"],
  road: ["🚧", "Road closure"],
};
export const SEV_COLOR: Record<Severity, string> = { high: "var(--high)", medium: "#e0a800", low: "#3fb950" };
