/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Express } from "express";

// ChatGPT-style emergency assistant: Claude + live web search, grounded in the user's local data.
// The user's exact location is never sent; only their area label and app data.

const MODEL = process.env.CHAT_MODEL || "claude-sonnet-5-5";

function systemPrompt(ctx: any) {
  const updates = JSON.stringify((ctx?.updates ?? []).slice(0, 15)).slice(0, 6000);
  const places = JSON.stringify((ctx?.places ?? []).slice(0, 30)).slice(0, 6000);
  return `You are SignalBridge, an emergency information assistant for people anywhere in the world.

Help with anything that matters in an emergency: disasters, weather and forecasts, evacuations, road conditions, shelters, food and water, supply and grocery stores, medical care, hospitals, pharmacies, power and water outages, and practical safety steps.

Rules:
- For anything happening now or recently, search the web. Prefer official and trusted sources: national and local governments, emergency management agencies, national weather services, WHO, Red Cross/Red Crescent, UN agencies (ReliefWeb, GDACS), USGS, NASA, and established news organizations. Avoid rumors, social media posts, and unverified blogs.
- Never invent facts, places, phone numbers, addresses, or statuses. If you can't verify something, say so plainly.
- Say how current the information is and name the source.
- If the user may be in immediate danger, first tell them to contact local emergency services (for example 911 in the US and Canada, 112 in the EU, 999 in the UK) and to follow official instructions.
- Whenever you mention a specific place (shelter, hospital, clinic, pharmacy, store, fire or police station), write it exactly as {{place|NAME|LAT,LNG|ADDRESS}}. Use LAT,LNG only if you have exact coordinates (from the nearby places list below); otherwise leave that part empty: {{place|NAME||ADDRESS}}. The app turns this into Google search and directions links.
- Keep answers short and scannable: lead with the direct answer, then at most about 6 short bullet points starting with "- ". No tables, no headings.
- Summarize sources in your own words; don't copy articles.

The user's approximate area: ${String(ctx?.label ?? "unknown").slice(0, 120)}

Live updates for this area from official feeds (JSON, may be empty):
${updates}

Nearby essentials from OpenStreetMap (JSON with exact coordinates, may be empty):
${places}`;
}

export function registerChat(app: Express) {
  app.post("/api/chat", async (req, res) => {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return res.status(503).json({ error: "Chat isn't configured yet: add ANTHROPIC_API_KEY to .env and restart the API." });

    const messages = (Array.isArray(req.body?.messages) ? req.body.messages : [])
      .filter((m: any) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .slice(-12)
      .map((m: any) => ({ role: m.role, content: m.content.slice(0, 4000) }));
    while (messages[0]?.role === "assistant") messages.shift();
    if (!messages.length || messages[messages.length - 1].role !== "user") {
      return res.status(400).json({ error: "Send messages ending with a user question." });
    }

    const base = {
      model: MODEL,
      max_tokens: 2000,
      system: systemPrompt(req.body?.context),
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
    };

    try {
      const blocks: any[] = [];
      const stops: string[] = [];
      let convo: any[] = messages;
      for (let i = 0; i < 5; i++) {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ ...base, messages: convo }),
          signal: AbortSignal.timeout(90000),
        });
        const d: any = await r.json();
        if (!r.ok) return res.status(502).json({ error: d?.error?.message ?? `Anthropic API HTTP ${r.status}` });
        blocks.push(...(d.content ?? []));
        stops.push(String(d.stop_reason));
        if (d.stop_reason !== "pause_turn") break; // long searches can pause; continue the same turn
        convo = [...messages, { role: "assistant", content: d.content }];
      }

      let text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
      let note: string | undefined;
      if (!text) {
        // Fallback: answer from local data + general safety knowledge, without live web search.
        const r2 = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({
            model: MODEL, max_tokens: 1200,
            system: base.system + "\n\nLive web search is unavailable for this answer. Use only the local data above and general safety knowledge, and say clearly that live search wasn't available.",
            messages,
          }),
          signal: AbortSignal.timeout(60000),
        });
        const d2: any = await r2.json();
        if (r2.ok) {
          text = (d2.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
          note = "Live web search wasn't available for this answer.";
        } else {
          note = `Fallback failed: ${d2?.error?.message ?? r2.status}`;
        }
      }
      const seen = new Set<string>();
      const sources: { name: string; url: string }[] = [];
      for (const b of blocks) {
        for (const c of b.citations ?? []) {
          if (c.url && !seen.has(c.url)) {
            seen.add(c.url);
            let host = c.url;
            try { host = new URL(c.url).hostname.replace(/^www\./, ""); } catch { /* keep url */ }
            sources.push({ name: c.title || host, url: c.url });
          }
        }
      }
      const debug = { stops, types: blocks.map((b) => b.type) };
      if (!text) console.log("[chat] empty answer", JSON.stringify(debug), JSON.stringify(blocks).slice(0, 1500));
      res.json({
        debug: note || !text ? debug : undefined,
        warning: note,
        text: text || "I couldn't find verified information for that.",
        sources: sources.slice(0, 8),
        searched: blocks.some((b) => b.type === "server_tool_use"),
        model: MODEL,
      });
    } catch (e: any) {
      res.status(502).json({ error: `Assistant unavailable: ${e?.message ?? e}` });
    }
  });
}
