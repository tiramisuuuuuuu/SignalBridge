/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Express } from "express";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readdir, rename, stat, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { UA, inCalifornia } from "./live.js";

// Offline map areas cut from the Protomaps OpenStreetMap basemap (ODbL, OSM attribution required).
// PROTOTYPE NOTE: this reads directly from Protomaps' daily builds. For production, copy the
// basemap to your own storage and set PMTILES_SOURCE to that URL (hotlinking builds is discouraged).

const run = promisify(execFile);
const DIR = path.join(os.tmpdir(), "signalbridge-offline");
let build: { url: string; at: number } | null = null;
const jobs = new Map<string, Promise<unknown>>();

async function sourceUrl() {
  if (process.env.PMTILES_SOURCE) return process.env.PMTILES_SOURCE;
  if (build && Date.now() - build.at < 6 * 3600_000) return build.url;
  for (let i = 0; i < 10; i++) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10).replace(/-/g, "");
    const url = `https://build.protomaps.com/${d}.pmtiles`;
    try {
      const r = await fetch(url, { method: "HEAD", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
      if (r.ok) { build = { url, at: Date.now() }; return url; }
    } catch { /* try the previous day */ }
  }
  throw new Error("No recent Protomaps build found");
}

function bbox(lat: number, lng: number, mi: number) {
  const dLat = mi / 69, dLng = mi / (69 * Math.max(Math.cos((lat * Math.PI) / 180), 0.1));
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat].map((n) => n.toFixed(4)).join(",");
}

async function cleanup() {
  if (!existsSync(DIR)) return;
  for (const f of await readdir(DIR)) {
    const p = path.join(DIR, f);
    const s = await stat(p).catch(() => null);
    if (s && Date.now() - s.mtimeMs > 24 * 3600_000) await unlink(p).catch(() => {});
  }
}

async function extract(src: string, out: string, box: string, maxzoom: number) {
  if (existsSync(out)) return;
  const tmp = out.replace(/\.pmtiles$/, ".part.pmtiles");
  await run("pmtiles", ["extract", src, tmp, `--bbox=${box}`, `--maxzoom=${maxzoom}`], { timeout: 240000 });
  await rename(tmp, out);
}

export function registerOffline(app: Express) {
  app.get("/api/offline-map", async (req, res) => {
    const lat = Number(req.query.lat), lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: "Pass ?lat=..&lng=.." });
    if (!inCalifornia(lat, lng)) return res.status(422).json({ error: "SignalBridge covers California only for now.", outsideCalifornia: true });
    const la = Math.round(lat * 10) / 10, lo = Math.round(lng * 10) / 10; // ~7 mile grid: shared cache + privacy
    const id = `${la}_${lo}`;
    const region = { file: path.join(DIR, `${id}-region.pmtiles`), box: bbox(la, lo, 55), maxzoom: 12 };
    const detail = { file: path.join(DIR, `${id}-detail.pmtiles`), box: bbox(la, lo, 8), maxzoom: 15 };
    try {
      await mkdir(DIR, { recursive: true });
      cleanup().catch(() => {});
      const src = await sourceUrl();
      if (!jobs.has(id)) {
        jobs.set(id, Promise.all([
          extract(src, region.file, region.box, region.maxzoom),
          extract(src, detail.file, detail.box, detail.maxzoom),
        ]).finally(() => jobs.delete(id)));
      }
      await jobs.get(id);
      const [rs, ds] = await Promise.all([stat(region.file), stat(detail.file)]);
      res.json({
        id, center: { lat: la, lng: lo }, createdAt: new Date().toISOString(), source: src,
        region: { url: `/api/offline-map/file/${id}-region.pmtiles`, bytes: rs.size, radiusMiles: 55, maxzoom: region.maxzoom, bbox: region.box },
        detail: { url: `/api/offline-map/file/${id}-detail.pmtiles`, bytes: ds.size, radiusMiles: 8, maxzoom: detail.maxzoom, bbox: detail.box },
        attribution: "© OpenStreetMap contributors · Protomaps",
      });
    } catch (e: any) {
      const msg = e?.code === "ENOENT" ? "the pmtiles tool isn't installed on the server (brew install pmtiles)" : String(e?.message ?? e);
      res.status(502).json({ error: `Offline map unavailable: ${msg}` });
    }
  });

  app.get("/api/offline-map/file/:name", (req, res) => {
    const name = String(req.params.name);
    if (!/^-?\d+(\.\d+)?_-?\d+(\.\d+)?-(region|detail)\.pmtiles$/.test(name)) return res.status(400).end();
    const p = path.join(DIR, name);
    if (!existsSync(p)) return res.status(404).end();
    res.type("application/octet-stream").sendFile(p);
  });
}
