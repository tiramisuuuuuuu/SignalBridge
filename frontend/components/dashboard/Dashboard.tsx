"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import type { UserLocation } from "@/types";
import Header from "@/components/layout/Header";
import StatusBar from "@/components/layout/StatusBar";
import AlertsRow from "@/components/alerts/AlertsRow";
import LiveTicker from "@/components/updates/LiveTicker";
import UpdatesFeed from "@/components/updates/UpdatesFeed";
import { loadUpdates, loadCachedUpdates, type UpdatesData } from "@/lib/updates";
import { loadPlaces, loadCachedPlaces, loadLastPlaces, type PlacesData } from "@/lib/places";
import OfflineMaps from "@/components/offline/OfflineMaps";
import type { OfflineArea } from "@/lib/offline";
import SignalMap, { type MapPoint } from "@/components/map/SignalMap";
import ChatPanel from "@/components/chat/ChatPanel";
import { API, loadCachedPacket, loadPacket, syncPacket, packetToAlerts, describeChange, loadLive, loadCachedLive, type Packet, type Change, type LiveData } from "@/lib/api";

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
  // Exact device location stays on this device; the backend only gets ~1 km rounded coordinates.
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"pending" | "granted" | "denied" | "unavailable">("pending");
  // Only ask for location when the user chose "Use my current location" (that choice saves coordinates).
  const [useGpsMode, setUseGpsMode] = useState(location.lat != null);
  const prevLabel = useRef(location.label);
  useEffect(() => {
    if (!useGpsMode) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) { setGpsStatus("unavailable"); return; }
    const get = () => navigator.geolocation.getCurrentPosition(
      (pos) => { setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }); setGpsStatus("granted"); },
      (err) => setGpsStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
    get();
    const t = setInterval(get, 5 * 60_000);
    return () => clearInterval(t);
  }, [useGpsMode]);
  // Picking a city in the header switches to that city; "Use my current location" switches back.
  useEffect(() => {
    if (location.label !== prevLabel.current) { prevLabel.current = location.label; setUseGpsMode(location.lat != null); }
  }, [location.label]);
  const gpsActive = useGpsMode && gpsStatus === "granted" && !!gps;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const updatesLoc = gpsActive && gps ? { ...location, label: "Your location", lat: r2(gps.lat), lng: r2(gps.lng) } : location;
  const [updates, setUpdates] = useState<UpdatesData | null>(null);
  const [updatesSaved, setUpdatesSaved] = useState(false);
  const [updatesLoading, setUpdatesLoading] = useState(false);
  const [updatesError, setUpdatesError] = useState<string | null>(null);

  // Worldwide live updates for the chosen location; refresh every 2 minutes, saved for offline.
  useEffect(() => {
    let alive = true;
    const saved = loadCachedUpdates(updatesLoc.label);
    setUpdates(saved);
    setUpdatesSaved(!!saved);
    const run = () => {
      setUpdatesLoading(true);
      loadUpdates(updatesLoc)
        .then((d) => { if (alive) { setUpdates(d); setUpdatesSaved(false); setUpdatesError(null); } })
        .catch((e) => { if (alive) setUpdatesError(String(e?.message ?? e)); })
        .finally(() => { if (alive) setUpdatesLoading(false); });
    };
    run();
    const t = setInterval(run, 2 * 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") run(); };
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updatesLoc.label, updatesLoc.lat, updatesLoc.lng]);
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

  const mapCenter = gpsActive && gps ? { lat: gps.lat, lng: gps.lng }
    : updates?.place ? { lat: updates.place.lat, lng: updates.place.lng } : null;
  const [places, setPlaces] = useState<PlacesData | null>(null);
  const [offlineArea, setOfflineArea] = useState<OfflineArea | null>(null);
  const pk = mapCenter ? `${mapCenter.lat.toFixed(2)},${mapCenter.lng.toFixed(2)}` : "";
  useEffect(() => { setPlaces((cur) => cur ?? loadLastPlaces()); }, []);
  useEffect(() => {
    if (!pk) return;
    let alive = true;
    const [la, lo] = pk.split(",").map(Number);
    const saved = loadCachedPlaces(la, lo);
    if (saved) setPlaces(saved);
    loadPlaces(la, lo, 5).then((d) => { if (alive) setPlaces(d); }).catch(() => { /* keep saved */ });
    return () => { alive = false; };
  }, [pk]);

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
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    const t = setInterval(refresh, 60_000);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [apply, refresh]);

  // Live push: the server announces changes the moment it detects them.
  useEffect(() => {
    let es: EventSource | null = null;
    try { es = new EventSource(`${API}/api/events`); } catch { return; }
    es.onmessage = (e) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let d: any;
      try { d = JSON.parse(e.data); } catch { return; }
      if (d.type !== "changes" || !d.changes?.length) return;
      loadPacket().then((p) => {
        apply(p);
        setChanges(d.changes);
        setOffline(false);
        const text = (d.changes as Change[]).filter((c) => c.type === "shelter_status").map((c) => describeChange(c, p)).join(". ");
        if (text) window.dispatchEvent(new CustomEvent("signalbridge:alert", { detail: `Heads up. ${text}.` }));
      }).catch(() => {});
    };
    return () => es?.close();
  }, [apply]);

  const geoLoc = live?.place ? { ...location, lat: live.place.lat, lng: live.place.lng } : location;
  const alerts = packetToAlerts(packet, geoLoc);

  const statusColor = (st: string) => (st === "open" ? "#3fb950" : st === "full" || st === "closed" ? "#f85149" : "#e0a800");
  const mapPoints: MapPoint[] = [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(packet?.shelters ?? []).map((s: any) => ({
      lat: s.latitude, lng: s.longitude, color: statusColor(s.status),
      title: `${s.name} (demo)`,
      detail: `Status: ${String(s.status).toUpperCase()}${s.capacity != null ? ` · Capacity ${s.capacity}` : ""}`,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(live?.shelters ?? []).filter((s: any) => s.latitude != null).map((s: any) => ({
      lat: s.latitude, lng: s.longitude, color: "#58a6ff",
      title: s.name, detail: `FEMA open shelter · ${s.address}`,
    })),
  ];

  return (
    <div className="shell">
      <Header location={location} onChange={onChangeLocation} />
      {offline && (
        <div style={{ ...banner, borderLeft: "4px solid var(--high)" }}>
          <strong>Offline.</strong> Showing saved information
          {packet?.downloadedAt ? ` from ${new Date(packet.downloadedAt).toLocaleTimeString()}` : ""}. It may be out of date.
        </div>
      )}
      <LiveTicker data={updates} loading={updatesLoading} saved={updatesSaved || offline} />
      {changes.length > 0 && (
        <div style={{ ...banner, borderLeft: "4px solid var(--accent)" }}>
          <strong>Updated since your last check:</strong>
          <ul style={{ margin: "0.4rem 0 0.4rem 1.2rem" }}>
            {changes.map((c, i) => <li key={i}>{describeChange(c, packet)}</li>)}
          </ul>
          <button onClick={() => setChanges([])} style={{ padding: "0.3rem 0.7rem", borderRadius: 999, border: "1px solid var(--line)", background: "transparent", color: "inherit", cursor: "pointer" }}>Dismiss</button>
        </div>
      )}
      <div style={{ margin: "0 1rem" }}>
        <span className="muted small">{syncing || updatesLoading ? "Updating…" : "Updates automatically"}</span>
          {!gpsActive && gpsStatus !== "denied" && gpsStatus !== "unavailable" && (
            <button onClick={() => setUseGpsMode(true)}
              style={{ marginLeft: "0.5rem", padding: "0.45rem 0.9rem", borderRadius: 999, border: "1px solid var(--line)", background: "var(--surface)", color: "inherit", cursor: "pointer" }}>
              📍 Use my current location
            </button>
          )}
          {gpsStatus === "denied" && <span className="muted small" style={{ marginLeft: "0.75rem" }}>Location access denied, so showing {location.label}.</span>}
      </div>
      <div className="main">
        <div>
          <SignalMap me={mapCenter} accuracy={gpsActive ? gps?.accuracy : undefined} isGps={gpsActive} places={offline && offlineArea?.places?.length ? offlineArea.places : (places?.places ?? [])} showPlaces={offline} offlineArea={offlineArea} />
          <OfflineMaps center={mapCenter} online={!offline} onArea={setOfflineArea} />
          <UpdatesFeed data={updates} loading={updatesLoading} saved={updatesSaved || offline} error={updatesError} query={location.label} />
          <div style={{ marginTop: "1.5rem" }}>
            <h3 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>Demo scenario (simulated data)</h3>
            <AlertsRow alerts={alerts} />
          </div>
        </div>
        <ChatPanel
          locationLabel={location.label}
          onOpen={(q) => router.push(q ? `/chat?q=${encodeURIComponent(q)}` : "/chat")}
        />
      </div>
      <StatusBar sources={packet?.sources?.length ?? 0} updatedAt={packet?.downloadedAt ?? new Date().toISOString()} />
    </div>
  );
}
