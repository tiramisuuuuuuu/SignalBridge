/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Express } from "express";
import { UA, geocode, miles, nwsAlerts, femaShelters } from "./live.js";

// Worldwide live updates for a location, merged from official/public sources.
// Every item keeps its source name, original link, timestamp, and a list of key facts.

type Sev = "high" | "medium" | "low";
interface Update {
  id: string;
  category: "disaster" | "earthquake" | "wildfire" | "weather" | "forecast" | "shelter" | "road";
  severity: Sev;
  title: string;
  summary: string;
  details?: string[];
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
const when = (t: any) => {
  const d = new Date(typeof t === "string" ? (utc(t) as string) : t);
  return Number.isNaN(+d) ? "" : `${d.toISOString().replace("T", " ").slice(0, 16)} UTC`;
};
const iso = (t: any) => {
  if (t == null) return null;
  const d = new Date(typeof t === "string" ? (utc(t) as string) : t);
  return Number.isNaN(+d) ? null : d.toISOString();
};
const clean = (xs: (string | null | undefined | false)[]) => xs.filter(Boolean) as string[];

async function getJSON(url: string, timeout = 12000) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(timeout) });
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
  gdacsInflight ??= getJSON(url, 30000)
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
      summary: String(p.description || p.htmldescription || "").replace(/<[^>]+>/g, "").slice(0, 1200),
      details: clean([
        `Type: ${GDACS_TYPE[p.eventtype] ?? p.eventtype}`,
        p.alertlevel && `GDACS alert level: ${p.alertlevel}`,
        p.severitydata?.severitytext,
        p.country && `Country: ${p.country}`,
        p.fromdate && `Started: ${when(p.fromdate)}`,
      ]),
      where: p.country ?? "",
      lat: la, lng: lo, distanceMiles: round(dist),
      sourceName: "GDACS (UN/EU Global Disaster Alert System)",
      sourceUrl: p.url?.report || `https://www.gdacs.org/report.aspx?eventtype=${p.eventtype}&eventid=${p.eventid}`,
      updatedAt: iso(p.datemodified || p.todate || p.fromdate),
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
    const [lo, la, depth] = f.geometry?.coordinates ?? [null, null, null];
    const severity: Sev = p.alert === "red" || p.mag >= 6 ? "high" : p.alert === "orange" || p.alert === "yellow" || p.mag >= 4.5 ? "medium" : "low";
    return {
      id: `usgs-${f.id}`,
      category: "earthquake",
      severity,
      title: p.title ?? `M${p.mag} earthquake`,
      summary: `Magnitude ${p.mag} earthquake ${p.place ? `(${p.place})` : ""}${p.felt ? `, felt by ${p.felt} people` : ""}.`,
      details: clean([
        `Magnitude ${p.mag}${p.magType ? ` (${p.magType})` : ""}`,
        depth != null && `Depth: ${Math.round(depth)} km`,
        p.time && `Time: ${when(p.time)}`,
        p.felt && `${p.felt} people reported feeling it`,
        p.alert && `USGS PAGER impact alert: ${p.alert}`,
        p.tsunami ? "Tsunami information issued: check your local tsunami warning center" : null,
      ]),
      where: p.place ?? "",
      lat: la, lng: lo, distanceMiles: la != null ? round(miles(lat, lng, la, lo)) : null,
      sourceName: "USGS Earthquake Hazards Program",
      sourceUrl: p.url ?? "https://earthquake.usgs.gov",
      updatedAt: iso(p.updated ?? p.time),
    } as Update;
  });
}

