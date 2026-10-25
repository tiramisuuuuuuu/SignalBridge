"use client";
import { useState, type CSSProperties } from "react";
import { ago, CATEGORY_META, SEV_COLOR, type UpdateItem, type UpdatesData } from "@/lib/updates";

const card: CSSProperties = { border: "1px solid var(--line)", background: "var(--surface)", borderRadius: 12, padding: "0.9rem 1rem", marginBottom: "0.75rem" };
const FILTERS: [string, string][] = [
  ["all", "All"], ["weather", "Weather"], ["forecast", "Forecasts"], ["disaster", "Disasters"],
  ["earthquake", "Earthquakes"], ["wildfire", "Wildfires"], ["shelter", "Shelters"], ["road", "Roads"],
];

// General official safety guidance per hazard (US-focused; always follow local authorities).
const GUIDE: Record<string, [string, string]> = {
  wildfire: ["https://www.ready.gov/wildfires", "Wildfire safety (Ready.gov)"],
  earthquake: ["https://www.ready.gov/earthquakes", "Earthquake safety (Ready.gov)"],
  weather: ["https://www.ready.gov/severe-weather", "Severe weather safety (Ready.gov)"],
  forecast: ["https://www.ready.gov/severe-weather", "Severe weather safety (Ready.gov)"],
  disaster: ["https://www.ifrc.org/our-work/disasters-climate-and-crises", "Disaster guidance (IFRC)"],
  shelter: ["https://www.redcross.org/get-help/disaster-relief-and-recovery-services/find-an-open-shelter.html", "Shelter help (Red Cross)"],
  road: ["https://www.ready.gov/evacuation", "Evacuation guidance (Ready.gov)"],
  air: ["https://www.airnow.gov/aqi/aqi-basics/", "Air quality guidance (AirNow)"],
};

function guideFor(u: UpdateItem) {
  return u.id.startsWith("air") ? GUIDE.air : GUIDE[u.category];
}

export default function UpdatesFeed({ data, loading, saved, error, query }: {
  data: UpdatesData | null; loading: boolean; saved: boolean; error?: string | null; query?: string;
}) {
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  if (error && /^422/.test(error)) {
    return <section style={{ ...card, borderLeft: "4px solid var(--high)" }}>SignalBridge covers <strong>California only</strong> for now. Choose a California city, for example San Francisco, Los Angeles, Sacramento, or Fresno.</section>;
  }
  if (error && /^404/.test(error)) {
    return <section style={{ ...card, borderLeft: "4px solid var(--high)" }}>Couldn&apos;t find &quot;{query}&quot; in California. Check the spelling and try again.</section>;
  }
  if (!data) {
    return <section style={card} className="muted">{loading ? "Checking official sources for your area…" : "Live updates unavailable right now."}</section>;
  }

  const list = data.updates.filter((u) => filter === "all" || u.category === filter);
  const failed = data.sources.filter((s) => !s.ok);
  const count = (f: string) => (f === "all" ? data.updates.length : data.updates.filter((u) => u.category === f).length);
  const linkStyle: CSSProperties = { marginRight: "1rem", whiteSpace: "nowrap" };

  return (
    <section>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: "1.15rem" }}>Recent updates · {data.place.label}</h2>
        <span className="muted small">{saved ? "Saved" : "Fetched"} {ago(data.fetchedAt)}</span>
      </div>
      <p className="muted small" style={{ margin: "0.3rem 0 0" }}>
        Full details for every update: key facts, official source, location, and what to do.
      </p>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", margin: "0.75rem 0" }}>
        {FILTERS.map(([f, label]) => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: "0.35rem 0.8rem", borderRadius: 999, cursor: "pointer", color: "inherit",
              border: "1px solid var(--line)", background: filter === f ? "var(--accent)" : "transparent" }}>
            {label} ({count(f)})
          </button>
        ))}
      </div>

      {failed.length > 0 && (
        <div style={{ ...card, borderLeft: "4px solid #e0a800" }} className="small">
          Couldn&apos;t reach: {failed.map((s) => s.name).join(", ")}. Showing updates from the other sources.
        </div>
      )}

      {list.length === 0 ? (
        <div style={card} className="muted">
          {filter === "road" ? "Road closure data is coming soon. Ask the assistant about specific roads." : "No updates in this category right now."}
        </div>
      ) : (
        list.map((u) => {
          const [icon, label] = CATEGORY_META[u.category] ?? ["•", u.category];
          const long = (u.summary ?? "").length > 280;
          const isOpen = !!open[u.id];
          const guide = guideFor(u);
          return (
            <article key={u.id} style={{ ...card, borderLeft: `4px solid ${SEV_COLOR[u.severity]}` }}>
              <div className="muted small">
                {icon} {label} · <span style={{ textTransform: "capitalize" }}>{u.severity}</span>
                {u.where ? ` · ${u.where}` : ""}{u.distanceMiles ? ` · ${u.distanceMiles} mi away` : ""}
                {u.updatedAt ? ` · Updated ${ago(u.updatedAt)}` : ""}
              </div>
              <strong style={{ display: "block", margin: "0.35rem 0" }}>{u.title}</strong>

              {u.summary && (
                <p className="small" style={{ margin: "0.3rem 0", whiteSpace: "pre-line" }}>
                  {long && !isOpen ? `${u.summary.slice(0, 280)}…` : u.summary}
                  {long && (
                    <button onClick={() => setOpen((o) => ({ ...o, [u.id]: !isOpen }))}
                      style={{ marginLeft: "0.4rem", background: "none", border: "none", color: "var(--accent)", cursor: "pointer", padding: 0 }}>
                      {isOpen ? "Show less" : "Show more"}
                    </button>
                  )}
                </p>
              )}

              {u.details && u.details.length > 0 && (
                <ul className="small" style={{ margin: "0.4rem 0", paddingLeft: "1.2rem" }}>
                  {u.details.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              )}

              <div className="small" style={{ marginTop: "0.5rem", display: "flex", flexWrap: "wrap", rowGap: "0.3rem" }}>
                <a href={u.sourceUrl} target="_blank" rel="noreferrer" style={linkStyle}>Source: {u.sourceName} ↗</a>
                {u.lat != null && u.lng != null && u.distanceMiles !== 0 && (
                  <a href={`https://www.google.com/maps/search/?api=1&query=${u.lat},${u.lng}`} target="_blank" rel="noreferrer" style={linkStyle}>Map ↗</a>
                )}
                {guide && <a href={guide[0]} target="_blank" rel="noreferrer" style={linkStyle}>What to do: {guide[1]} ↗</a>}
                {u.expiresAt && <span className="muted">Expires {new Date(u.expiresAt).toLocaleString()}</span>}
              </div>
            </article>
          );
        })
      )}

      <p className="muted small">
        Sources: GDACS (UN/EU), USGS, NIFC, NASA EONET, Open-Meteo, NWS and FEMA (US). Always follow instructions from local authorities.
      </p>
    </section>
  );
}
