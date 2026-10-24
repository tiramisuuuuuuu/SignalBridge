// Pushes live state to SpacetimeDB after each sync.
// Optional: if SpacetimeDB isn't running, we log and move on.
const BASE = process.env.SPACETIMEDB_URI || "http://127.0.0.1:3000";
const DB = process.env.SPACETIMEDB_DB || "signalbridge";

async function call(reducer: string, args: Record<string, unknown>) {
  const r = await fetch(`${BASE}/v1/database/${DB}/call/${reducer}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(3000),
  });
  if (!r.ok) throw new Error(`${reducer} HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

export async function pushToSpacetime(packet: any, changes: any[] = []) {
  if (!packet) return;
  try {
    for (const s of packet.shelters ?? []) {
      await call("upsert_shelter", {
        id: s.id,
        name: s.name,
        status: s.status,
        capacity: s.capacity ?? -1,
        sourceUpdatedAt: s.sourceUpdatedAt ?? "",
        packetVersion: packet.version,
      });
    }
    for (const c of changes) {
      await call("record_change", {
        packetVersion: packet.version,
        type: String(c.type ?? ""),
        shelterId: String(c.shelterId ?? c.roadId ?? ""),
        oldValue: String(c.oldValue ?? ""),
        newValue: String(c.newValue ?? ""),
        evidence: String(c.evidence ?? ""),
      });
    }
    console.log(`SpacetimeDB: pushed ${packet.shelters?.length ?? 0} shelter(s), ${changes.length} change(s) (v${packet.version})`);
  } catch (err) {
    console.log("SpacetimeDB push skipped:", String(err));
  }
}