// ---- NIFC (US wildfires): size, containment, cause ----
const NIFC = "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Incident_Locations_Current/FeatureServer/0/query";
async function nifc(lat: number, lng: number, radius: number): Promise<Update[]> {
  const params = new URLSearchParams({
    where: "IncidentTypeCategory IN ('WF','CX')", geometry: `${lng},${lat}`, geometryType: "esriGeometryPoint", inSR: "4326",
    spatialRel: "esriSpatialRelIntersects", distance: String(radius), units: "esriSRUnit_StatuteMile",
    outFields: "*", outSR: "4326", orderByFields: "IncidentSize DESC", resultRecordCount: "25", f: "geojson",
  });
  const d = await getJSON(`${NIFC}?${params}`, 15000);
  if (d.error) throw new Error(d.error.message ?? "query error");
  return (d.features ?? []).map((f: any, i: number) => {
    const p = f.properties ?? {};
    const [lo, la] = f.geometry?.coordinates ?? [null, null];
    const acres = p.IncidentSize ?? p.DailyAcres ?? null;
    const pc = p.PercentContained ?? null;
    const state = p.POOState ? String(p.POOState).replace(/^US-/, "") : "";
    const severity: Sev = pc != null && pc >= 90 ? "low" : acres >= 10000 ? "high" : acres >= 1000 ? "medium" : "low";
    return {
      id: `nifc-${p.IrwinID ?? p.OBJECTID ?? i}`,
      category: "wildfire",
      severity,
      title: `${p.IncidentName ?? "Unnamed"} Fire${p.POOCounty ? `, ${p.POOCounty} County` : ""}${state ? `, ${state}` : ""}`,
      summary: clean([
        acres != null && `${Math.round(acres).toLocaleString("en-US")} acres`,
        pc != null ? `${pc}% contained` : "Containment not reported",
      ]).join(" · "),
      details: clean([
        acres != null && `Size: ${Math.round(acres).toLocaleString("en-US")} acres`,
        pc != null ? `Containment: ${pc}%` : "Containment: not reported",
        p.FireCause && `Cause: ${p.FireCause}`,
        p.FireDiscoveryDateTime && `Discovered: ${when(p.FireDiscoveryDateTime)}`,
        p.IncidentShortDescription && `Location: ${p.IncidentShortDescription}`,
      ]),
      where: clean([p.POOCounty && `${p.POOCounty} County`, state]).join(", "),
      lat: la, lng: lo, distanceMiles: la != null ? round(miles(lat, lng, la, lo)) : null,
      sourceName: "NIFC / InciWeb (US interagency wildfire data)",
      sourceUrl: "https://inciweb.wildfire.gov/",
      updatedAt: iso(p.ModifiedOnDateTime_dt ?? p.ModifiedOnDateTime ?? p.FireDiscoveryDateTime),
    } as Update;
  });
}

// ---- NASA EONET: wildfires, severe storms, volcanoes (worldwide) ----
async function eonet(lat: number, lng: number, radius: number): Promise<Update[]> {
  const dLat = radius / 69;
  const dLng = radius / (69 * Math.max(Math.cos((lat * Math.PI) / 180), 0.1));
  const bbox = [lng - dLng, lat + dLat, lng + dLng, lat - dLat].map((n) => n.toFixed(3)).join(",");
  const d = await getJSON(`https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30&bbox=${bbox}`);
  const items: Update[] = (d.events ?? []).map((e: any) => {
    const geo = e.geometry ?? [];
    const g = geo.at(-1);
    const [lo, la] = g?.type === "Point" ? g.coordinates : [null, null];
    const cat = e.categories?.[0]?.title ?? "Natural event";
    const src = e.sources?.[0];
    return {
      id: `eonet-${e.id}`,
      category: /wildfire/i.test(cat) ? "wildfire" : "disaster",
      severity: "medium",
      title: e.title ?? cat,
      summary: `${cat}${g?.magnitudeValue ? ` · ${g.magnitudeValue} ${g.magnitudeUnit ?? ""}` : ""}`,
      details: clean([
        `Type: ${cat}`,
        g?.magnitudeValue && `Size: ${g.magnitudeValue} ${g.magnitudeUnit ?? ""}`,
        g?.date && `Last observed: ${when(g.date)}`,
        geo.length > 1 && `${geo.length} satellite/agency observations`,
      ]),
      where: "",
      lat: la, lng: lo, distanceMiles: la != null ? round(miles(lat, lng, la, lo)) : null,
      sourceName: `NASA EONET${src?.id ? ` (via ${src.id})` : ""}`,
      sourceUrl: src?.url ?? e.link ?? "https://eonet.gsfc.nasa.gov",
      updatedAt: iso(g?.date),
    };
  });
  return items.sort((a, b) => (a.distanceMiles ?? 1e9) - (b.distanceMiles ?? 1e9)).slice(0, 20);
}

