import express from "express";
import cors from "cors";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EmergencyPacket } from "@signalbridge/shared";
import { ROOT, collectPacket, diffPackets } from "./collect.js";

const PORT = Number(process.env.PORT ?? 4000);
const DATA_FILE = path.join(ROOT, "services/api/data/packets.json");

let history: EmergencyPacket[] = [];
let syncing: Promise<unknown> | null = null;

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

async function runSync() {
  const { packet, failures } = await collectPacket(latest());
  if (!packet) {
    return { ok: false as const, failures };
  }
  const changes = diffPackets(latest(), packet);
  history.push(packet); // previous packets are kept for history
  await save();
  return { ok: true as const, packet, changes, failures };
}

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true, packets: history.length }));

app.get("/api/packet", (_req, res) => {
  const p = latest();
  if (!p) return res.status(404).json({ error: "No packet yet. Call POST /api/sync." });
  res.json(p);
});

app.post("/api/sync", async (_req, res) => {
  try {
    if (!syncing) syncing = runSync().finally(() => (syncing = null));
    const result: any = await syncing;
    if (!result.ok) {
      // Do not delete old data when a refresh fails.
      return res.status(502).json({
        syncStatus: "failed",
        lastKnownPacket: latest() !== null,
        packet: latest(),
        failures: result.failures,
      });
    }
    res.json({
      accepted: true,
      packet: result.packet,
      changes: result.changes,
      failures: result.failures,
    });
  } catch (err) {
    res.status(500).json({
      syncStatus: "failed",
      lastKnownPacket: latest() !== null,
      packet: latest(),
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

await load();
app.listen(PORT, () => console.log(`SignalBridge API on http://localhost:${PORT}`));
