import type { UserLocation } from "@/types";
const KEY = "signalbridge.location";

// Only a city label + rounded coordinates are saved; never an exact position.
export function loadLocation(): UserLocation | null {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "null"); } catch { return null; }
}
export function saveLocation(loc: UserLocation) {
  localStorage.setItem(KEY, JSON.stringify(loc));
}
export function clearLocation() { localStorage.removeItem(KEY); }
