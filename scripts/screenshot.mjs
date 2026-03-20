import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const BASE = "http://localhost:3000";
const OUT = path.join(process.cwd(), "scripts/screenshots");
fs.mkdirSync(OUT, { recursive: true });

// iPhone SE (1st gen) / iPhone 5 = 320x568
const VIEWPORT = { width: 320, height: 568 };

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
});

const page = await context.newPage();

async function shot(name, url, { waitFor, action } = {}) {
  await page.goto(BASE + url, { waitUntil: "networkidle" });
  if (waitFor) await page.waitForSelector(waitFor);
  if (action) await action(page);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  console.log(`✓ ${name}`);
}

// 1. Login
await shot("01-login", "/login");

// Login then screenshot all authenticated pages
await page.goto(BASE + "/login", { waitUntil: "networkidle" });
await page.fill('input[name="username"], input[type="text"]', "keuschling");
await page.fill('input[type="password"]', "geheim123");
await page.click('button[type="submit"]');
await page.waitForURL("**/dashboard**", { timeout: 10000 });

// 2. Dashboard
await shot("02-dashboard", "/dashboard");

// 3. Neu erfassen
await shot("03-new", "/dashboard/new");

// 4. New Verschluss
await shot("04-new-verschluss", "/dashboard/new/verschluss");

// 5. New Oeffnen
await shot("05-new-oeffnen", "/dashboard/new/oeffnen");

// 6. New Kontrolle
await shot("06-new-kontrolle", "/dashboard/new/pruefung");

// 7. New Orgasmus
await shot("07-new-orgasmus", "/dashboard/new/orgasmus");

// 8. Stats
await shot("08-stats", "/dashboard/stats");

// 9. Settings
await shot("09-settings", "/dashboard/settings");

// 10. Admin
await shot("10-admin", "/admin");

// 11. Admin new user
await shot("11-admin-new-user", "/admin/users/new");

await browser.close();
console.log("\nAll screenshots saved to scripts/screenshots/");
