import express from "express";
import cors from "cors";
import { registerDemo } from "./demo.js";
import { execFile } from "node:child_process";
import { registerEvents, broadcast } from "./events.js";
import { registerVoice } from "./voice.js";
import { registerLive, miles } from "./live.js";
import { registerUpdates, setExtraUpdates } from "./updates.js";
import { registerPlaces } from "./places.js";
import { registerChat } from "./chat.js";
import { registerOffline } from "./offline.js";
import { pushToSpacetime } from "./stdb.js";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getFreshness, ageMinutes, type EmergencyPacket } from "@signalbridge/shared";
import { ROOT, collectPacket, diffPackets } from "./collect.js";
import { checkSources } from "./agents/sourceMonitor.js";
import { verifyPacket } from "./agents/verification.js";
import { parseRequest, recommend } from "./agents/residentAssistant.js";

const PORT = Number(process.env.PORT ?? 4000);
const DATA_FILE = path.join(ROOT, "services/api/data/packets.json");

let history: EmergencyPacket[] = [];
let syncing: Promise<unknown> | null = null;
let lastAttemptAt: string | null = null;
let lastSyncFailed = false;
let lastFailures: unknown[] = [];

async function load() {
  try {
    history = JSON.parse(await readFile(DATA_FILE, "utf8"));
  } catch {
    history = [];
  }
}
async function save() {
  await mkdir(path.dirname(DATA_FILE), { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(history, null, 2));
}
const latest = () => history[history.length - 1] ?? null;

// Adds freshness info. Never deletes old data.
// ?asOfMinutes=45 simulates time passing (demo only).
function present(p: EmergencyPacket, asOfMinutes = 0) {
  const now = new Date(Date.now() + asOfMinutes * 60000);
  const shelters = p.shelters.map((s) => ({
    id: s.id,
    freshness: getFreshness(s.observedAt, s.staleAfterMinutes, now),
    ageMinutes: Math.round(ageMinutes(s.observedAt, now)),
    sourceAgeMinutes: s.sourceUpdatedAt ? Math.round(ageMinutes(s.sourceUpdatedAt, now)) : null,
  }));
  const roads = p.roadClosures.map((r) => ({
    id: r.id,
    freshness: getFreshness(r.observedAt, 30, now),
    ageMinutes: Math.round(ageMinutes(r.observedAt, now)),
  }));
  const anyStale = [...shelters, ...roads].some((x) => x.freshness === "stale");

  let syncStatus: EmergencyPacket["syncStatus"] = anyStale ? "stale" : "fresh";
  if (lastSyncFailed) syncStatus = "failed";

  return {
    ...p,
    syncStatus,
    lastSyncAttemptAt: lastAttemptAt ?? p.lastSyncAttemptAt,
    lastKnownPacket: lastSyncFailed,
    freshness: { shelters, roadClosures: roads },
    failures: lastSyncFailed ? lastFailures : [],
  };
}

async function runSyncCore() {
  lastAttemptAt = new Date().toISOString();
  const { packet, failures } = await collectPacket(latest());
  if (!packet) {
    lastSyncFailed = true;
    lastFailures = failures;
    return { ok: false as const, failures };
  }
  lastSyncFailed = false;
  lastFailures = failures;
  const changes = diffPackets(latest(), packet);
  history.push(packet); // previous packets are kept for history
  await save();
  return { ok: true as const, packet, changes, failures };
}

const app = express();
app.use(cors());
app.use(express.json());
registerEvents(app);
registerVoice(app);
registerLive(app);
registerUpdates(app);
registerPlaces(app);
registerChat(app);
registerOffline(app);

app.get("/api/health", (_req, res) => res.json({ ok: true, packets: history.length }));

app.get("/api/packet", (req, res) => {
  const p = latest();
  if (!p) return res.status(404).json({ error: "No packet yet. Call POST /api/sync." });
  const asOf = Number(req.query.asOfMinutes ?? 0) || 0;
  res.json(present(p, asOf));
});

app.post("/api/sync", async (req, res) => {
  try {
    if (!syncing) syncing = runSync().finally(() => (syncing = null));
    const result: any = await syncing;
    if (!result.ok) {
      const p = latest();
      // Do not delete old data when a refresh fails.
      return res.status(502).json({
        syncStatus: "failed",
        lastKnownPacket: p !== null,
        packet: p ? present(p) : null,
        failures: result.failures,
      });
    }
    // The client sends the version it holds offline. Return everything
    // that changed since that version, not just since the last sync.
    const cv = Number(req.body?.clientVersion);
    const base = Number.isFinite(cv) ? history.find((h) => h.version === cv) : undefined;
    const changes = base ? diffPackets(base, result.packet) : result.changes;
    res.json({
      accepted: true,
      previousVersion: base ? base.version : (history.length > 1 ? history[history.length - 2].version : null),
      newVersion: result.packet.version,
      packet: present(result.packet),
      changes,
      failures: result.failures,
    });
  } catch (err) {
    lastSyncFailed = true;
    const p = latest();
    res.status(500).json({
      syncStatus: "failed",
      lastKnownPacket: p !== null,
      packet: p ? present(p) : null,
      error: String(err),
    });
  }
});

app.get("/api/changes", (_req, res) => {
  if (history.length < 2) return res.json({ changes: [] });
  const newP = history[history.length - 1];
  const oldP = history[history.length - 2];
  res.json({ fromVersion: oldP.version, toVersion: newP.version, changes: diffPackets(oldP, newP) });
});

app.get("/api/evidence/:id", async (req, res) => {
  const id = req.params.id;
  if (!/^[\w-]+$/.test(id)) return res.status(400).json({ error: "Bad id" });
  for (const actor of ["shelter-monitor", "road-monitor"]) {
    const base = path.join(ROOT, "actors", actor, "storage/key_value_stores/default", id);
    if (existsSync(`${base}.html`)) {
      res.type("text/plain"); // plain text so saved HTML never runs in the browser
      return res.send(await readFile(`${base}.html`, "utf8"));
    }
    if (existsSync(`${base}.png`)) return res.type("image/png").sendFile(`${base}.png`);
  }
  res.status(404).json({ error: "No evidence with that id" });
});

app.get("/api/packets", (_req, res) => {
  res.json(history.map((p) => ({ version: p.version, downloadedAt: p.downloadedAt })));
});

app.get("/api/packets/:version", (req, res) => {
  const p = history.find((h) => h.version === Number(req.params.version));
  if (!p) return res.status(404).json({ error: "No such version" });
  res.json(p);
});

app.get("/api/agents/source-check", (_req, res) => {
  const p = latest();
  if (!p) return res.status(404).json({ error: "No packet yet. Call POST /api/sync." });
  res.json({ packetVersion: p.version, issues: checkSources(p, lastFailures as any) });
});

app.get("/api/agents/verify", (_req, res) => {
  const p = latest();
  if (!p) return res.status(404).json({ error: "No packet yet. Call POST /api/sync." });
  res.json({ packetVersion: p.version, verdicts: verifyPacket(p) });
});

app.post("/api/agents/assist", (req, res) => {
  const p = latest();
  if (!p) return res.status(404).json({ error: "No packet yet. Call POST /api/sync." });
  const text = String(req.body?.text ?? "").slice(0, 500).trim();
  if (!text) return res.status(400).json({ error: "Send { \"text\": \"...\" }" });
  res.json({ request: text, ...recommend(p, parseRequest(text)) });
});

try { process.loadEnvFile(path.join(ROOT, ".env")); } catch {}
await load();
app.listen(PORT, () => {
  console.log(`SignalBridge API on http://localhost:${PORT}`);
  // Fresh start: build the first packet so GET /api/packet is never empty.
  setTimeout(() => {
    console.log("Running startup sync...");
    if (!syncing) syncing = runSync().finally(() => (syncing = null));
    syncing
      .then((r: any) => console.log(r?.ok ? "Initial sync done" : "Initial sync failed"))
      .catch((e: any) => console.log("Initial sync error:", e));
  }, 1500);
});

// Wraps the real sync so every successful sync also updates SpacetimeDB.
async function runSync() {
  const result: any = await runSyncCore();
  if (result?.ok) void pushToSpacetime(result.packet, result.changes ?? []);
  if (result?.ok && result.changes?.length) broadcast({ type: "changes", version: result.packet?.version, changes: result.changes });
  return result;
}

// Demo: keep checking the source pages so changes appear within seconds.
setInterval(() => { if (!syncing) syncing = runSync().finally(() => (syncing = null)); }, Number(process.env.SYNC_INTERVAL_MS) || 15000);

// Demo control: the fake county admin page flips Marina's status, then we check right away.
app.post("/api/demo/marina", (req, res) => {
  const status = req.body?.status === "full" ? "full" : "open";
  const script = path.join(ROOT, "demo-sites", status === "full" ? "set-full.sh" : "set-open.sh");
  execFile("bash", [script], { cwd: ROOT }, (err) => {
    if (err) return res.status(500).json({ error: String(err) });
    res.json({ ok: true, status });
    if (!syncing) syncing = runSync().finally(() => (syncing = null));
  });
});

// Demo scenario in Live updates: road closures (and when they clear), shelters only when full or closed.
const DEMO_ROADS: Record<string, { lat: number; lng: number; near: string }> = { "highway-12": { lat: 38.29, lng: -122.46, near: "Sonoma" } };
const roadSeen = new Map<string, any>(); // last known closed roads
const roadCleared = new Map<string, { at: number; road: any }>();
setExtraUpdates((lat, lng) => {
  const p: any = latest();
  if (!p) return [];
  const src = (id: string) => (p.sources ?? []).find((s: any) => s.id === id);
  const roadName = (r: any) => String(r.description ?? r.id).split(/\s+(?:closed|open|reopened)\b/i)[0] || r.id;
  const out: any[] = [];

  const closedNow = (p.roadClosures ?? []).filter((r: any) => String(r.status).toLowerCase() === "closed");
  const closedIds = new Set(closedNow.map((r: any) => r.id));
  for (const [id, r] of roadSeen) if (!closedIds.has(id)) { roadCleared.set(id, { at: Date.now(), road: r }); roadSeen.delete(id); }
  for (const r of closedNow) { roadSeen.set(r.id, r); roadCleared.delete(r.id); }

  const roadBase = (r: any) => {
    const geo = DEMO_ROADS[r.id];
    const s = src(r.sourceId);
    return {
      category: "road", where: geo?.near ?? "",
      lat: geo?.lat ?? null, lng: geo?.lng ?? null,
      distanceMiles: geo ? Math.round(miles(lat, lng, geo.lat, geo.lng)) : null,
      sourceName: `${s?.name ?? "Transportation Alerts"} (demo)`, sourceUrl: s?.url ?? "",
    };
  };
  for (const r of closedNow) {
    const near = DEMO_ROADS[r.id]?.near;
    out.push({ ...roadBase(r), id: `demo-road-${r.id}`, severity: "high",
      title: `Full closure on ${roadName(r)}${near ? ` near ${near}` : ""}`,
      summary: r.description ?? "Road closed", details: ["Status: closed", r.description].filter(Boolean),
      updatedAt: r.observedAt ?? new Date().toISOString() });
  }
  for (const [id, c] of roadCleared) {
    if (Date.now() - c.at > 30 * 60_000) { roadCleared.delete(id); continue; }
    const near = DEMO_ROADS[id]?.near;
    out.push({ ...roadBase(c.road), id: `demo-road-cleared-${id}`, severity: "low",
      title: `Closure cleared: ${roadName(c.road)}${near ? ` near ${near}` : ""}`,
      summary: "The road has reopened. Drive with caution and follow local instructions.", details: ["Status: open"],
      updatedAt: new Date(c.at).toISOString() });
  }

  const open = (p.shelters ?? []).filter((s: any) => s.status === "open");
  for (const sh of p.shelters ?? []) {
    if (sh.status !== "full" && sh.status !== "closed") continue;
    const alts = open.map((o: any) => `${o.name} (open${o.capacity != null ? `, ${o.capacity} beds` : ""})`).join(", ");
    const s = src(sh.sourceId);
    out.push({ id: `demo-shelter-${sh.id}`, category: "shelter", severity: "high",
      title: `${sh.name} is ${String(sh.status).toUpperCase()}`,
      summary: alts ? `No beds available. Nearby option: ${alts}.` : "No beds available.",
      details: [`Status: ${sh.status}`, alts ? `Alternatives: ${alts}` : null].filter(Boolean),
      where: "", lat: sh.latitude, lng: sh.longitude,
      distanceMiles: sh.latitude != null ? Math.round(miles(lat, lng, sh.latitude, sh.longitude)) : null,
      sourceName: `${s?.name ?? "Shelter Status"} (demo)`, sourceUrl: s?.url ?? "",
      updatedAt: sh.sourceUpdatedAt ?? sh.observedAt });
  }
  return out;
});

registerDemo(app, ROOT, () => { if (!syncing) syncing = runSync().finally(() => (syncing = null)); });
