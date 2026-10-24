export type AlertCategory = "disaster" | "road_closure";
export type Severity = "high" | "medium" | "low";

export interface LiveAlert {
  id: string;
  category: AlertCategory;
  severity: Severity;
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  distanceMiles: number;
  sourceName: string;
  sourceUrl: string;
  updatedAt: string; // ISO
}

export type NewsScope = "local" | "state";
export type NewsTopic = "weather" | "transportation" | "public_safety";

export interface NewsArticle {
  id: string;
  headline: string;
  summary: string;
  imageUrl: string;
  publisher: string;
  articleUrl: string;
  publishedAt: string; // ISO
  location: string;
  scope: NewsScope;
  topic: NewsTopic;
}

export interface UserLocation {
  label: string; // "San Jose, California" - never an exact address
  lat?: number;  // rounded approximate coords only
  lng?: number;
  radiusMiles: number;
}

export interface ChatSource { name: string; url: string; updatedAt: string; distanceMiles?: number }
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  sources?: ChatSource[];
  warning?: string; // uncertainty note
}
