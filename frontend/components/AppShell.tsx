"use client";
import { useLocation } from "@/hooks/useLocation";
import LocationSetup from "@/components/onboarding/LocationSetup";
import Dashboard from "@/components/dashboard/Dashboard";

export default function AppShell() {
  const { location, ready, update, reset } = useLocation();
  if (!ready) return null;
  return location
    ? <Dashboard location={location} onChangeLocation={reset} />
    : <LocationSetup onDone={update} />;
}
