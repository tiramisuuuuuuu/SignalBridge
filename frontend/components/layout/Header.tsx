import type { UserLocation } from "@/types";
import ThemeToggle from "./ThemeToggle";

export default function Header({ location, onChange }: { location: UserLocation; onChange: () => void }) {
  return (
    <header className="header">
      <span className="brand">SignalBridge</span>
      <button className="loc" onClick={onChange} aria-label="Change location">{location.label} ▾</button>
      <span className="muted radius">Radius: {location.radiusMiles} miles</span>
      <ThemeToggle />
    </header>
  );
}
