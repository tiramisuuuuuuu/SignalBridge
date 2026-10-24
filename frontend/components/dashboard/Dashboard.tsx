"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import type { UserLocation } from "@/types";
import Header from "@/components/layout/Header";
import StatusBar from "@/components/layout/StatusBar";
import AlertsRow from "@/components/alerts/AlertsRow";
import LiveOfficial from "@/components/live/LiveOfficial";
import ChatPanel from "@/components/chat/ChatPanel";
import { loadCachedPacket, loadPacket, syncPacket, packetToAlerts, describeChange, loadLive, loadCachedLive, type Packet, type Change, type LiveData } from "@/lib/api";

const banner: CSSProperties = {
  margin: "0.5rem 1rem", padding: "0.6rem 0.9rem", borderRadius: 8,
  border: "1px solid var(--line)", background: "var(--surface)",
};

export default function Dashboard({ location, onChangeLocation }: { location: UserLocation; onChangeLocation: () => void }) {
  const router = useRouter();
  const [packet, setPacket] = useState<Packet | null>(null);
  const [offline, setOffline] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [changes, setChanges] = useState<Change[]>([]);
  const versionRef = useRef<number | undefined>(undefined);
  const [live, setLive] = useState<LiveData | null>(null);
  const [liveSaved, setLiveSaved] = useState(false);
  const [liveLoading, setLiveLoading] = useState(false);

  // Real official data for the chosen location (saved for offline use).
  useEffect(() => {
    const saved = loadCachedLive(location.label);
    setLive(saved);
    setLiveSaved(!!saved);
    setLiveLoading(true);
    loadLive(location)
      .then((d) => { setLive(d); setLiveSaved(false); })
      .catch(() => { /* keep saved copy */ })
      .finally(() => setLiveLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.label, location.lat, location.lng]);

  const apply = useCallback((p: Packet | null) => {
    if (!p) return;
    setPacket(p);
    versionRef.current = p.version;
  }, []);

  const refresh = useCallback(async () => {
    setSyncing(true);
    try {
      const r = await syncPacket(versionRef.current);
      if (r.changes.length) setChanges(r.changes);
      apply(r.packet);
      setOffline(false);
    } catch {
      try { apply(await loadPacket()); setOffline(false); }
      catch { setOffline(true); }
    } finally {
      setSyncing(false);
    }
  }, [apply]);

  useEffect(() => {
    apply(loadCachedPacket());
    refresh();
    const onOffline = () => setOffline(true);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", onOffline);
    };
  }, [apply, refresh]);

  const geoLoc = live?.place ? { ...location, lat: live.place.lat, lng: live.place.lng } : location;
  const alerts = packetToAlerts(packet, geoLoc);

  return (
    <div className="shell">
      <Header location={location} onChange={onChangeLocation} />
      {offline && (
        <div style={{ ...banner, borderLeft: "4px solid var(--high)" }}>
          <strong>Offline.</strong> Showing saved information
          {packet?.downloadedAt ? ` from ${new Date(packet.downloadedAt).toLocaleTimeString()}` : ""}. It may be out of date.
        </div>
      )}
      {changes.length > 0 && (
        <div style={{ ...banner, borderLeft: "4px solid var(--accent)" }}>
          <strong>Updated since your last check:</strong>
          <ul style={{ margin: "0.4rem 0 0.4rem 1.2rem" }}>
            {changes.map((c, i) => <li key={i}>{describeChange(c, packet)}</li>)}
          </ul>
          <button onClick={() => setChanges([])} style={{ padding: "0.3rem 0.7rem", borderRadius: 999, border: "1px solid var(--line)", background: "transparent", color: "inherit", cursor: "pointer" }}>Dismiss</button>
        </div>
      )}
      <AlertsRow alerts={alerts} />
      <div style={{ margin: "0 1rem" }}>
        <button onClick={refresh} disabled={syncing} style={{ padding: "0.45rem 0.9rem", borderRadius: 999, border: "1px solid var(--line)", background: "var(--surface)", color: "inherit", cursor: "pointer", opacity: syncing ? 0.6 : 1 }}>{syncing ? "Checking…" : "Check for updates"}</button>
      </div>
      <div className="main">
        <LiveOfficial live={live} loading={liveLoading} saved={liveSaved} />
        <ChatPanel
          locationLabel={location.label}
          onOpen={(q) => router.push(q ? `/chat?q=${encodeURIComponent(q)}` : "/chat")}
        />
      </div>
      <StatusBar sources={packet?.sources?.length ?? 0} updatedAt={packet?.downloadedAt ?? new Date().toISOString()} />
    </div>
  );
}
