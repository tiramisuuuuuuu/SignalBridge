"use client";
import { Suspense, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { UserLocation } from "@/types";
import { loadLocation } from "@/lib/storage";
import { askChat } from "@/lib/chat";

type Msg = { id: string; role: "user" | "assistant"; text: string; sources?: { name: string; url: string }[]; warning?: string };
type Me = { lat: number; lng: number } | null;

const SUGGESTIONS = [
  "Are any roads near me closed?",
  "What disasters or warnings are near me?",
  "Find the nearest open shelter.",
  "Where can I get water and supplies?",
  "Nearest hospital or pharmacy?",
];
const uid = () => Math.random().toString(36).slice(2);

// ---- Turn the assistant's text into safe React elements (no raw HTML) ----
function placeLink(name: string, coords: string, address: string, me: Me, key: string) {
  const q = encodeURIComponent([name, address].filter(Boolean).join(" "));
  const exact = /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(coords.trim());
  const dest = exact ? coords.replace(/\s/g, "") : encodeURIComponent([name, address].filter(Boolean).join(", "));
  const dir = `https://www.google.com/maps/dir/?api=1${me ? `&origin=${me.lat},${me.lng}` : ""}&destination=${dest}`;
  return (
    <span key={key}>
      <strong>{name}</strong>{address ? ` (${address})` : ""}{" "}
      <a href={`https://www.google.com/search?q=${q}`} target="_blank" rel="noreferrer">Google ↗</a>{" · "}
      <a href={dir} target="_blank" rel="noreferrer">Directions ↗</a>
    </span>
  );
}

function linkify(s: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /https?:\/\/[^\s)]+/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  const plain = (t: string) => t.replace(/\*\*/g, "");
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(plain(s.slice(last, m.index)));
    out.push(<a key={`${key}-u${i++}`} href={m[0]} target="_blank" rel="noreferrer">{m[0]}</a>);
    last = re.lastIndex;
  }
  if (last < s.length) out.push(plain(s.slice(last)));
  return out;
}

function inline(text: string, me: Me, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\{\{place\|([^|}]*)\|([^|}]*)\|([^}]*)\}\}/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(...linkify(text.slice(last, m.index), `${key}-t${i}`));
    out.push(placeLink(m[1].trim(), m[2].trim(), m[3].trim(), me, `${key}-p${i++}`));
    last = re.lastIndex;
  }
  if (last < text.length) out.push(...linkify(text.slice(last), `${key}-end`));
  return out;
}

function renderText(text: string, me: Me): ReactNode[] {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = (k: number) => {
    if (!bullets.length) return;
    blocks.push(<ul key={`ul${k}`} style={{ margin: "0.3rem 0", paddingLeft: "1.2rem" }}>{bullets.map((b, j) => <li key={j}>{inline(b, me, `b${k}-${j}`)}</li>)}</ul>);
    bullets = [];
  };
  text.split("\n").forEach((line, k) => {
    const t = line.trim();
    if (/^[-•*]\s+/.test(t)) bullets.push(t.replace(/^[-•*]\s+/, ""));
    else { flush(k); if (t) blocks.push(<p key={`p${k}`} style={{ margin: "0.3rem 0" }}>{inline(t, me, `l${k}`)}</p>); }
  });
  flush(9999);
  return blocks;
}

// ---- Chat page ----
function ChatInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [loc, setLoc] = useState<UserLocation | null>(null);
  const [me, setMe] = useState<Me>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]); // session only: cleared when you leave this page
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const asked = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  const msgsRef = useRef<Msg[]>([]);
  msgsRef.current = msgs;

  useEffect(() => {
    setLoc(loadLocation());
    // Exact location for directions links, only if permission was already granted (no new popup).
    navigator.permissions?.query({ name: "geolocation" as PermissionName }).then((p) => {
      if (p.state === "granted") {
        navigator.geolocation.getCurrentPosition(
          (pos) => setMe({ lat: Number(pos.coords.latitude.toFixed(5)), lng: Number(pos.coords.longitude.toFixed(5)) }),
          () => {}, { maximumAge: 300000, timeout: 10000 });
      }
    }).catch(() => {});
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next = [...msgsRef.current, { id: uid(), role: "user" as const, text: q }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    const reply = await askChat(next.map((m) => ({ role: m.role, content: m.text })), loadLocation());
    setMsgs((cur) => [...cur, { id: uid(), role: "assistant", text: reply.text, sources: reply.sources, warning: reply.warning }]);
    setBusy(false);
  }

  useEffect(() => {
    const q = params.get("q");
    if (q && !asked.current) { asked.current = true; send(q); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const bubble = (role: Msg["role"]): CSSProperties => ({
    maxWidth: "85%", padding: "0.75rem 0.95rem", borderRadius: 14, lineHeight: 1.45,
    border: "1px solid var(--line)",
    background: role === "user" ? "var(--accent)" : "var(--surface)",
    alignSelf: role === "user" ? "flex-end" : "flex-start",
  });
  const pill: CSSProperties = { padding: "0.45rem 0.85rem", borderRadius: 999, border: "1px solid var(--line)", background: "var(--surface)", color: "inherit", cursor: "pointer" };

  return (
    <div className="shell" style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "1rem 0", borderBottom: "1px solid var(--line)" }}>
        <button onClick={() => router.push("/")} style={pill}>← Home</button>
        <div>
          <strong>Ask SignalBridge</strong>
          <div className="muted small">Searches trusted sources{loc?.label ? ` · ${loc.label}` : ""} · History clears when you leave</div>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.75rem", padding: "1rem 0" }}>
        {msgs.length === 0 && !busy && (
          <div>
            <p className="muted">Ask about disasters, weather, roads, shelters, supplies, medical help, or safety steps.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              {SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)} style={pill}>{s}</button>)}
            </div>
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} style={bubble(m.role)}>
            {m.role === "user" ? m.text : renderText(m.text, me)}
            {m.sources && m.sources.length > 0 && (
              <div className="small" style={{ marginTop: "0.5rem" }}>
                <span className="muted">Sources: </span>
                {m.sources.map((s, i) => (
                  <span key={i}>{i > 0 && " · "}<a href={s.url} target="_blank" rel="noreferrer">{s.name} ↗</a></span>
                ))}
              </div>
            )}
            {m.warning && <div className="muted small" style={{ marginTop: "0.4rem" }}>⚠️ {m.warning}</div>}
          </div>
        ))}
        {busy && <div style={bubble("assistant")} className="muted">Searching trusted sources…</div>}
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(input); }}
        style={{ position: "sticky", bottom: 0, display: "flex", gap: "0.5rem", padding: "0.75rem 0 1rem", background: "var(--bg, inherit)" }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type your question…" disabled={busy}
          style={{ flex: 1, padding: "0.75rem 1rem", borderRadius: 999, border: "1px solid var(--line)", background: "var(--surface)", color: "inherit" }} />
        <button type="submit" disabled={busy || !input.trim()} style={{ ...pill, background: "var(--accent)" }}>Send ➤</button>
      </form>
      <p className="muted small" style={{ margin: "0 0 1rem" }}>
        In immediate danger? Contact local emergency services (911 US/Canada · 112 EU · 999 UK). Answers can be wrong; check the linked sources.
      </p>
    </div>
  );
}

export default function ChatPage() {
  return <Suspense fallback={null}><ChatInner /></Suspense>;
}
