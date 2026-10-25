/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Express } from "express";
import { UA, miles, inCalifornia } from "./live.js";

// Essentials near a point, worldwide, from OpenStreetMap (Overpass API):
// medical, pharmacies, grocery/supplies, shelters/assembly points, fire/police.

const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const TTL = 30 * 60_000;
const PER_CATEGORY = 60;
const cache = new Map<string, { at: number; data: any }>();

const FILTERS = [
  '["amenity"~"^(hospital|clinic|doctors)$"]',
  '["amenity"="pharmacy"]',
  '["shop"~"^(supermarket|convenience|grocery|greengrocer)$"]',
  '["social_facility"="shelter"]',
  '["emergency"="assembly_point"]',
  '["amenity"~"^(fire_station|police)$"]',
];
const LABEL: Record<string, string> = {
  medical: "Medical facility", pharmacy: "Pharmacy", grocery: "Grocery store",
  shelter: "Shelter / assembly point", fire_police: "Fire / police station",
};

function categorize(t: any): string | null {
  if (/^(hospital|clinic|doctors)$/.test(t.amenity ?? "")) return "medical";
  if (t.amenity === "pharmacy") return "pharmacy";
  if (/^(supermarket|convenience|grocery|greengrocer)$/.test(t.shop ?? "")) return "grocery";
  if (t.social_facility === "shelter" || t.emergency === "assembly_point") return "shelter";
  if (/^(fire_station|police)$/.test(t.amenity ?? "")) return "fire_police";
  return null;
}

async function overpass(query: string) {
  let last: unknown;
  for (const url of ENDPOINTS) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(95000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).host}`);
      return await r.json();
    } catch (e) { last = e; }
  }
  throw last;
}

export function registerPlaces(app: Express) {
  app.get("/api/places", async (req, res) => {
    const lat = Number(req.query.lat), lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: "Pass ?lat=..&lng=.." });
    if (!inCalifornia(lat, lng)) return res.status(422).json({ error: "SignalBridge covers California only for now.", outsideCalifornia: true });
    const radius = Math.min(Math.max(Number(req.query.radius) || 5, 1), 50);
    const perCat = Math.min(Math.max(Number(req.query.limit) || PER_CATEGORY, 10), 300);
    const la = Math.round(lat * 100) / 100, lo = Math.round(lng * 100) / 100; // ~1 km, privacy
    const key = `${la},${lo},${radius},${perCat}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) return res.json({ ...hit.data, cached: true });

    const m = Math.round(radius * 1609);
    const parts = FILTERS.flatMap((f) => [`node${f}(around:${m},${la},${lo});`, `way${f}(around:${m},${la},${lo});`]).join("");
    const query = `[out:json][timeout:${radius > 20 ? 90 : 30}];(${parts});out center tags 3000;`;
    try {
      const d = await overpass(query);
      const byCat: Record<string, any[]> = {};
      for (const e of d.elements ?? []) {
        const t = e.tags ?? {};
        const cat = categorize(t);
        if (!cat) continue;
        const plat = e.lat ?? e.center?.lat, plng = e.lon ?? e.center?.lon;
        if (plat == null || plng == null) continue;
        const address = [[t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" "), t["addr:city"]].filter(Boolean).join(", ");
        (byCat[cat] ??= []).push({
          id: `osm-${e.type}-${e.id}`, category: cat, name: t.name ?? t.brand ?? LABEL[cat],
          lat: plat, lng: plng, distanceMiles: Math.round(miles(la, lo, plat, plng) * 10) / 10,
          address, phone: t.phone ?? t["contact:phone"] ?? null, openingHours: t.opening_hours ?? null,
          osmUrl: `https://www.openstreetmap.org/${e.type}/${e.id}`,
        });
      }
      const places = Object.values(byCat).flatMap((list) => list.sort((a, b) => a.distanceMiles - b.distanceMiles).slice(0, perCat));
      const data = { center: { lat: la, lng: lo }, radiusMiles: radius, fetchedAt: new Date().toISOString(), places, source: "OpenStreetMap contributors (Overpass API)", errors: [] };
      cache.set(key, { at: Date.now(), data });
      res.json({ ...data, cached: false });
    } catch (e: any) {
      res.status(502).json({ error: `Places lookup failed: ${e?.message ?? e}` });
    }
  });
}
