/* eslint-disable @typescript-eslint/no-explicit-any */
import type { LiveAlert, UserLocation, ChatMessage, ChatSource } from "@/types";

// Adapter between the SignalBridge API (services/api) and the UI types.
export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const CACHE_KEY = "signalbridge.packet";

export type Packet = any;
export interface Change { type: string; shelterId?: string; oldValue?: unknown; newValue?: unknown; evidence?: string }

async function getJSON(path: string, init?: RequestInit) {
  const r = await fetch(`${API}${path}`, { ...init, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
const post = (path: string, body: unknown) =>
  getJSON(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// ---- Offline cache ----
export function loadCachedPacket(): Packet | null {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null"); } catch { return null; }
}
function saveCachedPacket(p: Packet) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(p)); } catch { /* storage full or disabled */ }
}

// ---- Packet + sync ----
export async function loadPacket(): Promise<Packet> {
  const p = await getJSON("/api/packet");
  saveCachedPacket(p);
  return p;
}
export async function syncPacket(clientVersion?: number): Promise<{ packet: Packet; changes: Change[] }> {
  const r = await post("/api/sync", { clientVersion });
  if (r.packet) saveCachedPacket(r.packet);
  return { packet: r.packet, changes: r.changes ?? [] };
}

// ---- Packet -> UI alerts ----
function miles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 3958.8, rad = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function packetToAlerts(p: Packet | null, loc: UserLocation | null): LiveAlert[] {
  if (!p) return [];
  const src = (id: string) => (p.sources ?? []).find((s: any) => s.id === id);
  const dist = (lat?: number, lng?: number) =>
    loc?.lat != null && loc?.lng != null && lat != null && lng != null ? Math.round(miles(loc.lat, loc.lng, lat, lng)) : 0;
  const conflictFor = (s: any) =>
    (p.conflicts ?? []).find((c: any) => String(c.id).includes(s.id) || String(c.description).includes(s.name));

  const shelters: LiveAlert[] = (p.shelters ?? []).map((s: any) => {
    const c = conflictFor(s);
    const severity = c ? "high" : s.status === "open" ? "low" : s.status === "unknown" ? "medium" : "high";
    const details = [
      s.capacity != null ? `Capacity: ${s.capacity}` : null,
      s.petsAllowed === true ? "Pets allowed" : s.petsAllowed === false ? "No pets" : null,
      s.wheelchairAccessible === true ? "Wheelchair accessible" : null,
      c ? `⚠ Sources disagree: ${c.description}` : null,
    ].filter(Boolean);
    const source = src(s.sourceId);
    return {
      id: s.id, category: "shelter", severity,
      title: `${s.name}: ${String(s.status).toUpperCase()}`,
      description: details.join(" · "),
      latitude: s.latitude, longitude: s.longitude, distanceMiles: dist(s.latitude, s.longitude),
      sourceName: source?.name ?? s.sourceId, sourceUrl: source?.url ?? "",
      updatedAt: s.sourceUpdatedAt ?? s.observedAt,
    };
  });

  const roads: LiveAlert[] = (p.roadClosures ?? []).map((r: any) => {
    const source = src(r.sourceId);
    return {
      id: r.id, category: "road_closure", severity: r.status === "closed" ? "high" : "medium",
      title: r.description, description: `Status: ${r.status}`,
      latitude: 0, longitude: 0, distanceMiles: 0,
      sourceName: source?.name ?? r.sourceId, sourceUrl: source?.url ?? "",
      updatedAt: r.observedAt,
    };
  });

  return [...shelters, ...roads];
}

export function describeChange(c: Change, p: Packet | null): string {
  const name = (p?.shelters ?? []).find((s: any) => s.id === c.shelterId)?.name ?? c.shelterId ?? "";
  if (c.type === "shelter_status") return `${name} changed from ${String(c.oldValue).toUpperCase()} to ${String(c.newValue).toUpperCase()}`;
  if (c.type === "shelter_capacity") return `${name} capacity changed from ${c.oldValue} to ${c.newValue}`;
  return c.evidence ?? `${c.type}: ${String(c.oldValue)} → ${String(c.newValue)}`;
}

// ---- Assistant ----
function fmt(x: any): string {
  if (typeof x === "string") return x;
  return [x?.name ?? x?.shelterName ?? x?.id, x?.reason ?? x?.why ?? x?.note ?? x?.status].filter(Boolean).join(": ");
}
export async function askBackend(question: string, p: Packet | null): Promise<Omit<ChatMessage, "id" | "role">> {
  const r = await post("/api/agents/assist", { text: question });
  const list = (label: string, xs?: any[]) => (xs?.length ? `${label}\n${xs.map((x) => `• ${fmt(x)}`).join("\n")}` : null);
  const text = [
    list("Recommended:", r.recommended),
    list("Check first:", r.checkFirst),
    list("Not a fit:", r.excluded),
    r.notes?.length ? r.notes.join("\n") : null,
  ].filter(Boolean).join("\n\n");
  const sources: ChatSource[] = (p?.sources ?? []).map((s: any) => ({ name: s.name, url: s.url, updatedAt: s.lastSuccessfulFetchAt }));
  return { createdAt: new Date().toISOString(), text: text || "No verified shelters match that yet.", sources, warning: r.disclaimer };
}

// ---- Voice: Cartesia online, browser voice offline ----
export async function speak(text: string) {
  try {
    const r = await fetch(`${API}/api/voice`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }),
    });
    if (!r.ok) throw new Error();
    await new Audio(URL.createObjectURL(await r.blob())).play();
  } catch {
    if (typeof window !== "undefined" && "speechSynthesis" in window) speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }
}
