"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { API } from "@/lib/api";
import { askChat, type ChatTurn } from "@/lib/chat";
import { loadLocation } from "@/lib/storage";
import { speak, speechText, stopSpeaking } from "@/lib/voice";

// "Hey Bridge": hands-free voice agent.
// Ears: Cartesia Ink-2 realtime STT with turn detection (+ keyterms). Voice: Cartesia Sonic TTS.
// Listens only while SignalBridge is open and visible, after the user turns it on once.

type Phase = "off" | "confirm" | "starting" | "idle" | "listening" | "thinking" | "speaking" | "paused" | "error";
const KEY = "signalbridge.handsfree";
const WAKE = /\b(?:hey|hi|okay|ok|hay|a)[,.!\s]+(?:signal\s*)?bridge\b[,.!?\s]*/i;
const STOP = /^(stop|cancel|never ?mind|good ?bye|bye|thanks?|thank you|that'?s all|that is all)\b/i;
const READ = /^(please\s+)?(read( (it|that|this|the (last|previous) (answer|response)|again))?( out)?( loud| aloud)?( again)?|say (it|that) again|repeat (it|that))[.!?\s]*$/i;
const FOLLOW_UP_MS = 15000;

export default function VoiceAgent() {
  const [phase, setPhase] = useState<Phase>("off");
  const [heard, setHeard] = useState("");
  const [answer, setAnswer] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const phaseRef = useRef<Phase>("off");
  const enabled = useRef(false);
  const closing = useRef(false);
  const ws = useRef<WebSocket | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const node = useRef<ScriptProcessorNode | null>(null);
  const awakeUntil = useRef(0);
  const speaking = useRef(false);
  const ignoreUntil = useRef(0);
  const lastLoud = useRef(0);
  const history = useRef<ChatTurn[]>([]);
  const lastAnswer = useRef("");
  const done = useRef<(() => void) | null>(null);

  const setP = (p: Phase) => { phaseRef.current = p; setPhase(p); };

  // Speak with Cartesia; resolves when finished or interrupted.
  function say(text: string) {
    done.current?.();
    speaking.current = true;
    setP("speaking");
    return new Promise<void>((resolve) => {
      const finish = () => {
        if (done.current === finish) done.current = null;
        speaking.current = false;
        ignoreUntil.current = Date.now() + 700; // don't treat our own echo as a question
        resolve();
      };
      done.current = finish;
      speak(text, finish);
    });
  }
  function interrupt() { stopSpeaking(); done.current?.(); }

  function chime() {
    const ac = ctx.current;
    if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.value = 880; g.gain.value = 0.05;
    o.connect(g); g.connect(ac.destination);
    o.start(); o.stop(ac.currentTime + 0.12);
  }

  async function handleTurn(raw: string) {
    const text = raw.trim();
    if (!text || speaking.current || Date.now() < ignoreUntil.current) return;
    const awake = Date.now() < awakeUntil.current;
    const m = text.match(WAKE);
    if (!awake && !m) return; // not talking to us
    const q = m ? text.slice((m.index ?? 0) + m[0].length).trim() : text;
    setHeard(text);
    setErr(null);

    if (!q) {
      await say("I'm listening.");
      awakeUntil.current = Date.now() + FOLLOW_UP_MS;
      setP("listening");
      return;
    }
    if (STOP.test(q)) {
      awakeUntil.current = 0;
      await say("Okay. Say Hey Bridge anytime you need me.");
      setP("idle");
      return;
    }
    if (READ.test(q)) {
      await say(lastAnswer.current || "I haven't answered anything yet. What can I help with?");
      awakeUntil.current = Date.now() + FOLLOW_UP_MS;
      setP("listening");
      return;
    }

    awakeUntil.current = Number.MAX_SAFE_INTEGER; // stay awake while thinking
    setP("thinking");
    chime();
    history.current = [...history.current, { role: "user" as const, content: q }].slice(-10);
    const reply = await askChat(history.current, loadLocation(), "voice");
    history.current = [...history.current, { role: "assistant" as const, content: reply.text }].slice(-10);
    lastAnswer.current = reply.text;
    setAnswer(reply.text);
    await say(reply.text);
    awakeUntil.current = Date.now() + FOLLOW_UP_MS; // follow-ups without the wake word
    setP("listening");
  }

  function teardown() {
    closing.current = true;
    node.current?.disconnect();
    stream.current?.getTracks().forEach((t) => t.stop());
    ctx.current?.close().catch(() => {});
    try { if (ws.current?.readyState === 1) ws.current.send(JSON.stringify({ type: "close" })); } catch { /* ignore */ }
    ws.current?.close();
    ws.current = null; node.current = null; stream.current = null; ctx.current = null;
  }

  async function start() {
    if (ws.current || !enabled.current) return;
    closing.current = false;
    setErr(null);
    setP("starting");
    try {
      const t = await fetch(`${API}/api/voice/token`, { method: "POST" });
      const tj = await t.json();
      if (!t.ok) throw new Error(tj.error ?? `HTTP ${t.status}`);
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const ac = new AudioContext();
      await ac.resume();

      const url = new URL("wss://api.cartesia.ai/stt/turns/websocket");
      const params: Record<string, string> = {
        model: "ink-2", encoding: "pcm_f32le", sample_rate: String(ac.sampleRate),
        cartesia_version: "2026-08-14", access_token: tj.token, turn_end_timeout_ms: "1600",
      };
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
      ["Hey Bridge", "SignalBridge", "Bridge"].forEach((k) => url.searchParams.append("keyterm", k));
      const sock = new WebSocket(url);
      sock.binaryType = "arraybuffer";
      sock.onmessage = (e) => {
        if (typeof e.data !== "string") return;
        let msg: { type?: string; transcript?: string; message?: string; title?: string };
        try { msg = JSON.parse(e.data); } catch { return; }
        if (msg.type === "turn.update") {
          const tr = msg.transcript ?? "";
          if (speaking.current) { if (/\b(stop|wait|hey bridge)\b/i.test(tr)) interrupt(); }
          else if (Date.now() < awakeUntil.current || WAKE.test(tr)) setHeard(tr);
        } else if (msg.type === "turn.end") {
          handleTurn(msg.transcript ?? "");
        } else if (msg.type === "error") {
          setErr(msg.message ?? msg.title ?? "Voice error");
        }
      };
      sock.onclose = () => {
        ws.current = null;
        if (!closing.current && enabled.current && document.visibilityState === "visible") setTimeout(() => start(), 1500); // reconnect with a fresh token
      };

      const src = ac.createMediaStreamSource(s);
      const proc = ac.createScriptProcessor(4096, 1, 1);
      proc.onaudioprocess = (ev) => {
        const data = ev.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < data.length; i += 8) sum += data[i] * data[i];
        if (Math.sqrt(sum / (data.length / 8)) > 0.01) lastLoud.current = Date.now();
        // Voice gate: only stream when someone is talking (plus 2 s), to save credits and bandwidth.
        if (sock.readyState === 1 && Date.now() - lastLoud.current < 2000) sock.send(new Float32Array(data).buffer);
      };
      src.connect(proc);
      proc.connect(ac.destination); // required for processing; output stays silent

      ws.current = sock; ctx.current = ac; stream.current = s; node.current = proc;
      setP(Date.now() < awakeUntil.current ? "listening" : "idle");
    } catch (e) {
      teardown();
      const msg = String((e as Error)?.message ?? e);
      setErr(/Permission|NotAllowed/i.test(msg) ? "Microphone permission was denied. Allow it in the address bar." : msg);
      setP("error");
    }
  }

  function enable() {
    enabled.current = true;
    try { localStorage.setItem(KEY, "on"); } catch { /* ignore */ }
    start();
  }
  function disable() {
    enabled.current = false;
    awakeUntil.current = 0;
    interrupt();
    teardown();
    try { localStorage.setItem(KEY, "off"); } catch { /* ignore */ }
    setP("off");
  }

  useEffect(() => {
    let cancelled = false;
    // Auto-start on later visits if the user turned it on before and the mic is already allowed.
    (async () => {
      try {
        if (localStorage.getItem(KEY) !== "on") return;
        const p = await navigator.permissions.query({ name: "microphone" as PermissionName });
        if (p.state === "granted" && !cancelled) { enabled.current = true; start(); }
      } catch { /* not supported: user taps the button */ }
    })();
    const onVis = () => {
      if (!enabled.current) return;
      if (document.visibilityState === "hidden") { interrupt(); teardown(); setP("paused"); }
      else start();
    };
    document.addEventListener("visibilitychange", onVis);
    const t = setInterval(() => {
      if (phaseRef.current === "listening" && Date.now() > awakeUntil.current) setP("idle");
    }, 1000);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(t);
      enabled.current = false;
      interrupt();
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- UI: floating indicator (bottom-right) ----
  const wrap: CSSProperties = { position: "fixed", right: 16, bottom: 16, zIndex: 1000, maxWidth: 340, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 };
  const pill: CSSProperties = { display: "flex", alignItems: "center", gap: 8, padding: "0.55rem 0.9rem", borderRadius: 999, border: "1px solid var(--line)", background: "var(--surface)", color: "inherit", boxShadow: "0 4px 16px rgba(0,0,0,0.25)" };
  const small: CSSProperties = { padding: "0.25rem 0.6rem", borderRadius: 999, border: "1px solid var(--line)", background: "transparent", color: "inherit", cursor: "pointer" };
  const dot = (c: string) => <span style={{ width: 9, height: 9, borderRadius: 999, background: c, display: "inline-block" }} />;
  const label: Record<Phase, string> = {
    off: "", confirm: "", starting: "Starting voice…", idle: "Say “Hey Bridge”", listening: "Listening…",
    thinking: "Thinking…", speaking: "Speaking…", paused: "Paused (tab in background)", error: "Voice unavailable",
  };
  const color: Partial<Record<Phase, string>> = { idle: "#3fb950", listening: "#58a6ff", thinking: "#e0a800", speaking: "#a371f7", paused: "#8b949e", starting: "#8b949e", error: "var(--high)" };
  const showCard = (phase === "listening" || phase === "thinking" || phase === "speaking") && (heard || answer);

  return (
    <div style={wrap} aria-live="polite">
      {phase === "confirm" && (
        <div style={{ ...pill, borderRadius: 14, flexDirection: "column", alignItems: "flex-start" }} className="small">
          <strong>Hands-free voice</strong>
          <span>Say “Hey Bridge” instead of tapping, useful when you can&apos;t use your hands. It listens only while SignalBridge is open and on screen. Audio is processed by Cartesia while this is on. Turn it off anytime.</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ ...small, background: "var(--accent)" }} onClick={enable}>Turn on</button>
            <button style={small} onClick={() => setP("off")}>Cancel</button>
          </div>
        </div>
      )}
      {showCard && (
        <div style={{ ...pill, borderRadius: 14, flexDirection: "column", alignItems: "flex-start" }} className="small">
          {heard && <span className="muted">You: {heard}</span>}
          {answer && phase !== "listening" && <span>Bridge: {speechText(answer).slice(0, 280)}</span>}
        </div>
      )}
      {err && <div style={{ ...pill, borderRadius: 14, color: "var(--high)" }} className="small">{err}</div>}
      {phase === "off" ? (
        <button style={{ ...pill, cursor: "pointer" }} onClick={() => setP("confirm")} title="Hands-free voice: say Hey Bridge">
          🎙️ <span className="small">Turn on “Hey Bridge”</span>
        </button>
      ) : phase !== "confirm" && (
        <div style={pill}>
          {dot(color[phase] ?? "#8b949e")}
          <span className="small">{label[phase]}</span>
          {phase === "speaking" && <button style={small} className="small" onClick={interrupt}>Stop</button>}
          {phase === "error" && <button style={small} className="small" onClick={() => { enabled.current = true; start(); }}>Retry</button>}
          <button style={small} className="small" onClick={disable} title="Turn off hands-free voice" aria-label="Turn off hands-free voice">✕</button>
        </div>
      )}
    </div>
  );
}
