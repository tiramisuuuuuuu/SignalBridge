import express from "express";
import cors from "cors";
import { registerVoice } from "./voice.js";
import { registerLive } from "./live.js";
import { registerUpdates } from "./updates.js";
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
  return result;
}
