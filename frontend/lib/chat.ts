import { sampleAlerts } from "@/data/sample";
import type { ChatMessage, UserLocation } from "@/types";

// Mock responder. Replace the body with: fetch("/api/chat", { method: "POST", body: JSON.stringify({ question, location }) })
// The backend should return the same shape: { text, sources, warning }.
export async function askAssistant(question: string, _loc: UserLocation | null): Promise<Omit<ChatMessage, "id" | "role">> {
  await new Promise((r) => setTimeout(r, 900));
  const q = question.toLowerCase();
  const pick = (cat: string) => sampleAlerts.filter((a) => a.category === cat);
  const toSources = (list: typeof sampleAlerts) =>
    list.map((a) => ({ name: a.sourceName, url: a.sourceUrl, updatedAt: a.updatedAt, distanceMiles: a.distanceMiles }));
  const now = new Date().toISOString();

  if (/road|highway|route|closed|traffic/.test(q)) {
    const list = pick("road_closure");
    return { createdAt: now, sources: toSources(list),
      text: list.map((a) => `${a.title} (${a.distanceMiles} miles away). ${a.description}`).join("\n\n") };
  }
  if (/disaster|fire|storm|evacuat|danger/.test(q)) {
    const list = pick("disaster");
    return { createdAt: now, sources: toSources(list),
      text: list.map((a) => `${a.title} (${a.distanceMiles} miles away). ${a.description}`).join("\n\n") };
  }
  return { createdAt: now,
    text: "I don't have verified information to answer that yet.",
    warning: "I can't verify this from the sources I've checked, so I won't guess. Try asking about road closures or nearby disasters." };
}
