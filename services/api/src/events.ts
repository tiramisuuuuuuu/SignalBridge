import type { Express, Response } from "express";

// Live push (Server-Sent Events): the server tells every open page about changes immediately.
const clients = new Set<Response>();

export function broadcast(event: object) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const c of clients) c.write(data);
}

export function registerEvents(app: Express) {
  app.get("/api/events", (req, res) => {
    res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" });
    res.flushHeaders?.();
    res.write(`data: ${JSON.stringify({ type: "hello" })}\n\n`);
    clients.add(res);
    const ping = setInterval(() => res.write(": ping\n\n"), 25000);
    req.on("close", () => { clearInterval(ping); clients.delete(res); });
  });
}
