import { z } from "zod";

export const ShelterStatus = z.enum(["open", "full", "closed", "unknown"]);

export const Source = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().url(),
  lastSuccessfulFetchAt: z.string().datetime(),
});

export const Shelter = z.object({
  id: z.string(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  status: ShelterStatus,
  petsAllowed: z.boolean().nullable(),
  wheelchairAccessible: z.boolean().nullable(),
  capacity: z.number().nullable(),
  sourceId: z.string(),
  sourceUpdatedAt: z.string().datetime().nullable(),
  observedAt: z.string().datetime(),
  staleAfterMinutes: z.number(),
});

export const RoadClosure = z.object({
  id: z.string(),
  description: z.string(),
  status: z.enum(["open", "closed", "unknown"]),
  sourceId: z.string(),
  observedAt: z.string().datetime(),
});

export const Conflict = z.object({
  id: z.string(),
  field: z.string(),
  sourceIds: z.array(z.string()),
  description: z.string(),
  severity: z.enum(["low", "medium", "high"]),
});

export const EmergencyPacket = z.object({
  version: z.number().int(),
  incidentId: z.string(),
  downloadedAt: z.string().datetime(),
  lastSyncAttemptAt: z.string().datetime(),
  syncStatus: z.enum(["fresh", "stale", "failed", "offline"]),
  sources: z.array(Source),
  shelters: z.array(Shelter),
  roadClosures: z.array(RoadClosure),
  conflicts: z.array(Conflict),
});

export type EmergencyPacket = z.infer<typeof EmergencyPacket>;
export type Shelter = z.infer<typeof Shelter>;
export type RoadClosure = z.infer<typeof RoadClosure>;
export type Conflict = z.infer<typeof Conflict>;
export type Source = z.infer<typeof Source>;
