"use client";
import type { CSSProperties } from "react";
import type { LiveData } from "@/lib/api";

const card: CSSProperties = {
  border: "1px solid var(--line)", background: "var(--surface)", borderRadius: 12,
  padding: "0.9rem 1rem", marginBottom: "0.75rem",
};
const sevColor: Record<string, string> = { high: "var(--high)", medium: "#e0a800", low: "#3fb950" };
const heading: CSSProperties = { fontSize: "1rem", margin: "1rem 0 0.5rem" };

function ago(iso?: string | null) {
  if (!iso) return "";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(m)) return "";
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} hr ago` : `${Math.round(h / 24)} days ago`;
}

export default function LiveOfficial({ live, loading, saved }: { live: LiveData | null; loading: boolean; saved: boolean }) {
  if (!live) {
    return <section style={card} className="muted">{loading ? "Loading live official data…" : "Live official data unavailable right now."}</section>;
  }
  return (
    <section>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.15rem" }}>Live official data · {live.place.label}</h2>
        <span className="muted small">{saved ? "Saved" : "Fetched"} {ago(live.fetchedAt)}</span>
      </div>

      {live.errors.length > 0 && (
        <div style={{ ...card, borderLeft: "4px solid var(--high)", marginTop: "0.75rem" }}>
          Some sources could not be reached: {live.errors.join("; ")}
        </div>
      )}

      <h3 style={heading}>Weather &amp; hazard alerts (National Weather Service)</h3>
      {live.alerts.length === 0 ? (
        <div style={card} className="muted">No active NWS alerts for this location right now.</div>
      ) : (
        live.alerts.map((a) => (
          <article key={a.id} style={{ ...card, borderLeft: `4px solid ${sevColor[a.severity] ?? "var(--line)"}` }}>
            <div className="muted small">{a.event} · {a.severity}</div>
            <strong>{a.title}</strong>
            {a.area && <p className="muted small" style={{ margin: "0.3rem 0" }}>{a.area}</p>}
            {a.instruction && <p className="small" style={{ margin: "0.3rem 0" }}>{a.instruction}</p>}
            <p className="muted small" style={{ margin: 0 }}>
              Source: <a href={a.sourceUrl} target="_blank" rel="noreferrer">{a.sourceName}</a>
              {a.updatedAt && <> · Updated {ago(a.updatedAt)}</>}
              {a.expiresAt && <> · Expires {new Date(a.expiresAt).toLocaleString()}</>}
            </p>
          </article>
        ))
      )}

      <h3 style={heading}>Open shelters (FEMA)</h3>
      {live.shelters.length === 0 ? (
        <div style={card} className="muted">
          No FEMA-listed shelters are open within {live.radiusMiles} miles right now. FEMA lists shelters only while they are open during an emergency.
        </div>
      ) : (
        live.shelters.map((s) => (
          <article key={s.id} style={card}>
            <strong>{s.name}</strong>
            <p className="muted small" style={{ margin: "0.3rem 0" }}>
              {s.address}{s.distanceMiles != null && <> · {s.distanceMiles} mi away</>}{s.capacity != null && <> · Capacity {s.capacity}</>}
            </p>
            <p className="muted small" style={{ margin: 0 }}>
              Source: <a href={s.sourceUrl} target="_blank" rel="noreferrer">{s.sourceName}</a>
              {s.updatedAt && <> · Updated {ago(s.updatedAt)}</>}
            </p>
          </article>
        ))
      )}
    </section>
  );
}
