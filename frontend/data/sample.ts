import type { LiveAlert, NewsArticle } from "@/types";

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

export const sampleAlerts: LiveAlert[] = [
  { id: "d-1", category: "disaster", severity: "high", title: "Wildfire evacuation warning",
    description: "Zone 4 is under an evacuation advisory. Be ready to leave.",
    latitude: 37.2, longitude: -121.9, distanceMiles: 9, sourceName: "County Emergency Management",
    sourceUrl: "https://example.com", updatedAt: ago(4) },
  { id: "r-1", category: "road_closure", severity: "high", title: "Highway 17 closed near Summit Road",
    description: "Reason: fallen trees blocking both directions.",
    latitude: 37.17, longitude: -121.98, distanceMiles: 12, sourceName: "Caltrans",
    sourceUrl: "https://example.com", updatedAt: ago(3) },
  { id: "r-2", category: "road_closure", severity: "medium", title: "Route 9 closed in both directions",
    description: "Expected reopening: unknown.",
    latitude: 37.25, longitude: -122.05, distanceMiles: 15, sourceName: "Caltrans",
    sourceUrl: "https://example.com", updatedAt: ago(12) },
];

const img = (seed: string) => `https://picsum.photos/seed/${seed}/900/500`;

export const sampleNews: NewsArticle[] = [
  { id: "n-1", headline: "Major storm expected to impact Northern California",
    summary: "Local officials are preparing emergency shelters as heavy snow is expected in nearby mountain areas.",
    imageUrl: img("storm"), publisher: "Bay Area News", articleUrl: "https://example.com",
    publishedAt: ago(34), location: "Santa Clara County", scope: "local", topic: "weather" },
  { id: "n-2", headline: "Crews work to clear Highway 17 after tree falls",
    summary: "Caltrans says reopening depends on utility crews reaching the slide area.",
    imageUrl: img("highway"), publisher: "San Jose Ledger", articleUrl: "https://example.com",
    publishedAt: ago(55), location: "Los Gatos", scope: "local", topic: "transportation" },
  { id: "n-3", headline: "Evacuation zones explained: what Zone 4 residents should do",
    summary: "A county guide covers go-bags, pet plans, and where shelters are open.",
    imageUrl: img("evac"), publisher: "County Newsroom", articleUrl: "https://example.com",
    publishedAt: ago(90), location: "Santa Clara County", scope: "local", topic: "public_safety" },
  { id: "n-4", headline: "State declares readiness ahead of early-season storm",
    summary: "Cal OES is positioning crews and equipment across the Sierra and Bay Area.",
    imageUrl: img("state"), publisher: "California Report", articleUrl: "https://example.com",
    publishedAt: ago(150), location: "California", scope: "state", topic: "weather" },
];
