"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ChatMessage } from "@/types";
import { useLocation } from "@/hooks/useLocation";
import { useSpeech } from "@/hooks/useSpeech";
import { askAssistant } from "@/lib/chat";
import ThemeToggle from "@/components/layout/ThemeToggle";
import MessageBubble from "./MessageBubble";
import ChatComposer from "./ChatComposer";

const SUGGESTED = ["Are any roads near me closed?", "What disasters are near me?"];
const uid = () => Math.random().toString(36).slice(2);

export default function ChatPage() {
  const { location, ready } = useLocation();
  const params = useSearchParams();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const send = useCallback(async (text: string) => {
    if (!text) return;
    setMessages((m) => [...m, { id: uid(), role: "user", text, createdAt: new Date().toISOString() }]);
    setBusy(true); setStatus("Searching verified local sources…");
    try {
      const res = await askAssistant(text, location);
      setMessages((m) => [...m, { id: uid(), role: "assistant", ...res }]);
    } catch {
      setMessages((m) => [...m, { id: uid(), role: "assistant", text: "Something went wrong reaching our sources.",
        warning: "Please try again. I won't guess at an answer.", createdAt: new Date().toISOString() }]);
    } finally { setBusy(false); setStatus(""); }
  }, [location]);

  const speech = useSpeech(send);

  // Handle the question or mic click carried over from the dashboard panel (runs once).
  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    const q = params.get("q");
    if (q) send(q);
  }, [ready, params, send]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  return (
    <div className="chat-page">
      <header className="chat-head">
        <Link href="/" className="back">← Back</Link>
        <h1>SignalBridge Assistant</h1>
        <ThemeToggle />
      </header>

      <main className="chat-scroll">
        <div className="chat-col">
          {messages.length === 0 && (
            <div className="chat-empty">
              <h2>How can I help{location ? ` near ${location.label}` : ""}?</h2>
              <p className="muted">Answers come from checked local sources, with links and timestamps.</p>
              {SUGGESTED.map((q) => <button key={q} className="suggest" onClick={() => send(q)}>{q}</button>)}
            </div>
          )}
          {messages.map((m) => <MessageBubble key={m.id} message={m} />)}
          {busy && <p className="muted small" aria-live="polite">{status}</p>}
          <div ref={endRef} />
        </div>
      </main>

      <div className="chat-foot">
        <div className="chat-col">
          {speech.error && <p className="error small" role="alert">{speech.error}</p>}
          <ChatComposer disabled={busy} listening={speech.listening} transcript={speech.transcript}
            micSupported={speech.supported} onSend={send}
            onMicToggle={() => (speech.listening ? speech.stop() : speech.start())} />
        </div>
      </div>
    </div>
  );
}
