import { Actor } from "apify";
import { chromium } from "playwright";

type Input = { url?: string };

const DEFAULT_URL = "http://localhost:4010/transportation-alerts/";

function toStatus(raw: string | null): "open" | "closed" | "unknown" {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "open" || s === "closed") return s;
  return "unknown";
}

await Actor.init();

const input = (await Actor.getInput<Input>()) ?? {};
const url = input.url ?? DEFAULT_URL;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
  const observedAt = new Date().toISOString();

  const readText = async (section: any, selector: string) => {
    const el = await section.$(selector);
    return el ? (await el.innerText()).trim() : null;
  };

  const sections = await page.$$("section.road");
  let evidenceSaved = false;

  for (const section of sections) {
    const id = (await section.getAttribute("id")) ?? "unknown-road";
    const fields = {
      name: await readText(section, ".road-name"),
      status: await readText(section, ".road-status"),
      reason: await readText(section, ".road-reason"),
    };

    for (const [field, value] of Object.entries(fields)) {
      if (value === null) {
        if (!evidenceSaved) {
          await Actor.setValue(`evidence-${id}-html`, await page.content(), {
            contentType: "text/html",
          });
          evidenceSaved = true;
        }
        await Actor.pushData({
          type: "extraction_failure",
          roadId: id,
          failedField: field,
          sourceUrl: url,
          observedAt,
          evidenceKey: `evidence-${id}-html`,
        });
        console.error(`FAILED: could not extract "${field}" for ${id}`);
      }
    }

    await Actor.pushData({
      type: "road",
      id,
      name: fields.name,
      description: `${fields.name ?? "Unknown road"}${fields.reason ? ` closed due to ${fields.reason.toLowerCase()}` : ""}`,
      status: toStatus(fields.status),
      reason: fields.reason,
      sourceUrl: url,
      observedAt,
    });
  }

  console.log(`Extracted ${sections.length} road(s) from ${url}`);
} catch (err) {
  console.error("Actor failed:", err);
  await Actor.pushData({
    type: "fetch_failure",
    sourceUrl: url,
    observedAt: new Date().toISOString(),
    error: String(err),
  });
} finally {
  await browser.close();
  await Actor.exit();
}
