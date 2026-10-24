"use client";
import { useState } from "react";
import type { NewsArticle } from "@/types";
import NewsCard from "./NewsCard";

const FILTERS = [
  { id: "all", label: "All" }, { id: "local", label: "Local" }, { id: "state", label: "State" },
  { id: "weather", label: "Weather" }, { id: "transportation", label: "Transportation" },
  { id: "public_safety", label: "Public safety" },
];

export default function NewsFeed({ articles }: { articles: NewsArticle[] }) {
  const [filter, setFilter] = useState("all");
  const shown = articles.filter((a) => filter === "all" || a.scope === filter || a.topic === filter);
  const [first, ...rest] = shown;

  return (
    <section>
      <div className="filters" role="group" aria-label="News filters">
        {FILTERS.map((f) => (
          <button key={f.id} aria-pressed={filter === f.id}
            className={`chip ${filter === f.id ? "on" : ""}`} onClick={() => setFilter(f.id)}>{f.label}</button>
        ))}
      </div>
      {!first && <p className="muted">No stories match this filter yet.</p>}
      {first && <NewsCard article={first} featured />}
      <div className="grid">{rest.map((a) => <NewsCard key={a.id} article={a} />)}</div>
    </section>
  );
}
