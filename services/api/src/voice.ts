import type { Express } from "express";
import { createHash } from "node:crypto";

// Cache so repeated demo text doesn't burn free credits.
const cache = new Map<string, Buffer>();

export function registerVoice(app: Express) {
  app.post("/api/voice", async (req, res) => {
    const text = String(req.body?.text ?? "").trim();
    if (!text) return res.status(400).json({ error: "text is required" });
    if (text.length > 600) return res.status(400).json({ error: "text too long (max 600 chars)" });

    const key = process.env.CARTESIA_API_KEY;
    const voiceId = process.env.CARTESIA_VOICE_ID;
    if (!key || !voiceId) return res.status(503).json({ error: "Voice not configured" });

    const hash = createHash("sha256").update(text).digest("hex");
    const hit = cache.get(hash);
    if (hit) {
      res.set("Content-Type", "audio/mpeg").set("X-Voice-Cache", "hit");
      return res.send(hit);
    }

    try {
      const r = await fetch("https://api.cartesia.ai/tts/bytes", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Cartesia-Version": "2026-03-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model_id: "sonic-3.5",
          transcript: text,
          voice: { mode: "id", id: voiceId },
          output_format: { container: "mp3", sample_rate: 44100, bit_rate: 128000 },
          language: "en",
        }),
      });
      if (!r.ok) {
        const detail = (await r.text()).slice(0, 300);
        return res.status(502).json({ error: "Cartesia request failed", status: r.status, detail });
      }
      const buf = Buffer.from(await r.arrayBuffer());
      cache.set(hash, buf);
      res.set("Content-Type", "audio/mpeg").set("X-Voice-Cache", "miss");
      res.send(buf);
    } catch (err) {
      res.status(502).json({ error: String(err) });
    }
  });
}
