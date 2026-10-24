import { spawn } from "node:child_process";
import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EmergencyPacket } from "@signalbridge/shared";

export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

// Static demo config. The source pages do not publish coordinates.
const COORDS: Record<string, { latitude: number; longitude: number }> = {
  "marina-shelter": { latitude: 37.805, longitude: -122.432 },
  "bayview-shelter": { latitude: 37.729, longitude: -122.391 },
};

const STALE_AFTER_MINUTES = 30;

async function runActor(name: string): Promise<any[]> {
  const dir = path.join(ROOT, "actors", name);
  const dataset = path.join(dir, "storage", "datasets", "default");
  // Clear old results only. Keep saved evidence.
  await rm(dataset, { recursive: true, force: true });

  await new Promise<void>((resolve, reject) => {
    const p = spawn("npx", ["tsx", "src/main.ts"], { cwd: dir, stdio: "inherit" });
    p.on("error", reject);
    p.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${name} exited with code ${code}`))
    );
  });

  let files: string[] = [];
  try {
    files = (await readdir(dataset)).filter((f) => f.endsWith(".json")).sort();
  } catch {
    /* no dataset written */
  }
  return Promise.all(
    files.map(async (f) => JSON.parse(await readFile(path.join(dataset, f), "utf8")))
  );
}

function toIsoOrNull(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export type Failure = { source: string; field?: string; detail: string };

export async function collectPacket(prev: EmergencyPacket | null) {
  const [shelterRecords, roadRecords] = await Promise.all([
    runActor("shelter-monitor"),
    runActor("road-monitor"),
  ]);
  const all = [...shelterRecords, ...roadRecords];
  const failures: Failure[] = [];

  for (const r of all) {
    if (r.type === "fetch_failure") {
      failures.push({ source: r.sourceUrl, detail: r.error });
    }
    if (r.type === "extraction_failure") {
      failures.push({
        source: r.sourceUrl,
        field: r.failedField,
        detail: `Could not extract "${r.failedField}" for ${r.shelterId ?? r.roadId}`,
      });
    }
  }

  const shelterData = shelterRecords.filter((r) => r.type === "shelter");
  const roadData = roadRecords.filter((r) => r.type === "road");

  // If a source could not be fetched at all, do not build a new packet.
  if ((shelterData.length === 0 || roadData.length === 0) && failures.length > 0) {
    return { packet: null, failures };
  }

  const now = new Date().toISOString();

  const shelters = shelterData
    .filter((r) => {
      if (!COORDS[r.id]) {
        failures.push({ source: r.sourceUrl, detail: `Unknown shelter id ${r.id}` });
        return false;
      }
      return true;
    })
    .map((r) => ({
      id: r.id,
      name: r.name ?? r.id,
      ...COORDS[r.id],
      status: r.status,
      petsAllowed: r.petsAllowed,
      wheelchairAccessible: r.wheelchairAccessible,
      capacity: r.capacity,
      sourceId: "shelter-status",
      sourceUpdatedAt: toIsoOrNull(r.sourceUpdatedAt),
      observedAt: r.observedAt,
      staleAfterMinutes: STALE_AFTER_MINUTES,
    }));

  const roadClosures = roadData.map((r) => ({
    id: r.id,
    description: r.description,
    status: r.status,
    sourceId: "transportation-alerts",
    observedAt: r.observedAt,
  }));

  const sources = [
    {
      id: "shelter-status",
      name: "Shelter Status Page",
      url: shelterData[0]?.sourceUrl ?? "http://localhost:4010/shelter-status/",
      lastSuccessfulFetchAt: shelterData[0]?.observedAt ?? now,
    },
    {
      id: "transportation-alerts",
      name: "Transportation Alerts",
      url: roadData[0]?.sourceUrl ?? "http://localhost:4010/transportation-alerts/",
      lastSuccessfulFetchAt: roadData[0]?.observedAt ?? now,
    },
  ];

  const candidate = {
    version: (prev?.version ?? 0) + 1,
    incidentId: "demo-wildfire-001",
    downloadedAt: now,
    lastSyncAttemptAt: now,
    syncStatus: "fresh",
    sources,
    shelters,
    roadClosures,
    conflicts: [],
  };

  // Reject anything that does not match the shared contract.
  const parsed = EmergencyPacket.safeParse(candidate);
  if (!parsed.success) {
    failures.push({ source: "validation", detail: parsed.error.message });
    return { packet: null, failures };
  }
  return { packet: parsed.data, failures };
}

export type Change = {
  type: string;
  shelterId?: string;
  roadId?: string;
  oldValue: unknown;
  newValue: unknown;
  evidence: string;
};

export function diffPackets(
  oldP: EmergencyPacket | null,
  newP: EmergencyPacket
): Change[] {
  if (!oldP) return [];
  const changes: Change[] = [];

  for (const s of newP.shelters) {
    const o = oldP.shelters.find((x) => x.id === s.id);
    if (!o) continue;
    for (const field of ["status", "capacity", "petsAllowed", "wheelchairAccessible"] as const) {
      if (o[field] !== s[field]) {
        changes.push({
          type: `shelter_${field}`,
          shelterId: s.id,
          oldValue: o[field],
          newValue: s[field],
          evidence: `${s.name}: ${field} changed from ${o[field]} to ${s[field]} (source updated ${s.sourceUpdatedAt ?? "unknown"})`,
        });
      }
    }
  }

  for (const r of newP.roadClosures) {
    const o = oldP.roadClosures.find((x) => x.id === r.id);
    if (o && o.status !== r.status) {
      changes.push({
        type: "road_status",
        roadId: r.id,
        oldValue: o.status,
        newValue: r.status,
        evidence: r.description,
      });
    }
  }
  return changes;
}
