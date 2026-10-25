"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  cleanupOldAreas, daysLeft, deleteAllAreas, downloadArea, getConsent, latestArea, needsUpdate, setConsent,
  type Consent, type OfflineArea,
} from "@/lib/offline";
import { ago } from "@/lib/updates";

const card: CSSProperties = { border: "1px solid var(--line)", background: "var(--surface)", borderRadius: 12, padding: "0.8rem 1rem", margin: "0.5rem 0 1rem" };
const btn: CSSProperties = { padding: "0.35rem 0.8rem", borderRadius: 999, border: "1px solid var(--line)", background: "transparent", color: "inherit", cursor: "pointer", marginRight: "0.5rem" };

export default function OfflineMaps({ center, online, onArea }: {
  center: { lat: number; lng: number } | null;
  online: boolean;
  onArea: (a: OfflineArea | null) => void;
}) {
  const [consent, setC] = useState<Consent>("no");
  const [area, setArea] = useState<OfflineArea | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    setC(getConsent());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setIsIOS(/iPhone|iPad|iPod/.test(navigator.userAgent) && !(window.navigator as any).standalone);
    cleanupOldAreas().then(latestArea).then((a) => { setArea(a); onArea(a); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (force = false) => {
    if (!center || busy.current || !online) return;
    if (!force && !needsUpdate(area, center)) return;
    busy.current = true;
    setError(null);
    try {
      const a = await downloadArea(center, setStatus);
      setArea(a);
      onArea(a);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      busy.current = false;
      setStatus(null);
    }
  };

  const key = center ? `${center.lat.toFixed(2)},${center.lng.toFixed(2)}` : "";
  useEffect(() => {
    if (consent === "yes") run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consent, key, online]);

  if (consent === null && online && center) {
    return (
      <div style={card}>
        <strong>Save offline maps for emergencies?</strong>
        <p className="small" style={{ margin: "0.4rem 0" }}>
          Downloads about 20–60 MB: a map of the 50 miles around you, plus shelters, medical and grocery locations.
          It updates automatically when you move, stays on this device, and is deleted after 30 days.
        </p>
        <button style={{ ...btn, background: "var(--accent)" }} onClick={() => { setConsent("yes"); setC("yes"); }}>Save offline maps</button>
        <button style={btn} onClick={() => { setConsent("notnow"); setC("no"); }}>Not now</button>
      </div>
    );
  }

  return (
    <div className="small" style={{ margin: "0.25rem 0 1rem" }}>
      {status && <div>⏳ {status}</div>}
      {error && <div style={{ color: "var(--high)" }}>Couldn&apos;t save offline map: {error}</div>}
      {area && !status && (
        <div className="muted">
          📥 Offline map saved: {(area.bytes / 1e6).toFixed(0)} MB · 50 miles around this area · {area.places.length} places
          {area.placesRadius ? ` within ${area.placesRadius} mi` : ""} · saved {ago(area.createdAt)} · deletes in {daysLeft(area)} days{" "}
          {online && <button style={btn} onClick={() => run(true)}>Update now</button>}
          <button style={btn} onClick={() => { deleteAllAreas().then(() => { setArea(null); onArea(null); }); }}>Delete</button>
          {consent === "yes" && <button style={btn} onClick={() => { setConsent("off"); setC("no"); }}>Turn off</button>}
        </div>
      )}
      {!area && !status && consent === "no" && online && (
        <button style={btn} onClick={() => { setConsent("yes"); setC("yes"); }}>📥 Save offline maps</button>
      )}
      {isIOS && area && <div className="muted">Tip: on iPhone, use Share → Add to Home Screen so your offline map is kept.</div>}
    </div>
  );
}
