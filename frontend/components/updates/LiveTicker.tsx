"use client";
import { useEffect, useState } from "react";
import { ago, CATEGORY_META, SEV_COLOR, type UpdatesData } from "@/lib/updates";

export default function LiveTicker({ data, loading, saved }: { data: UpdatesData | null; loading: boolean; saved: boolean }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(t); }, []);
  const items = (data?.updates ?? []).slice(0, 12);

  return (
    <section style={{ margin: "1rem 0" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: "1rem", display: "flex", alignItems: "center", gap: "0.45rem" }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, display: "inline-block", background: saved ? "#e0a800" : "#3fb950" }} />
          Live updates
        </h2>
        <span className="muted small">
          {data ? `${saved ? "Saved" : "Last updated"} ${ago(data.fetchedAt)}` : loading ? "Checking official sources…" : ""}
          {data?.place?.label ? ` · ${data.place.label}` : ""}
        </span>
      </div>
      {items.length === 0 ? (
        <div className="muted small">{loading ? "Loading live updates…" : "No live updates right now."}</div>
      ) : (
        <div style={{ display: "flex", gap: "0.75rem", overflowX: "auto", paddingBottom: "0.4rem", scrollSnapType: "x proximity" }}>
          {items.map((u) => {
            const [icon, label] = CATEGORY_META[u.category] ?? ["•", u.category];
            return (
              <a key={u.id} href={u.sourceUrl} target="_blank" rel="noreferrer" title={`Open source: ${u.sourceName}`}
                style={{ flex: "0 0 260px", scrollSnapAlign: "start", textDecoration: "none", color: "inherit",
                  border: "1px solid var(--line)", borderLeft: `4px solid ${SEV_COLOR[u.severity]}`,
                  background: "var(--surface)", borderRadius: 12, padding: "0.7rem 0.85rem" }}>
                <div className="muted small" style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{icon} {label}</span><span style={{ textTransform: "capitalize" }}>{u.severity}</span>
                </div>
                <div style={{ fontWeight: 600, margin: "0.3rem 0", lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {u.title}
                </div>
                <div className="muted small">
                  {u.distanceMiles ? `${u.distanceMiles} mi away · ` : ""}{u.updatedAt ? `Updated ${ago(u.updatedAt)}` : ""}
                </div>
              </a>
            );
          })}
        </div>
      )}
    </section>
  );
}
