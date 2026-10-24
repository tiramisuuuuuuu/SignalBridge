import { Actor } from "apify";
import { chromium } from "playwright";

type Input = { url?: string };
const DEFAULT_URL = "http://localhost:4010/county-emergency/";

function toStatus(raw: string | null): "open" | "full" | "closed" | "unknown" {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "open" || s === "full" || s === "closed") return s;
  return "unknown";
}

await Actor.init();
const url = ((await Actor.getInput<Input>()) ?? {}).url ?? DEFAULT_URL;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
  const observedAt = new Date().toISOString();
  const updated = await page.$("#updated");
  const sourceUpdatedAt = updated ? (await updated.innerText()).trim() : null;

  for (const section of await page.$$("section.shelter")) {
    const id = (await section.getAttribute("id")) ?? "unknown-shelter";
    const el = await section.$(".status");
    const raw = el ? (await el.innerText()).trim() : null;
    if (raw === null) {
      await Actor.pushData({ type: "extraction_failure", shelterId: id, failedField: "status", sourceUrl: url, observedAt });
      continue;
    }
    await Actor.pushData({ type: "county_shelter", id, status: toStatus(raw), sourceUrl: url, sourceUpdatedAt, observedAt });
  }
} catch (err) {
  await Actor.pushData({ type: "fetch_failure", sourceUrl: url, observedAt: new Date().toISOString(), error: String(err) });
} finally {
  await browser.close();
  await Actor.exit();
}
