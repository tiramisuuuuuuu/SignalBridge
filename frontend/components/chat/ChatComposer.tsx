"use client";
import { useState } from "react";

interface Props {
  disabled: boolean;
  listening: boolean;
  transcript: string;
  micSupported: boolean;
  onSend: (text: string) => void;
  onMicToggle: () => void;
}

export default function ChatComposer({ disabled, listening, transcript, micSupported, onSend, onMicToggle }: Props) {
  const [value, setValue] = useState("");
  const submit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!value.trim() || disabled) return;
    onSend(value.trim());
    setValue("");
  };
  return (
    <form className="composer" onSubmit={submit}>
      {listening && <p className="listening" aria-live="polite">Listening… {transcript && <q>{transcript}</q>}</p>}
      <div className="composer-row">
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Ask a question…" aria-label="Ask a question" />
        {micSupported && (
          <button type="button" className={`btn icon ${listening ? "rec" : ""}`} onClick={onMicToggle}
            aria-label={listening ? "Stop listening" : "Start voice input"} aria-pressed={listening}>🎙</button>
        )}
        <button type="submit" className="btn icon send" disabled={disabled || !value.trim()} aria-label="Send">➤</button>
      </div>
    </form>
  );
}
