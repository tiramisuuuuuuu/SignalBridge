"use client";
import { useState } from "react";
import type { UserLocation } from "@/types";

const RADII = [5, 10, 25, 50];

export default function LocationSetup({ onDone }: { onDone: (l: UserLocation) => void }) {
  const [step, setStep] = useState<"choose" | "manual" | "radius">("choose");
  const [text, setText] = useState("");
  const [radius, setRadius] = useState(10);
  const [pending, setPending] = useState<Partial<UserLocation>>({});
  const [error, setError] = useState("");

  const useCurrent = () => {
    if (!navigator.geolocation) return setError("Location isn't available in this browser. Enter a city instead.");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        // Round to ~1 km so we never keep an exact position
        setPending({ label: "Your current area", lat: +p.coords.latitude.toFixed(2), lng: +p.coords.longitude.toFixed(2) });
        setError("");
        setStep("radius");
      },
      () => setError("We couldn't get your location. Enter a city, state, or ZIP code instead.")
    );
  };

  const submitManual = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!text.trim()) return setError("Enter a city, state, or ZIP code.");
    setPending({ label: text.trim() });
    setError("");
    setStep("radius");
  };

  return (
    <main className="setup">
      <div className="setup-card">
        <p className="brand">SignalBridge</p>

        {step === "choose" && (
          <>
            <h1>Welcome to SignalBridge</h1>
            <p className="muted">Get local safety updates, road closures, and news for your area.</p>
            <button className="btn primary" onClick={useCurrent}>Use my current location</button>
            <p className="divider">or</p>
            <button className="btn" onClick={() => setStep("manual")}>Enter city, state, or ZIP code</button>
          </>
        )}

        {step === "manual" && (
          <form onSubmit={submitManual}>
            <h1>Enter location</h1>
            <input className="input" autoFocus value={text} onChange={(e) => setText(e.target.value)}
              placeholder="San Jose, CA" aria-label="City, state, or ZIP code" />
            <button className="btn primary" type="submit">Continue</button>
            <button className="btn ghost" type="button" onClick={() => setStep("choose")}>Back</button>
          </form>
        )}

        {step === "radius" && (
          <>
            <h1>How far should we monitor?</h1>
            <select className="input" value={radius} onChange={(e) => setRadius(+e.target.value)} aria-label="Radius">
              {RADII.map((r) => <option key={r} value={r}>{r} miles</option>)}
            </select>
            <p className="muted">This includes nearby disasters, road closures, and local news.</p>
            <button className="btn primary" onClick={() => onDone({ ...(pending as UserLocation), radiusMiles: radius })}>
              Show my dashboard
            </button>
          </>
        )}

        {error && <p className="error" role="alert">{error}</p>}
        <p className="fine">Only your city or approximate area is saved on this device.</p>
      </div>
    </main>
  );
}
