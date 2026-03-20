import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const BASE = "http://localhost:3000";
const OUT = path.join(process.cwd(), "public/screenshots/info");
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORT = { width: 390, height: 700 };

const browser = await chromium.launch();

async function makeContext() {
  return browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
}

async function shots(page, name, url, scrollPositions = [0]) {
  await page.goto(BASE + url, { waitUntil: "networkidle" });
  // Next.js Dev-Overlay ausblenden
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  for (let i = 0; i < scrollPositions.length; i++) {
    await page.evaluate((y) => window.scrollTo(0, y), scrollPositions[i]);
    await page.waitForTimeout(150);
    const suffix = scrollPositions.length > 1 ? `-${String.fromCharCode(97 + i)}` : "";
    await page.screenshot({
      path: path.join(OUT, `${name}${suffix}.png`),
      clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height },
    });
    console.log(`✓ ${name}${suffix}`);
  }
}

// ── DemoUser ──────────────────────────────────────────────────────────────────
const ctx = await makeContext();
const page = await ctx.newPage();

await page.goto(BASE + "/login", { waitUntil: "networkidle" });
await page.fill('input[name="username"], input[type="text"]', "DemoUser");
await page.fill('input[type="password"]', "demo1234");
await page.click('button[type="submit"]');
await page.waitForURL("**/dashboard**", { timeout: 10000 });

await shots(page, "01-dashboard",    "/dashboard",              [0, 600, 1300]);
await shots(page, "02-new-entry",    "/dashboard/new",          [0]);
await shots(page, "03-verschluss",   "/dashboard/new/verschluss",[0]);
await shots(page, "04-pruefung",     "/dashboard/new/pruefung", [0]);
await shots(page, "05-stats",        "/dashboard/stats",        [0, 700, 1400]);
await shots(page, "06-settings",     "/dashboard/settings",     [0]);

// ── Admin ─────────────────────────────────────────────────────────────────────
const adminCtx = await makeContext();
const adminPage = await adminCtx.newPage();

await adminPage.goto(BASE + "/login", { waitUntil: "networkidle" });
await adminPage.fill('input[name="username"], input[type="text"]', "admin");
await adminPage.fill('input[type="password"]', "admin123");
await adminPage.click('button[type="submit"]');
await adminPage.waitForURL("**/dashboard**", { timeout: 10000 });

await shots(adminPage, "07-admin",         "/admin",             [0, 600]);
await shots(adminPage, "08-kontrollen",    "/admin/kontrollen",  [0, 600]);
await shots(adminPage, "09-vorgaben",      "/admin/users/cmmp5134e0000wm4clymxxds2/vorgaben", [0]);

await browser.close();
console.log(`\nAlle Screenshots gespeichert in: ${OUT}`);
