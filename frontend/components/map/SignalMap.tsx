"use client";
import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LMap, LayerGroup } from "leaflet";
import type { Place } from "@/lib/places";

export const PLACE_META: Record<string, [string, string]> = {
  medical: ["🏥", "Medical"],
  pharmacy: ["💊", "Pharmacy"],
  grocery: ["🛒", "Grocery"],
  shelter: ["🏠", "Shelter"],
  fire_police: ["🚒", "Fire/Police"],
};

// Popup built from DOM text nodes: text from external sources is never parsed as HTML.
function popup(p: Place, me: { lat: number; lng: number } | null) {
  const box = document.createElement("div");
  box.style.minWidth = "210px";
  const add = (text: string, bold = false) => {
    if (!text) return;
    const d = document.createElement(bold ? "strong" : "div");
    d.textContent = text;
    d.style.display = "block";
    box.appendChild(d);
  };
  const [icon, label] = PLACE_META[p.category] ?? ["📍", p.category];
  add(p.name, true);
  add(`${icon} ${label} · ${p.distanceMiles} mi away`);
  add(p.address);
  if (p.openingHours) add(`Hours: ${p.openingHours}`);
  if (p.phone) add(`Phone: ${p.phone}`);
  const links = document.createElement("div");
  links.style.marginTop = "0.4rem";
  const link = (href: string, text: string) => {
    const a = document.createElement("a");
    a.href = href; a.target = "_blank"; a.rel = "noreferrer"; a.textContent = text;
    a.style.marginRight = "0.75rem";
    links.appendChild(a);
  };
  link(`https://www.google.com/search?q=${encodeURIComponent([p.name, p.address].filter(Boolean).join(" "))}`, "Google search ↗");
  link(`https://www.google.com/maps/dir/?api=1${me ? `&origin=${me.lat},${me.lng}` : ""}&destination=${p.lat},${p.lng}`, "Directions ↗");
  link(p.osmUrl, "Source ↗");
  box.appendChild(links);
  return box;
}

export default function SignalMap({ me, accuracy, isGps, places, showPlaces }: {
  me: { lat: number; lng: number } | null;
  accuracy?: number;
  isGps: boolean;
  places: Place[];
  showPlaces: boolean; // true when offline: show saved essentials
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const lastCenter = useRef("");
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState<Record<string, boolean>>({ medical: true, pharmacy: true, grocery: true, shelter: true, fire_police: true });

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !elRef.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(elRef.current).setView([20, 0], 2);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setReady(true);
    });
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  const sig = JSON.stringify({ me, accuracy, isGps, showPlaces, n: places.length, first: places[0]?.id, enabled });
  useEffect(() => {
    const L = LRef.current, map = mapRef.current, layer = layerRef.current;
    if (!ready || !L || !map || !layer) return;
    layer.clearLayers();
    if (me) {
      if (isGps && accuracy) L.circle([me.lat, me.lng], { radius: accuracy, color: "#58a6ff", weight: 1, fillOpacity: 0.1 }).addTo(layer);
      L.circleMarker([me.lat, me.lng], { radius: 8, color: "#ffffff", weight: 3, fillColor: "#1f6feb", fillOpacity: 1 })
        .bindPopup(isGps ? "You are here" : "Selected area").addTo(layer);
    }
    if (showPlaces) {
      for (const p of places) {
        if (!enabled[p.category]) continue;
        const [icon] = PLACE_META[p.category] ?? ["📍"];
        const ic = L.divIcon({ html: `<span style="font-size:20px;line-height:24px">${icon}</span>`, className: "sb-pin", iconSize: [24, 24], iconAnchor: [12, 12] });
        L.marker([p.lat, p.lng], { icon: ic }).bindPopup(popup(p, isGps ? me : null)).addTo(layer);
      }
    }
    const c = me ? `${me.lat.toFixed(3)},${me.lng.toFixed(3)}` : "";
    if (me && c !== lastCenter.current) { lastCenter.current = c; map.setView([me.lat, me.lng], 14); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, sig]);

  const count = (cat: string) => places.filter((p) => p.category === cat).length;

  return (
    <div style={{ marginBottom: "1rem" }}>
      {showPlaces && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
          {Object.entries(PLACE_META).map(([cat, [icon, label]]) => (
            <button key={cat} onClick={() => setEnabled((e) => ({ ...e, [cat]: !e[cat] }))}
              style={{ padding: "0.3rem 0.7rem", borderRadius: 999, cursor: "pointer", color: "inherit",
                border: "1px solid var(--line)", background: enabled[cat] ? "var(--surface)" : "transparent", opacity: enabled[cat] ? 1 : 0.5 }}>
              {icon} {label} ({count(cat)})
            </button>
          ))}
        </div>
      )}
      <div ref={elRef} style={{ height: 360, borderRadius: 12, overflow: "hidden", border: "1px solid var(--line)" }} />
      <p className="muted small" style={{ margin: "0.4rem 0 0" }}>
        {showPlaces
          ? `Offline: showing ${places.length} saved places (shelters, medical, grocery and more). Tap a pin for details.`
          : isGps ? "📍 Your exact location. It stays on this device." : "📍 Showing the selected area."}
      </p>
    </div>
  );
}
