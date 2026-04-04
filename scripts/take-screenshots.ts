/**
 * Takes mobile screenshots for marketing site feature pages.
 * Requires dev server on port 3000.
 *
 * Usage: npx tsx scripts/take-screenshots.ts
 */

import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const BASE = "http://localhost:3000";
const OUT = path.resolve(__dirname, "../../chastitytracker-marketing/public/images/screenshots");

async function login(page: any, username: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState("networkidle");
  await page.locator("input").first().fill(username);
  await page.locator("input").nth(1).fill(password);
  await page.locator("button", { hasText: /anmelden|login/i }).click();
  await page.waitForURL("**/dashboard**", { timeout: 10000 });
  console.log(`✓ Logged in as ${username}`);
}

async function hideDevBadges(page: any) {
  await page.evaluate(() => {
    // Remove Next.js dev overlay / issue badges
    document.querySelectorAll('[class*="issue"], [class*="Issue"], [data-nextjs-dialog-overlay], nextjs-portal').forEach(e => e.remove());
    const style = document.createElement('style');
    style.textContent = 'nextjs-portal, [data-nextjs-toast] { display: none !important; }';
    document.head.appendChild(style);
  });
}

async function screenshot(page: any, name: string) {
  await hideDevBadges(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`✓ Screenshot: ${name}`);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  // ═══════════════════════════════════════════
  // KEUSCHLING (User) Screenshots
  // ═══════════════════════════════════════════
  await login(page, "Keuschling", "keuschling123");

  // Hero: Dashboard with active lock session
  await page.waitForTimeout(1500);
  await screenshot(page, "hero");

  // Einträge-Liste
  await page.goto(`${BASE}/dashboard/eintraege`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  await screenshot(page, "feature-zeiterfassung");

  // Statistik
  await page.goto(`${BASE}/dashboard/stats`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  await screenshot(page, "feature-statistik-user");

  // Settings (Benachrichtigungen)
  await page.goto(`${BASE}/dashboard/settings`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  await screenshot(page, "feature-benachrichtigungen");

  // Logout
  await page.goto(`${BASE}/api/auth/signout`);
  await page.waitForLoadState("networkidle");
  const signoutBtn = page.locator("button[type='submit']");
  if (await signoutBtn.isVisible()) {
    await signoutBtn.click();
    await page.waitForTimeout(2000);
  }

  // ═══════════════════════════════════════════
  // KEYHOLDER (Admin) Screenshots
  // ═══════════════════════════════════════════
  await login(page, "KeyHolder", "keyholder123");

  // Admin Dashboard (User-Cards)
  await page.goto(`${BASE}/admin`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  await screenshot(page, "feature-rollen");

  // Find Keuschling user ID from the page by looking at each card individually
  const userId = await page.evaluate(() => {
    // Look for all user card links
    const links = Array.from(document.querySelectorAll("a")) as HTMLAnchorElement[];
    for (const link of links) {
      if (!link.href.includes("/admin/users/") || link.href.endsWith("/new")) continue;
      // Each card link wraps user info - check if THIS specific card has "Keuschling"
      // Walk only 3 levels up to stay within the card
      const card = link.closest("[class]");
      if (!card) continue;
      // Get all text nodes direct within this card (not nested cards)
      const spans = card.querySelectorAll("span, p, div, h3, h2");
      for (const s of spans) {
        if (s.textContent?.trim() === "Keuschling") {
          return link.href.split("/admin/users/")[1];
        }
      }
    }
    // Fallback: search by DB query result
    return null;
  }) || "cmnk6fdpm265b06c71d8906bc"; // Fallback to known ID
  console.log(`  Keuschling userId: ${userId}`);

  // User Detail (Übersicht)
  await page.goto(`${BASE}/admin/users/${userId}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  await screenshot(page, "feature-sperrzeiten");

  // Statistik
  await page.goto(`${BASE}/admin/users/${userId}/stats`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  await screenshot(page, "feature-trainingsziele");

  // Scroll down on stats for calendar
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.waitForTimeout(500);
  await screenshot(page, "feature-statistik");

  // Kontrollen
  await page.goto(`${BASE}/admin/kontrollen`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  await screenshot(page, "feature-kontrollen");

  // Strafbuch — click "Alle Vergehen anzeigen" if available
  await page.goto(`${BASE}/admin/users/${userId}/strafbuch`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  const alleBtn = page.locator("button", { hasText: /alle vergehen/i });
  if (await alleBtn.isVisible()) {
    await alleBtn.click();
    await page.waitForTimeout(1000);
  }
  await screenshot(page, "feature-strafbuch");

  // Einträge des Users (mit Fotos)
  await page.goto(`${BASE}/admin/users/${userId}/eintraege`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  await screenshot(page, "feature-foto");

  await browser.close();
  console.log(`\n✅ All screenshots saved to ${OUT}`);
}

main().catch((e) => {
  console.error("❌ Screenshot failed:", e);
  process.exit(1);
});
