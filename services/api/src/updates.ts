/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Express } from "express";
import { UA, geocode, miles, nwsAlerts, femaShelters } from "./live.js";

// Worldwide live updates for a location, merged from official/public sources.
// Every item keeps its source name, original link and timestamp.

type Sev = "high" | "medium" | "low";
interface Update {
  id: string;
  category: "disaster" | "earthquake" | "wildfire" | "weather" | "forecast" | "shelter" | "road";
  severity: Sev;
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
}

const TTL = 5 * 60_000;
const cache = new Map<string, { at: number; data: any }>();
const round = (n: number | null) => (n == null ? null : Math.round(n));
const utc = (s?: string | null) => (!s ? null : /Z|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
const cf = (c: number) => `${Math.round(c)}°C (${Math.round((c * 9) / 5 + 32)}°F)`;

async function getJSON(url: string) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ---- GDACS (UN/EU): floods, cyclones, quakes, volcanoes, droughts, wildfires ----
const GDACS_TYPE: Record<string, string> = { EQ: "Earthquake", TC: "Tropical cyclone", FL: "Flood", VO: "Volcano", DR: "Drought", WF: "Wildfire" };
const GDACS_SEV: Record<string, Sev> = { Red: "high", Orange: "medium", Green: "low" };

// GDACS is slow and global: fetch once, share across locations, refresh in the background.
let gdacsCache: { at: number; data: any } | null = null;
let gdacsInflight: Promise<any> | null = null;
function fetchGdacs(url: string) {
  gdacsInflight ??= fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(30000) })
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then((data) => { gdacsCache = { at: Date.now(), data }; return data; })
    .finally(() => { gdacsInflight = null; });
  return gdacsInflight;
}
async function gdacsList(url: string) {
  if (gdacsCache) {
    if (Date.now() - gdacsCache.at > 10 * 60_000) fetchGdacs(url).catch(() => {});
    return gdacsCache.data;
  }
  return fetchGdacs(url);
}

async function gdacs(lat: number, lng: number, radius: number): Promise<Update[]> {
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const url = `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=EQ;TC;FL;VO;DR;WF&alertlevel=green;orange;red&fromDate=${day(Date.now() - 14 * 864e5)}&toDate=${day(Date.now())}`;
  const d = await gdacsList(url);
  const seen = new Set<string>();
  const out: Update[] = [];
  for (const f of d.features ?? []) {
    const p = f.properties ?? {};
    const key = `${p.eventtype}-${p.eventid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const [lo, la] = f.geometry?.type === "Point" ? f.geometry.coordinates : [null, null];
    const dist = la != null ? miles(lat, lng, la, lo) : null;
    const severity = GDACS_SEV[p.alertlevel] ?? "low";
    if (dist != null && dist > radius && severity !== "high") continue; // nearby, plus major events anywhere
    out.push({
      id: `gdacs-${key}`,
      category: p.eventtype === "EQ" ? "earthquake" : p.eventtype === "WF" ? "wildfire" : "disaster",
      severity,
      title: p.name || `${GDACS_TYPE[p.eventtype] ?? "Disaster"} in ${p.country ?? "unknown area"}`,
      summary: String(p.description || p.htmldescription || "").replace(/<[^>]+>/g, "").slice(0, 400),
      where: p.country ?? "",
      lat: la, lng: lo, distanceMiles: round(dist),
      sourceName: "GDACS (UN/EU Global Disaster Alert System)",
      sourceUrl: p.url?.report || `https://www.gdacs.org/report.aspx?eventtype=${p.eventtype}&eventid=${p.eventid}`,
      updatedAt: utc(p.datemodified || p.todate || p.fromdate),
    });
  }
  return out;
}

