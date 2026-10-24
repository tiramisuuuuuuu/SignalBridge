"use client";
import { useState } from "react";
import { useSpeech } from "@/hooks/useSpeech";

const SUGGESTED = [
  "Are any roads near me closed?",
  "What disasters are near me?",
  "Find a nearby shelter.",
  "What local news affects me?",
];

interface Props {
  locationLabel: string;
  onOpen: (question?: string) => void; // opens the full-screen chat, optionally sending a question
}

// Compact chatbot widget. Sending a message (typed, suggested, or spoken) opens the full chat page.
export default function ChatPanel({ locationLabel, onOpen }: Props) {
  const [value, setValue] = useState("");
  // Recording starts here, directly from the click, so the browser allows microphone access.
  const speech = useSpeech((text) => text && onOpen(text));

  const submit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (value.trim()) onOpen(value.trim());
  };

  return (
    <aside className="panel" aria-label="Ask SignalBridge">
      <header className="panel-head">
        <span className="avatar" aria-hidden>SB</span>
        <div>
          <h2>Ask SignalBridge</h2>
          <p className="muted small"><span className="dot" /> Checks local sources</p>
        </div>
      </header>

      <div className="panel-body">
        <div className="msg theirs">
          <p className="msg-text">
            Hi! I can check road closures, disasters, and shelters near {locationLabel}. What would you like to know?
          </p>
        </div>
        <div className="chips" aria-label="Suggested questions">
          {SUGGESTED.map((q) => (
            <button key={q} className="chip" onClick={() => onOpen(q)}>{q}</button>
          ))}
        </div>
      </div>

      <form className="panel-foot" onSubmit={submit}>
        {speech.listening && (
          <p className="listening" aria-live="polite">Listening… {speech.transcript && <q>{speech.transcript}</q>}</p>
        )}
        {speech.error && <p className="error small" role="alert">{speech.error}</p>}
        <div className="composer-row">
          <input value={value} onChange={(e) => setValue(e.target.value)}
            placeholder="Type your question…" aria-label="Type your question" />
          {speech.supported && (
            <button type="button" className={`btn icon ${speech.listening ? "rec" : ""}`}
              onClick={() => (speech.listening ? speech.stop() : speech.start())}
              aria-label={speech.listening ? "Stop listening" : "Start voice input"} aria-pressed={speech.listening}>🎙</button>
          )}
          <button type="submit" className="btn icon send" disabled={!value.trim()} aria-label="Send">➤</button>
        </div>
      </form>
    </aside>
  );
}
