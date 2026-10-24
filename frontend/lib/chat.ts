import type { ChatMessage, UserLocation } from "@/types";
import { askBackend, loadCachedPacket, packetToAlerts } from "@/lib/api";

// Online: asks the SignalBridge assistant. Offline: answers from the saved packet.
export async function askAssistant(question: string, loc: UserLocation | null): Promise<Omit<ChatMessage, "id" | "role">> {
  const now = new Date().toISOString();
  const saved = loadCachedPacket();
  try {
    return await askBackend(question, saved);
  } catch {
    if (!saved) {
      return { createdAt: now, text: "I'm offline and don't have any saved information yet.",
        warning: "Connect once to download the emergency packet." };
    }
    const alerts = packetToAlerts(saved, loc);
    return {
      createdAt: now,
      text: alerts.map((a) => `${a.title}. ${a.description}`).join("\n\n"),
      sources: alerts.map((a) => ({ name: a.sourceName, url: a.sourceUrl, updatedAt: a.updatedAt })),
      warning: `Offline: this is saved information from ${new Date(saved.downloadedAt).toLocaleTimeString()}. It may be out of date.`,
    };
  }
}
