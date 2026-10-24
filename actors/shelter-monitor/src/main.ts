import { Actor } from "apify";
import { chromium } from "playwright";

type Input = { url?: string };

const DEFAULT_URL = "http://localhost:4010/shelter-status/";

function toStatus(raw: string | null): "open" | "full" | "closed" | "unknown" {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "open" || s === "full" || s === "closed") return s;
  return "unknown";
}

function toBool(raw: string | null): boolean | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "yes") return true;
  if (s === "no") return false;
  return null;
}

function toNumber(raw: string | null): number | null {
  if (raw === null) return null;
  const n = parseInt(raw.trim(), 10);
  return Number.isNaN(n) ? null : n;
}

await Actor.init();

const input = (await Actor.getInput<Input>()) ?? {};
const url = input.url ?? DEFAULT_URL;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
  const observedAt = new Date().toISOString();

  const updatedEl = await page.$("#updated");
  const sourceUpdatedAt = updatedEl ? (await updatedEl.innerText()).trim() : null;

  const readText = async (section: any, selector: string) => {
    const el = await section.$(selector);
    return el ? (await el.innerText()).trim() : null;
  };

  const sections = await page.$$("section.shelter");
  let evidenceSaved = false;

  for (const section of sections) {
    const id = (await section.getAttribute("id")) ?? "unknown-shelter";

    // These selectors are what the Factory Droid demo will repair.
    const fields = {
      name: await readText(section, ".name"),
      status: await readText(section, ".status"),
      pets: await readText(section, ".pets"),
      wheelchair: await readText(section, ".wheelchair"),
      capacity: await readText(section, ".capacity"),
    };

    // Save evidence for every missing field. Never invent values.
    for (const [field, value] of Object.entries(fields)) {
      if (value === null) {
        if (!evidenceSaved) {
          await Actor.setValue(`evidence-${id}-html`, await page.content(), {
            contentType: "text/html",
          });
          await Actor.setValue(`evidence-${id}-screenshot`, await page.screenshot(), {
            contentType: "image/png",
          });
          evidenceSaved = true;
        }
        await Actor.pushData({
          type: "extraction_failure",
          shelterId: id,
          failedField: field,
          sourceUrl: url,
          observedAt,
          evidenceKey: `evidence-${id}-html`,
        });
        console.error(`FAILED: could not extract "${field}" for ${id}`);
      }
    }

    await Actor.pushData({
      type: "shelter",
      id,
      name: fields.name,
      status: toStatus(fields.status),
      petsAllowed: toBool(fields.pets),
      wheelchairAccessible: toBool(fields.wheelchair),
      capacity: toNumber(fields.capacity),
      sourceUrl: url,
      sourceUpdatedAt,
      observedAt,
    });
  }

  console.log(`Extracted ${sections.length} shelter(s) from ${url}`);
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