// ---- USGS earthquakes ----
async function usgs(lat: number, lng: number, radius: number): Promise<Update[]> {
  const start = new Date(Date.now() - 7 * 864e5).toISOString();
  const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=${lat}&longitude=${lng}&maxradiuskm=${Math.round(radius * 1.609)}&minmagnitude=3&starttime=${start}&orderby=time&limit=20`;
  const d = await getJSON(url);
  return (d.features ?? []).map((f: any) => {
    const p = f.properties ?? {};
    const [lo, la] = f.geometry?.coordinates ?? [null, null];
    return {
      id: `usgs-${f.id}`,
      category: "earthquake",
      severity: p.mag >= 6 ? "high" : p.mag >= 4.5 ? "medium" : "low",
      title: p.title ?? `M${p.mag} earthquake`,
      summary: `Magnitude ${p.mag} · ${p.place ?? ""}${p.tsunami ? " · Tsunami information issued" : ""}`,
      where: p.place ?? "",
      lat: la, lng: lo, distanceMiles: la != null ? round(miles(lat, lng, la, lo)) : null,
      sourceName: "USGS Earthquake Hazards Program",
      sourceUrl: p.url ?? "https://earthquake.usgs.gov",
      updatedAt: new Date(p.updated ?? p.time).toISOString(),
    } as Update;
  });
}

// ---- NASA EONET: wildfires, severe storms, volcanoes ----
async function eonet(lat: number, lng: number, radius: number): Promise<Update[]> {
  const dLat = radius / 69;
  const dLng = radius / (69 * Math.max(Math.cos((lat * Math.PI) / 180), 0.1));
  const bbox = [lng - dLng, lat + dLat, lng + dLng, lat - dLat].map((n) => n.toFixed(3)).join(",");
  const d = await getJSON(`https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30&bbox=${bbox}`);
  const items: Update[] = (d.events ?? []).map((e: any) => {
    const g = (e.geometry ?? []).at(-1);
    const [lo, la] = g?.type === "Point" ? g.coordinates : [null, null];
    const cat = e.categories?.[0]?.title ?? "Natural event";
    const src = e.sources?.[0];
    return {
      id: `eonet-${e.id}`,
      category: /wildfire/i.test(cat) ? "wildfire" : "disaster",
      severity: "medium",
      title: e.title ?? cat,
      summary: `${cat}${g?.magnitudeValue ? ` · ${g.magnitudeValue} ${g.magnitudeUnit ?? ""}` : ""}`,
      where: "",
      lat: la, lng: lo, distanceMiles: la != null ? round(miles(lat, lng, la, lo)) : null,
      sourceName: `NASA EONET${src?.id ? ` (via ${src.id})` : ""}`,
      sourceUrl: src?.url ?? e.link ?? "https://eonet.gsfc.nasa.gov",
      updatedAt: g?.date ?? null,
    };
  });
  return items.sort((a, b) => (a.distanceMiles ?? 1e9) - (b.distanceMiles ?? 1e9)).slice(0, 20);
}

// ---- Open-Meteo: current weather + 3-day forecast flags ----
const WMO: Record<number, string> = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Freezing fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain",
  66: "Freezing rain", 67: "Heavy freezing rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
  80: "Rain showers", 81: "Heavy rain showers", 82: "Violent rain showers", 85: "Snow showers", 86: "Heavy snow showers",
  95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Severe thunderstorm with hail",
};

async function openMeteo(lat: number, lng: number, label: string): Promise<Update[]> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,wind_speed_10m,precipitation&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max&timezone=auto&forecast_days=3`;
  const d = await getJSON(url);
  const now = new Date().toISOString();
  const link = `https://open-meteo.com/en/docs?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}`;
  const base = { where: label, lat, lng, distanceMiles: 0, sourceName: "Open-Meteo forecast data", sourceUrl: link, updatedAt: now };
  const c = d.current ?? {};
  const out: Update[] = [{
    ...base, id: "weather-now", category: "weather", severity: "low",
    title: `Now: ${WMO[c.weather_code] ?? "Weather"}, ${cf(c.temperature_2m)}`,
    summary: `Wind ${Math.round(c.wind_speed_10m)} km/h · Precipitation ${c.precipitation ?? 0} mm`,
  }];
  const dd = d.daily ?? {};
  (dd.time ?? []).forEach((date: string, i: number) => {
    const rain = dd.precipitation_sum?.[i] ?? 0, gust = dd.wind_gusts_10m_max?.[i] ?? 0;
    const tmax = dd.temperature_2m_max?.[i], tmin = dd.temperature_2m_min?.[i];
    const flags: [string, Sev][] = [];
    if (rain >= 50) flags.push(["Heavy rain forecast", rain >= 100 ? "high" : "medium"]);
    if (gust >= 62) flags.push(["Strong winds forecast", gust >= 90 ? "high" : "medium"]);
    if (tmax >= 35) flags.push(["Extreme heat forecast", tmax >= 40 ? "high" : "medium"]);
    if (tmin <= -15) flags.push(["Extreme cold forecast", "medium"]);
    const detail = `${WMO[dd.weather_code?.[i]] ?? "Weather"} · High ${cf(tmax)} / Low ${cf(tmin)} · Rain ${rain} mm · Gusts ${Math.round(gust)} km/h`;
    for (const [title, severity] of flags) {
      out.push({ ...base, id: `fc-${date}-${title}`, category: "forecast", severity, title: `${title} for ${date}`, summary: `${detail}. Based on forecast data, not an official warning.` });
    }
  });
  const outlook = (dd.time ?? []).map((date: string, i: number) =>
    `${date}: ${WMO[dd.weather_code?.[i]] ?? "?"}, ${Math.round(dd.temperature_2m_min?.[i])}–${Math.round(dd.temperature_2m_max?.[i])}°C`).join(" · ");
  if (outlook) out.push({ ...base, id: "fc-outlook", category: "forecast", severity: "low", title: "3-day forecast", summary: outlook });
  return out;
}

