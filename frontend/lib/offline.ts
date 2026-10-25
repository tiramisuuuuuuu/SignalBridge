import { API } from "@/lib/api";
import type { Place } from "@/lib/places";

// Offline map areas saved on this device (IndexedDB). Deleted after 30 days.
export interface OfflineArea {
  id: string;
  center: { lat: number; lng: number };
  createdAt: string;
  region: Blob;
  detail: Blob;
  regionBbox: string;
  detailBbox: string;
  bytes: number;
  places: Place[];
  placesRadius: number;
}

const DB = "signalbridge-offline";
const STORE = "areas";
const MAX_AGE_MS = 30 * 864e5;
const REFRESH_MS = 7 * 864e5;
const MOVE_MILES = 10;
const CONSENT = "signalbridge.offline.consent";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function listAreas() { return (await tx("readonly", (s) => s.getAll())) as OfflineArea[]; }
export async function deleteArea(id: string) { await tx("readwrite", (s) => s.delete(id)); }
export async function deleteAllAreas() { await tx("readwrite", (s) => s.clear()); }
export async function cleanupOldAreas() {
  for (const a of await listAreas()) if (Date.now() - Date.parse(a.createdAt) > MAX_AGE_MS) await deleteArea(a.id);
}
export async function latestArea(): Promise<OfflineArea | null> {
  const all = await listAreas();
  return all.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null;
}
export const daysLeft = (a: OfflineArea) => Math.max(0, Math.ceil((MAX_AGE_MS - (Date.now() - Date.parse(a.createdAt))) / 864e5));

// Consent: "yes" = save automatically, "no" = asked recently or turned off, null = ask.
export type Consent = "yes" | "no" | null;
export function getConsent(): Consent {
  try {
    const v = localStorage.getItem(CONSENT);
    if (v === "yes") return "yes";
    if (v === "off") return "no";
    if (v?.startsWith("notnow:") && Date.now() - Number(v.slice(7)) < 3 * 864e5) return "no";
    return null;
  } catch { return null; }
}
export function setConsent(v: "yes" | "notnow" | "off") {
  try { localStorage.setItem(CONSENT, v === "notnow" ? `notnow:${Date.now()}` : v); } catch { /* ignore */ }
}

function miles(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 3958.8, rad = (d: number) => (d * Math.PI) / 180;
  const x = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
export function needsUpdate(area: OfflineArea | null, center: { lat: number; lng: number }) {
  if (!area) return true;
  return miles(area.center, center) > MOVE_MILES || Date.now() - Date.parse(area.createdAt) > REFRESH_MS;
}

export async function downloadArea(center: { lat: number; lng: number }, onProgress: (msg: string) => void): Promise<OfflineArea> {
  const lat = Math.round(center.lat * 100) / 100, lng = Math.round(center.lng * 100) / 100; // never send the exact location
  onProgress("Preparing offline map for your area…");
  const r = await fetch(`${API}/api/offline-map?lat=${lat}&lng=${lng}`, { signal: AbortSignal.timeout(300000) });
  const meta = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(meta.error ?? `HTTP ${r.status}`);

  const total = meta.region.bytes + meta.detail.bytes;
  let got = 0;
  const fetchBlob = async (url: string) => {
    const res = await fetch(`${API}${url}`);
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.length;
      onProgress(`Saving offline map… ${Math.min(99, Math.round((got / total) * 100))}%`);
    }
    return new Blob(chunks as BlobPart[]);
  };
  const region = await fetchBlob(meta.region.url);
  const detail = await fetchBlob(meta.detail.url);

  onProgress("Saving shelters, medical and grocery locations…");
  let places: Place[] = [];
  let placesRadius = 0;
  for (const radius of [50, 25, 10]) {
    try {
      const p = await fetch(`${API}/api/places?lat=${lat}&lng=${lng}&radius=${radius}&limit=300`, { signal: AbortSignal.timeout(100000) });
      if (p.ok) { places = (await p.json()).places ?? []; placesRadius = radius; break; }
    } catch { /* try a smaller radius */ }
  }

  const area: OfflineArea = {
    id: meta.id, center: meta.center, createdAt: new Date().toISOString(),
    region, detail, regionBbox: meta.region.bbox, detailBbox: meta.detail.bbox,
    bytes: region.size + detail.size, places, placesRadius,
  };
  await tx("readwrite", (s) => s.put(area));
  const all = (await listAreas()).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  for (const old of all.slice(2)) await deleteArea(old.id); // keep the newest 2 areas
  try { await navigator.storage?.persist?.(); } catch { /* ignore */ }
  // Load the offline map renderer now, so its code is saved for offline use.
  import("protomaps-leaflet").catch(() => {});
  import("pmtiles").catch(() => {});
  return area;
}
