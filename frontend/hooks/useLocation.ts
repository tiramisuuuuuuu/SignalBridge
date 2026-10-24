"use client";
import { useEffect, useState } from "react";
import type { UserLocation } from "@/types";
import { clearLocation, loadLocation, saveLocation } from "@/lib/storage";

export function useLocation() {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => { 
    setLocation(loadLocation()); 
    setReady(true); 
  }, []);

  const update = (loc: UserLocation) => { saveLocation(loc); setLocation(loc); };
  const reset = () => { clearLocation(); setLocation(null); };
  return { location, ready, update, reset };
}