// ---- US-only official sources (reused from /api/live) ----
async function nws(lat: number, lng: number): Promise<Update[]> {
  try {
    const alerts = await nwsAlerts(lat, lng);
    return alerts.map((a: any) => ({
      id: `nws-${a.id}`, category: "weather", severity: a.severity, title: a.title,
      summary: [a.description, a.instruction].filter(Boolean).join(" ").slice(0, 400),
      where: a.area, lat: null, lng: null, distanceMiles: null,
      sourceName: a.sourceName, sourceUrl: a.sourceUrl, updatedAt: a.updatedAt, expiresAt: a.expiresAt,
    }));
  } catch (e: any) {
    if (/40[04]/.test(String(e.message))) return []; // outside the US: not covered
    throw e;
  }
}
async function fema(lat: number, lng: number, radius: number): Promise<Update[]> {
  const shelters = await femaShelters(lat, lng, Math.min(radius, 100));
  return shelters.map((s: any) => ({
    id: s.id, category: "shelter", severity: "low", title: `Open shelter: ${s.name}`,
    summary: [s.address, s.capacity != null ? `Capacity ${s.capacity}` : null].filter(Boolean).join(" · "),
    where: s.address, lat: s.latitude, lng: s.longitude, distanceMiles: round(s.distanceMiles),
    sourceName: s.sourceName, sourceUrl: s.sourceUrl, updatedAt: s.updatedAt,
  }));
}

const RANK: Record<Sev, number> = { high: 0, medium: 1, low: 2 };

export function registerUpdates(app: Express) {
  gdacs(0, 0, 1).catch(() => {}); // warm the GDACS cache at startup
  app.get("/api/updates", async (req, res) => {
    const radius = Math.min(Number(req.query.radius) || 150, 500);
    let place: { label: string; lat: number; lng: number };
    try {
      const lat = Number(req.query.lat), lng = Number(req.query.lng);
      if (req.query.lat && Number.isFinite(lat) && Number.isFinite(lng)) place = { label: String(req.query.place ?? "Your location"), lat, lng };
      else if (req.query.place) place = await geocode(String(req.query.place));
      else return res.status(400).json({ error: "Pass ?place=City or ?lat=..&lng=.." });
    } catch (err) {
      return res.status(404).json({ error: String(err).replace(/^Error: /, "") });
    }

    const key = `${place.lat.toFixed(2)},${place.lng.toFixed(2)},${radius}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) return res.json({ ...hit.data, cached: true });

    const jobs: [string, Promise<Update[]>][] = [
      ["GDACS", gdacs(place.lat, place.lng, radius)],
      ["USGS", usgs(place.lat, place.lng, radius)],
      ["NASA EONET", eonet(place.lat, place.lng, radius)],
      ["Open-Meteo", openMeteo(place.lat, place.lng, place.label)],
      ["NWS (US)", nws(place.lat, place.lng)],
      ["FEMA (US)", fema(place.lat, place.lng, radius)],
    ];
    const settled = await Promise.allSettled(jobs.map(([, p]) => p));
    const sources = jobs.map(([name], i) => {
      const r = settled[i];
      return r.status === "fulfilled" ? { name, ok: true, count: r.value.length } : { name, ok: false, count: 0, error: String((r.reason as any)?.message ?? r.reason) };
    });
    const updates = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []))
      .sort((a, b) => RANK[a.severity] - RANK[b.severity] || Date.parse(b.updatedAt ?? "0") - Date.parse(a.updatedAt ?? "0"));

    const data = { place, radiusMiles: radius, fetchedAt: new Date().toISOString(), updates, sources };
    if (sources.every((s) => s.ok)) cache.set(key, { at: Date.now(), data });
    res.json({ ...data, cached: false });
  });
}