// ---- Open-Meteo: current weather + 3-day forecast ----
const WMO: Record<number, string> = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Freezing fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain",
  66: "Freezing rain", 67: "Heavy freezing rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
  80: "Rain showers", 81: "Heavy rain showers", 82: "Violent rain showers", 85: "Snow showers", 86: "Heavy snow showers",
  95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Severe thunderstorm with hail",
};

async function openMeteo(lat: number, lng: number, label: string): Promise<Update[]> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m,precipitation,uv_index` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max,uv_index_max` +
    `&timezone=auto&forecast_days=3`;
  const d = await getJSON(url);
  const now = new Date().toISOString();
  const link = `https://open-meteo.com/en/docs?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}`;
  const base = { where: label, lat, lng, distanceMiles: 0, sourceName: "Open-Meteo forecast data", sourceUrl: link, updatedAt: now };
  const c = d.current ?? {};
  const out: Update[] = [{
    ...base, id: "weather-now", category: "weather", severity: "low",
    title: `Now: ${WMO[c.weather_code] ?? "Weather"}, ${cf(c.temperature_2m)}`,
    summary: `Feels like ${cf(c.apparent_temperature)}. Wind ${Math.round(c.wind_speed_10m)} km/h with gusts to ${Math.round(c.wind_gusts_10m)} km/h.`,
    details: clean([
      `Feels like ${cf(c.apparent_temperature)}`,
      c.relative_humidity_2m != null && `Humidity: ${c.relative_humidity_2m}%`,
      `Wind: ${Math.round(c.wind_speed_10m)} km/h, gusts ${Math.round(c.wind_gusts_10m)} km/h`,
      `Precipitation: ${c.precipitation ?? 0} mm`,
      c.uv_index != null && `UV index: ${Math.round(c.uv_index)}`,
    ]),
  }];
  const dd = d.daily ?? {};
  const days: string[] = [];
  (dd.time ?? []).forEach((date: string, i: number) => {
    const rain = dd.precipitation_sum?.[i] ?? 0, gust = dd.wind_gusts_10m_max?.[i] ?? 0;
    const tmax = dd.temperature_2m_max?.[i], tmin = dd.temperature_2m_min?.[i];
    const chance = dd.precipitation_probability_max?.[i];
    const line = `${date}: ${WMO[dd.weather_code?.[i]] ?? "Weather"}, ${cf(tmin)} to ${cf(tmax)}, rain ${rain} mm${chance != null ? ` (${chance}% chance)` : ""}, gusts ${Math.round(gust)} km/h${dd.uv_index_max?.[i] != null ? `, UV ${Math.round(dd.uv_index_max[i])}` : ""}`;
    days.push(line);
    const flags: [string, Sev][] = [];
    if (rain >= 50) flags.push(["Heavy rain forecast", rain >= 100 ? "high" : "medium"]);
    if (gust >= 62) flags.push(["Strong winds forecast", gust >= 90 ? "high" : "medium"]);
    if (tmax >= 35) flags.push(["Extreme heat forecast", tmax >= 40 ? "high" : "medium"]);
    if (tmin <= -15) flags.push(["Extreme cold forecast", "medium"]);
    for (const [title, severity] of flags) {
      out.push({ ...base, id: `fc-${date}-${title}`, category: "forecast", severity, title: `${title} for ${date}`,
        summary: "Based on forecast data, not an official warning. Check your national weather service for warnings.", details: [line] });
    }
  });
  if (days.length) out.push({ ...base, id: "fc-outlook", category: "forecast", severity: "low", title: "3-day forecast", summary: days[0], details: days });
  return out;
}

