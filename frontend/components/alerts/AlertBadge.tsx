"use client";
import { useState } from "react";
import type { LiveAlert } from "@/types";
import { timeAgo } from "@/lib/time";

const ICON = { disaster: "🔴", road_closure: "🚧" } as const;
const LABEL = { disaster: "Disaster", road_closure: "Road closure" } as const;

export default function AlertBadge({ alert }: { alert: LiveAlert }) {
  const [open, setOpen] = useState(false);
  return (
    <article className={`alert sev-${alert.severity}`}>
      <div className="alert-top">
        <span>{ICON[alert.category]} {LABEL[alert.category]}</span>
        <span className="sev">{alert.severity}</span>
      </div>
      <h3>{alert.title}</h3>
      <p className="muted small">{alert.distanceMiles} mi away · Updated {timeAgo(alert.updatedAt)}</p>
      <button className="link" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? "Hide details" : "Details"}
      </button>
      {open && (
        <div className="alert-more">
          <p>{alert.description}</p>
          <a href={alert.sourceUrl} target="_blank" rel="noreferrer">Source: {alert.sourceName}</a>
        </div>
      )}
    </article>
  );
}
