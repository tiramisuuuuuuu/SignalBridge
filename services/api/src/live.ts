import type { Express } from "express";

// Real official data for any US location:
//   - OpenStreetMap Nominatim: place name -> coordinates
//   - National Weather Service: active alerts for that point
//   - FEMA Open Shelters: shelters open right now within a radius
// Every item keeps its source name, URL and timestamp.

const UA = `SignalBridge/0.1 (hackathon prototype; ${process.env.LIVE_CONTACT || "github.com/tiramisuuuuuuu/SignalBridge"})`;
const TTL = 5 * 60_000;
const FEMA = "https://gis.fema.gov/arcgis/rest/services/NSS/OpenShelters/FeatureServer/0/query";

type Place = { label: string; lat: number; lng: number };
const geoCache = new Map<string, Place>();
const liveCache = new Map<string, { at: number; data: any }>();
let lastGeocode = 0;

async function getJSON(url: string, headers: Record<string, string> = {}) {
  const r = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).host}`);
  return r.json();
}

async function geocode(place: string): Promise<Place> {
  const key = place.trim().toLowerCase();
  const hit = geoCache.get(key);
  if (hit) return hit;
  const wait = 1100 - (Date.now() - lastGeocode); // Nominatim: max 1 request/second
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastGeocode = Date.now();
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(place)}`;
  const [first] = await getJSON(url);
  if (!first) throw new Error(`Could not find "${place}" in the US`);
  const res = { label: String(first.display_name).split(",").slice(0, 3).join(",").trim(), lat: Number(first.lat), lng: Number(first.lon) };
  geoCache.set(key, res);
  return res;
}

function miles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 3958.8, rad = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const SEV: Record<string, string> = { Extreme: "high", Severe: "high", Moderate: "medium" };

async function nwsAlerts(lat: number, lng: number) {
  // NWS rejects coordinates with more than 4 decimals.
  const url = `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lng.toFixed(4)}`;
  const data = await getJSON(url, { Accept: "application/geo+json" });
  return (data.features ?? []).map((f: any) => {
    const p = f.properties ?? {};
    return {
      id: String(p.id ?? f.id),
      event: p.event ?? "Alert",
      title: p.headline ?? p.event ?? "Weather alert",
      description: String(p.description ?? "").slice(0, 600),
      instruction: String(p.instruction ?? "").slice(0, 400),
      severity: SEV[p.severity] ?? "low",
      area: p.areaDesc ?? "",
      sourceName: p.senderName ?? "National Weather Service",
      sourceUrl: p["@id"] ?? f.id ?? "https://www.weather.gov",
      updatedAt: p.sent ?? p.effective ?? null,
      expiresAt: p.expires ?? p.ends ?? null,
    };
  });
}

function pick(p: any, ...keys: string[]) {
  for (const k of keys) if (p[k] != null && p[k] !== "") return p[k];
  return null;
}

async function femaShelters(lat: number, lng: number, radius: number) {
  const params = new URLSearchParams({
    where: "1=1", geometry: `${lng},${lat}`, geometryType: "esriGeometryPoint", inSR: "4326",
    spatialRel: "esriSpatialRelIntersects", distance: String(radius), units: "esriSRUnit_StatuteMile",
    outFields: "*", outSR: "4326", f: "geojson",
  });
  const data = await getJSON(`${FEMA}?${params}`);
  return (data.features ?? []).map((f: any, i: number) => {
    const p = f.properties ?? {};
    const [lo, la] = f.geometry?.coordinates ?? [null, null];
    const updated = pick(p, "LAST_UPDATE", "UPDATE_DATE", "EditDate", "last_edited_date");
    return {
      id: `fema-${pick(p, "SHELTER_ID", "OBJECTID") ?? i}`,
      name: pick(p, "SHELTER_NAME") ?? "Unnamed shelter",
      address: [pick(p, "ADDRESS", "ADDRESS_1"), pick(p, "CITY"), pick(p, "STATE")].filter(Boolean).join(", "),
      latitude: la, longitude: lo,
      distanceMiles: la != null ? Math.round(miles(lat, lng, la, lo) * 10) / 10 : null,
      status: String(pick(p, "SHELTER_STATUS_CODE", "SHELTER_STATUS") ?? "open").toLowerCase(),
      capacity: pick(p, "EVACUATION_CAPACITY", "TOTAL_CAPACITY"),
      population: pick(p, "TOTAL_POPULATION"),
      sourceName: "FEMA Open Shelters",
      sourceUrl: "https://gis.fema.gov/arcgis/rest/services/NSS/OpenShelters/FeatureServer/0",
      updatedAt: typeof updated === "number" ? new Date(updated).toISOString() : updated,
    };
  });
}

export function registerLive(app: Express) {
  app.get("/api/live", async (req, res) => {
    const radius = Math.min(Number(req.query.radius) || 50, 200);
    let place: Place;
    try {
      const lat = Number(req.query.lat), lng = Number(req.query.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng) && req.query.lat) {
        place = { label: String(req.query.place ?? "Your area"), lat, lng };
      } else if (req.query.place) {
        place = await geocode(String(req.query.place));
      } else {
        return res.status(400).json({ error: "Pass ?place=City or ?lat=..&lng=.." });
      }
    } catch (err) {
      return res.status(404).json({ error: String(err).replace(/^Error: /, "") });
    }

    const key = `${place.lat.toFixed(2)},${place.lng.toFixed(2)},${radius}`;
    const cached = liveCache.get(key);
    if (cached && Date.now() - cached.at < TTL) return res.json({ ...cached.data, cached: true });

    const errors: string[] = [];
    const [alerts, shelters] = await Promise.all([
      nwsAlerts(place.lat, place.lng).catch((e) => { errors.push(`National Weather Service: ${e.message}`); return []; }),
      femaShelters(place.lat, place.lng, radius).catch((e) => { errors.push(`FEMA Open Shelters: ${e.message}`); return []; }),
    ]);
    shelters.sort((a: any, b: any) => (a.distanceMiles ?? 1e9) - (b.distanceMiles ?? 1e9));

    const data = { place, radiusMiles: radius, fetchedAt: new Date().toISOString(), alerts, shelters, errors };
    if (!errors.length) liveCache.set(key, { at: Date.now(), data });
    res.json({ ...data, cached: false });
  });
}
