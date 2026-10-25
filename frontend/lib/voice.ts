import { API } from "@/lib/api";

// Read answers aloud: Cartesia voice via the API, browser voice as the fallback (also works offline).
let current: HTMLAudioElement | null = null;

export function speechText(text: string) {
  return text
    .replace(/\{\{place\|([^|}]*)\|[^}]*\}\}/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\*\*/g, "")
    .replace(/^[-•*]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function clip(t: string, max = 580) {
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const i = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return i > 200 ? cut.slice(0, i + 1) : cut;
}

export function stopSpeaking() {
  current?.pause();
  current = null;
  if (typeof window !== "undefined" && "speechSynthesis" in window) speechSynthesis.cancel();
}

export async function speak(text: string, onEnd?: () => void) {
  stopSpeaking();
  const t = clip(speechText(text));
  if (!t) { onEnd?.(); return; }
  try {
    const r = await fetch(`${API}/api/voice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: t }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const url = URL.createObjectURL(await r.blob());
    const audio = new Audio(url);
    current = audio;
    audio.onended = () => { URL.revokeObjectURL(url); if (current === audio) current = null; onEnd?.(); };
    await audio.play();
  } catch {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(t);
      u.onend = () => onEnd?.();
      speechSynthesis.speak(u);
    } else {
      onEnd?.();
    }
  }
}
