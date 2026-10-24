import type { EmergencyPacket } from "./schema";

export const samplePacket: EmergencyPacket = {
  version: 1,
  incidentId: "demo-wildfire-001",
  downloadedAt: "2026-10-24T22:10:00Z",
  lastSyncAttemptAt: "2026-10-24T22:10:00Z",
  syncStatus: "fresh",
  sources: [
    {
      id: "county-emergency",
      name: "County Emergency Management",
      url: "http://localhost:3001/county-emergency/",
      lastSuccessfulFetchAt: "2026-10-24T22:10:00Z",
    },
    {
      id: "shelter-status",
      name: "Shelter Status Page",
      url: "http://localhost:3001/shelter-status/",
      lastSuccessfulFetchAt: "2026-10-24T22:10:00Z",
    },
    {
      id: "transportation-alerts",
      name: "Transportation Alerts",
      url: "http://localhost:3001/transportation-alerts/",
      lastSuccessfulFetchAt: "2026-10-24T22:10:00Z",
    },
  ],
  shelters: [
    {
      id: "marina-shelter",
      name: "Marina Community Shelter",
      latitude: 37.805,
      longitude: -122.432,
      status: "open",
      petsAllowed: true,
      wheelchairAccessible: true,
      capacity: 38,
      sourceId: "shelter-status",
      sourceUpdatedAt: "2026-10-24T22:08:00Z",
      observedAt: "2026-10-24T22:10:00Z",
      staleAfterMinutes: 30,
    },
    {
      id: "bayview-shelter",
      name: "Bayview Community Shelter",
      latitude: 37.729,
      longitude: -122.391,
      status: "open",
      petsAllowed: true,
      wheelchairAccessible: false,
      capacity: 60,
      sourceId: "shelter-status",
      sourceUpdatedAt: "2026-10-24T22:08:00Z",
      observedAt: "2026-10-24T22:10:00Z",
      staleAfterMinutes: 30,
    },
  ],
  roadClosures: [
    {
      id: "highway-12",
      description: "Highway 12 closed due to flooding",
      status: "closed",
      sourceId: "transportation-alerts",
      observedAt: "2026-10-24T22:10:00Z",
    },
  ],
  conflicts: [],
};
