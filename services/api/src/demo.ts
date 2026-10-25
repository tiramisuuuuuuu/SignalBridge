import type { Express } from "express";
import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";

type Shelter = { status: string; capacity: number };
type Road = { status: string; reason: string };
export interface DemoState { marina: Shelter; bayview: Shelter; highway12: Road }

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

function shelterSection(id: string, name: string, s: Shelter, pets: string, wheelchair: string) {
  return `  <section class="shelter" id="${id}">
    <h2 class="name">${name}</h2>
    <p>Status: <span class="status">${esc(s.status)}</span></p>
    <p>Pets accepted: <span class="pets">${pets}</span></p>
    <p>Wheelchair accessible: <span class="wheelchair">${wheelchair}</span></p>
    <p>Capacity: <span class="capacity">${s.capacity}</span></p>
  </section>`;
}
function shelterHtml(st: DemoState, ts: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Shelter Status</title>
</head>
<body>
  <h1>Shelter Status</h1>
  <p>Last updated: <span id="updated" data-field="updated">${ts}</span></p>

${shelterSection("marina-shelter", "Marina Community Shelter", st.marina, "Yes", "Yes")}

${shelterSection("bayview-shelter", "Bayview Community Shelter", st.bayview, "Yes", "No")}
</body>
</html>
`;
}
function roadHtml(st: DemoState) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Transportation Alerts</title>
</head>
<body>
  <h1>Transportation Alerts</h1>
  <section class="road" id="highway-12">
    <h2 class="road-name">Highway 12</h2>
    <p>Status: <span class="road-status">${esc(st.highway12.status)}</span></p>
    <p>Reason: <span class="road-reason">${esc(st.highway12.reason || "None")}</span></p>
  </section>
</body>
</html>
`;
}

export function registerDemo(app: Express, root: string, triggerSync: () => void) {
  const shelterFile = path.join(root, "demo-sites/shelter-status/index.html");
  const roadFile = path.join(root, "demo-sites/transportation-alerts/index.html");
  async function readState(): Promise<DemoState> {
    const sh = await readFile(shelterFile, "utf8").catch(() => "");
    const rd = await readFile(roadFile, "utf8").catch(() => "");
    const after = (html: string, id: string) => html.split(`id="${id}"`)[1] ?? "";
    const val = (html: string, cls: string, d: string) => html.match(new RegExp(`class="${cls}">([^<]*)<`))?.[1]?.trim() ?? d;
    const m = after(sh, "marina-shelter"), b = after(sh, "bayview-shelter"), r = after(rd, "highway-12");
    return {
      marina: { status: val(m, "status", "Open"), capacity: Number(val(m, "capacity", "38")) || 0 },
      bayview: { status: val(b, "status", "Open"), capacity: Number(val(b, "capacity", "60")) || 0 },
      highway12: { status: val(r, "road-status", "Closed"), reason: val(r, "road-reason", "") },
    };
  }
  app.get("/api/demo/state", async (_req, res) => res.json(await readState()));
  app.post("/api/demo/publish", async (req, res) => {
    const cur = await readState();
    const b = req.body ?? {};
    const pick = (v: unknown, allowed: string[], d: string) => (allowed.includes(cap(String(v ?? ""))) ? cap(String(v)) : d);
    const num = (v: unknown, d: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 0 && n <= 10000 ? n : d; };
    const st: DemoState = {
      marina: { status: pick(b.marina?.status, ["Open", "Full", "Closed"], cur.marina.status), capacity: num(b.marina?.capacity, cur.marina.capacity) },
      bayview: { status: pick(b.bayview?.status, ["Open", "Full", "Closed"], cur.bayview.status), capacity: num(b.bayview?.capacity, cur.bayview.capacity) },
      highway12: { status: pick(b.highway12?.status, ["Open", "Closed"], cur.highway12.status), reason: String(b.highway12?.reason ?? cur.highway12.reason).slice(0, 80) },
    };
    for (const s of [st.marina, st.bayview]) if (s.status !== "Open") s.capacity = 0;
    if (st.highway12.status === "Open") st.highway12.reason = "";
    await writeFile(shelterFile, shelterHtml(st, nowIso()));
    await writeFile(roadFile, roadHtml(st));
    execFile("bash", [path.join(root, "demo-sites/stamp-county.sh")], { cwd: root }, () => {});
    res.json({ ok: true, state: st });
    triggerSync();
  });
}