// ---- Air quality (important for wildfire smoke) ----
async function airQuality(lat: number, lng: number, label: string): Promise<Update[]> {
  const d = await getJSON(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=us_aqi,pm2_5,pm10&timezone=auto`);
  const c = d.current ?? {};
  const aqi = c.us_aqi;
  if (aqi == null) return [];
  const [cat, severity, note]: [string, Sev, string] =
    aqi <= 50 ? ["Good", "low", "Air quality is satisfactory."]
    : aqi <= 100 ? ["Moderate", "low", "Unusually sensitive people should consider limiting prolonged outdoor exertion."]
    : aqi <= 150 ? ["Unhealthy for sensitive groups", "medium", "Children, older adults, and people with heart or lung disease should limit prolonged outdoor exertion."]
    : aqi <= 200 ? ["Unhealthy", "high", "Everyone may feel health effects. Limit time outdoors."]
    : aqi <= 300 ? ["Very unhealthy", "high", "Health alert: avoid outdoor activity."]
    : ["Hazardous", "high", "Health warning of emergency conditions: stay indoors."];
  return [{
    id: "air-now", category: "weather", severity,
    title: `Air quality: ${cat} (US AQI ${Math.round(aqi)})`,
    summary: note,
    details: clean([
      c.pm2_5 != null && `PM2.5 (fine particles, e.g. smoke): ${c.pm2_5} µg/m³`,
      c.pm10 != null && `PM10: ${c.pm10} µg/m³`,
      "Modeled data, not a ground sensor reading",
    ]),
    where: label, lat, lng, distanceMiles: 0,
    sourceName: "Open-Meteo air quality data",
    sourceUrl: "https://open-meteo.com/en/docs/air-quality-api",
    updatedAt: new Date().toISOString(),
  }];
}

// ---- US-only official sources (reused from /api/live) ----
async function nws(lat: number, lng: number): Promise<Update[]> {
  try {
    const alerts = await nwsAlerts(lat, lng);
    return alerts.map((a: any) => ({
      id: `nws-${a.id}`, category: "weather", severity: a.severity, title: a.title,
      summary: [a.description, a.instruction].filter(Boolean).join("\n\n").slice(0, 1500),
      details: clean([a.event && `Type: ${a.event}`, a.area && `Area: ${a.area}`, a.expiresAt && `Expires: ${when(a.expiresAt)}`]),
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
    details: clean([s.address && `Address: ${s.address}`, s.capacity != null && `Capacity: ${s.capacity}`, s.population != null && `Current population: ${s.population}`]),
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
      ["NIFC (US wildfires)", nifc(place.lat, place.lng, radius)],
      ["NASA EONET", eonet(place.lat, place.lng, radius)],
      ["Open-Meteo", openMeteo(place.lat, place.lng, place.label)],
      ["Air quality", airQuality(place.lat, place.lng, place.label)],
      ["NWS (US)", nws(place.lat, place.lng)],
      ["FEMA (US)", fema(place.lat, place.lng, radius)],
    ];
    const settled = await Promise.allSettled(jobs.map(([, p]) => p));
    const sources = jobs.map(([name], i) => {
      const r = settled[i];
      return r.status === "fulfilled" ? { name, ok: true, count: r.value.length } : { name, ok: false, count: 0, error: String((r.reason as any)?.message ?? r.reason) };
    });
    let updates = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    // NIFC has richer US wildfire data than NASA's copy of the same IRWIN records: drop the duplicates.
    if (sources.find((s) => s.name.startsWith("NIFC"))?.ok) {
      updates = updates.filter((u) => !(u.category === "wildfire" && /IRWIN/.test(u.sourceName)));
    }
    updates.sort((a, b) => RANK[a.severity] - RANK[b.severity] || Date.parse(b.updatedAt ?? "0") - Date.parse(a.updatedAt ?? "0"));

    const data = { place, radiusMiles: radius, fetchedAt: new Date().toISOString(), updates, sources };
    if (sources.every((s) => s.ok)) cache.set(key, { at: Date.now(), data });
    res.json({ ...data, cached: false });
  });
}
