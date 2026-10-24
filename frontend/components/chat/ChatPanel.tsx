"use client";

const SUGGESTED = [
  "Are any roads near me closed?",
  "What disasters are near me?",
  "Find a nearby shelter.",
  "What local news affects me?",
];

// Compact panel. Clicking the input or a suggestion should open the full-screen chat (next milestone).
export default function ChatPanel({ onOpen }: { onOpen: (prefill?: string) => void }) {
  return (
    <aside className="chat" aria-label="Ask SignalBridge">
      <h2>Ask SignalBridge</h2>
      <div className="chat-input">
        <input readOnly placeholder="How can we help?" onClick={() => onOpen()} aria-label="Ask a question" />
        <button className="btn icon" onClick={() => onOpen()} aria-label="Use voice input">🎙</button>
      </div>
      <p className="muted small">Suggested</p>
      <ul>
        {SUGGESTED.map((q) => (
          <li key={q}><button className="suggest" onClick={() => onOpen(q)}>{q}</button></li>
        ))}
      </ul>
    </aside>
  );
}
