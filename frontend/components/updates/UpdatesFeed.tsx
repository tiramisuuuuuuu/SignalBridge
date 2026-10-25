"use client";
import { useState, type CSSProperties } from "react";
import { ago, CATEGORY_META, SEV_COLOR, type UpdatesData } from "@/lib/updates";

const card: CSSProperties = { border: "1px solid var(--line)", background: "var(--surface)", borderRadius: 12, padding: "0.9rem 1rem", marginBottom: "0.75rem" };
const FILTERS: [string, string][] = [
  ["all", "All"], ["weather", "Weather"], ["forecast", "Forecasts"], ["disaster", "Disasters"],
  ["earthquake", "Earthquakes"], ["wildfire", "Wildfires"], ["shelter", "Shelters"], ["road", "Roads"],
];

export default function UpdatesFeed({ data, loading, saved, error, query }: {
  data: UpdatesData | null; loading: boolean; saved: boolean; error?: string | null; query?: string;
}) {
  const [filter, setFilter] = useState("all");

  if (error && /^404/.test(error)) {
    return <section style={{ ...card, borderLeft: "4px solid var(--high)" }}>Couldn&apos;t find &quot;{query}&quot;. Check the spelling and try again.</section>;
  }
  if (!data) {
    return <section style={card} className="muted">{loading ? "Checking official sources for your area…" : "Live updates unavailable right now."}</section>;
  }

  const list = data.updates.filter((u) => filter === "all" || u.category === filter);
  const failed = data.sources.filter((s) => !s.ok);
  const count = (f: string) => (f === "all" ? data.updates.length : data.updates.filter((u) => u.category === f).length);

  return (
    <section>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: "1.15rem" }}>Recent updates · {data.place.label}</h2>
        <span className="muted small">{saved ? "Saved" : "Fetched"} {ago(data.fetchedAt)}</span>
      </div>

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
          return (
            <article key={u.id} style={{ ...card, borderLeft: `4px solid ${SEV_COLOR[u.severity]}` }}>
              <div className="muted small">
                {icon} {label} · <span style={{ textTransform: "capitalize" }}>{u.severity}</span>
                {u.where ? ` · ${u.where}` : ""}{u.distanceMiles ? ` · ${u.distanceMiles} mi away` : ""}
              </div>
              <strong style={{ display: "block", margin: "0.3rem 0" }}>{u.title}</strong>
              {u.summary && <p className="small" style={{ margin: "0.3rem 0" }}>{u.summary}</p>}
              <p className="muted small" style={{ margin: 0 }}>
                Source: <a href={u.sourceUrl} target="_blank" rel="noreferrer">{u.sourceName} ↗</a>
                {u.updatedAt && <> · Updated {ago(u.updatedAt)}</>}
                {u.expiresAt && <> · Expires {new Date(u.expiresAt).toLocaleString()}</>}
              </p>
            </article>
          );
        })
      )}

      <p className="muted small">
        Sources: GDACS (UN/EU), USGS, NASA EONET, Open-Meteo, NWS and FEMA (US). Always follow instructions from local authorities.
      </p>
    </section>
  );
}
