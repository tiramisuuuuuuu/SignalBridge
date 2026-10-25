import type { ChatMessage, UserLocation } from "@/types";
import { API } from "@/lib/api";
import { ago, loadCachedUpdates } from "@/lib/updates";
import { loadLastPlaces } from "@/lib/places";

export type ChatTurn = { role: "user" | "assistant"; content: string };
export interface ChatReply { text: string; sources: { name: string; url: string }[]; warning?: string; offline?: boolean }

function savedUpdates(loc: UserLocation | null) {
  return (loc && loadCachedUpdates(loc.label)) ?? loadCachedUpdates("Your location");
}

// Local data sent with each question: area label, saved live updates, nearby places. Never the exact location.
function context(loc: UserLocation | null) {
  const upd = savedUpdates(loc);
  const places = loadLastPlaces();
  return {
    label: upd?.place?.label ?? loc?.label ?? "unknown",
    updates: (upd?.updates ?? []).slice(0, 15).map((u) => ({
      category: u.category, severity: u.severity, title: u.title, summary: (u.summary ?? "").slice(0, 300),
      where: u.where, distanceMiles: u.distanceMiles, source: u.sourceName, url: u.sourceUrl, updatedAt: u.updatedAt,
    })),
    places: (places?.places ?? []).slice(0, 30).map((p) => ({
      name: p.name, category: p.category, address: p.address,
      lat: Number(p.lat.toFixed(5)), lng: Number(p.lng.toFixed(5)), distanceMiles: p.distanceMiles,
    })),
  };
}

function offlineAnswer(loc: UserLocation | null): ChatReply {
  const upd = savedUpdates(loc);
  if (!upd || !upd.updates.length) {
    return { text: "You're offline and there's no saved information yet. Connect once to download updates for your area.", sources: [], offline: true };
  }
  const lines = upd.updates.slice(0, 6).map((u) => `- ${u.title} (${u.sourceName})`).join("\n");
  return {
    text: `You're offline, so I can't search the web. Here's the latest saved information for ${upd.place.label}:\n${lines}`,
    sources: upd.updates.slice(0, 6).map((u) => ({ name: u.sourceName, url: u.sourceUrl })),
    warning: `Saved ${ago(upd.fetchedAt)}. It may be out of date.`,
    offline: true,
  };
}

export async function askChat(history: ChatTurn[], loc: UserLocation | null): Promise<ChatReply> {
  try {
    const r = await fetch(`${API}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history, context: context(loc) }),
      signal: AbortSignal.timeout(100000),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { text: d.error ?? "The assistant is unavailable right now.", sources: [], warning: "Please try again in a moment." };
    return { text: d.text, sources: d.sources ?? [], warning: [d.warning, d.debug ? `Debug: ${JSON.stringify(d.debug)}` : null].filter(Boolean).join(" ") || undefined };
  } catch {
    return offlineAnswer(loc);
  }
}

// Kept for older callers: single question, no history.
export async function askAssistant(question: string, loc: UserLocation | null): Promise<Omit<ChatMessage, "id" | "role">> {
  const r = await askChat([{ role: "user", content: question }], loc);
  const now = new Date().toISOString();
  return { createdAt: now, text: r.text, sources: r.sources.map((s) => ({ name: s.name, url: s.url, updatedAt: now })), warning: r.warning };
}
