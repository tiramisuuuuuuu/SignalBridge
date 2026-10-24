"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function useSpeech(onFinal: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const rec = useRef<any>(null);
  const cb = useRef(onFinal);
  cb.current = onFinal;

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    setSupported(true);
    const r = new SR();
    r.lang = "en-US"; r.interimResults = true; r.continuous = false;
    r.onresult = (e: any) => {
      const text = Array.from(e.results).map((x: any) => x[0].transcript).join("");
      setTranscript(text);
      if (e.results[e.results.length - 1].isFinal) { setListening(false); setTranscript(""); cb.current(text.trim()); }
    };
    r.onerror = (e: any) => {
      setListening(false);
      if (e.error === "aborted") return;
      setError(
        e.error === "not-allowed" ? "Microphone access was blocked. Allow it in your browser settings."
        : e.error === "no-speech" ? "I didn't hear anything. Tap the mic and try again."
        : "Couldn't hear that. Try again."
      );
    };
    r.onend = () => setListening(false);
    rec.current = r;
    return () => { r.onresult = r.onerror = r.onend = null; try { r.abort(); } catch {} };
  }, []);

  const start = useCallback(() => {
    if (!rec.current) return;
    setError(""); setTranscript(""); setListening(true);
    try { rec.current.start(); } catch { /* already running */ }
  }, []);
  const stop = useCallback(() => rec.current?.stop(), []);
  return { supported, listening, transcript, error, start, stop };
}
