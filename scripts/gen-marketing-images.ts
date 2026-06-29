/**
 * Generates the 3 non-app marketing illustrations via Playwright setContent + screenshot.
 * Dark theme (#09090b), violet accent (#8b5cf6), sans-serif. Both languages:
 *   DE → OUT/<slug>.png   ·   EN → OUT/en/<slug>.png
 */
import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const OUT = path.resolve(__dirname, "../../chastitytracker-marketing/public/images/screenshots");

const BG = "#09090b";
const ACCENT = "#8b5cf6";

// Headless chromium lacks the Apple system fonts AND a matching bold face — bold text then
// renders via a fallback that ignores the inherited color (shows black). Use Arial/Helvetica
// (always present) and force color inheritance on every element (see global <style> below).
const FONT = "Arial, Helvetica, sans-serif";

// ── per-language strings ──────────────────────────────────────────────
interface Strings {
  // lokale-ki
  kiKicker: string;
  kiTitle: string;
  containerLabel: string;
  tunnelLabel: string;
  macTitle: string;
  ollamaDesc: string;
  clipDesc: string;
  kiFooter: string;
  // ki-keyholder
  illustration: string;
  khKicker: string;
  khTitle: string;
  khLockedLine: string; // JSON-ish line content
  khRole: string;
  khMessage: string; // may contain <b>
  // app-push
  date: string;
  pushTitle: string;
  pushBody: string; // may contain <b>
  pushAgo: string;
  push2Title: string;
  push2Body: string;
  now: string;
}

const DE: Strings = {
  kiKicker: "Lokale KI · On-Premise",
  kiTitle: "Fotos verlassen den eigenen Server nie",
  containerLabel: "Container",
  tunnelLabel: "verschlüsselter Tunnel",
  macTitle: "Mac-Box (zuhause)",
  ollamaDesc: "Code- &amp; Siegel-Erkennung",
  clipDesc: "Geräte-Erkennung",
  kiFooter: "🔒 Bildanalyse läuft auf der eigenen Hardware — keine Cloud, keine Drittanbieter",
  illustration: "Illustration",
  khKicker: "Virtueller Keyholder · MCP",
  khTitle: "Claude liest das Dashboard und gibt eine Direktive",
  khLockedLine:
    '{ "locked": true, "seit": "14d 6h",<br>&nbsp;&nbsp;"kontrollen_offen": 1, "letzte_strafe": "vor 3d",<br>&nbsp;&nbsp;"trainingsziel": "100h/Woche", "erfüllt": "92%" }',
  khRole: "Virtueller Keyholder",
  khMessage:
    "Du liegst 8&nbsp;% unter dem Wochenziel. Die offene Kontrolle läuft in 2&nbsp;Stunden ab — <b>reiche jetzt ein Foto ein</b>. Als Ausgleich verlängere ich die Sperrzeit um <b>48&nbsp;Stunden</b>.",
  date: "Samstag, 28. Juni",
  pushTitle: "Kontrolle erforderlich",
  pushBody: "Reiche innerhalb der nächsten 4&nbsp;Stunden ein Foto mit dem Code <b>48&nbsp;217</b> ein.",
  pushAgo: "vor 2h",
  push2Title: "",
  push2Body: "Sperrzeit verlängert: jetzt 16 Tage 6 Std.",
  now: "jetzt",
};

const EN: Strings = {
  kiKicker: "Local AI · On-Premise",
  kiTitle: "Photos never leave your own server",
  containerLabel: "Container",
  tunnelLabel: "encrypted tunnel",
  macTitle: "Mac box (at home)",
  ollamaDesc: "Code &amp; seal recognition",
  clipDesc: "Device recognition",
  kiFooter: "🔒 Image analysis runs on your own hardware — no cloud, no third parties",
  illustration: "Illustration",
  khKicker: "Virtual Keyholder · MCP",
  khTitle: "Claude reads the dashboard and issues a directive",
  khLockedLine:
    '{ "locked": true, "since": "14d 6h",<br>&nbsp;&nbsp;"open_inspections": 1, "last_penalty": "3d ago",<br>&nbsp;&nbsp;"training_goal": "100h/week", "met": "92%" }',
  khRole: "Virtual Keyholder",
  khMessage:
    "You are 8&nbsp;% below your weekly goal. The open inspection expires in 2&nbsp;hours — <b>submit a photo now</b>. To compensate, I'm extending the lock period by <b>48&nbsp;hours</b>.",
  date: "Saturday, June 28",
  pushTitle: "Inspection required",
  pushBody: "Submit a photo with code <b>48&nbsp;217</b> within the next 4&nbsp;hours.",
  pushAgo: "2h ago",
  push2Title: "",
  push2Body: "Lock period extended: now 16 days 6 hrs.",
  now: "now",
};

// ── 1. Local AI — architecture diagram (900×600) ──
const lokaleKi = (t: Strings) => `
<div style="width:900px;height:600px;background:${BG};font-family:${FONT};color:#fafafa;display:flex;flex-direction:column;align-items:center;justify-content:center;box-sizing:border-box;padding:40px;">
  <div style="font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:${ACCENT};font-weight:700;margin-bottom:6px;">${t.kiKicker}</div>
  <h1 style="font-size:30px;font-weight:800;margin:0 0 40px;letter-spacing:-.02em;">${t.kiTitle}</h1>

  <div style="display:flex;align-items:center;gap:0;width:100%;justify-content:center;">
    <div style="flex:0 0 230px;background:#18181b;border:1px solid #27272a;border-radius:18px;padding:24px;text-align:center;">
      <div style="width:52px;height:52px;margin:0 auto 14px;border-radius:13px;background:#27272a;display:flex;align-items:center;justify-content:center;font-size:26px;">📦</div>
      <div style="font-size:18px;font-weight:700;">tracker</div>
      <div style="font-size:13px;color:#a1a1aa;margin-top:4px;">${t.containerLabel}</div>
    </div>

    <div style="flex:0 0 180px;display:flex;flex-direction:column;align-items:center;justify-content:center;">
      <div style="font-size:12px;color:${ACCENT};font-weight:700;letter-spacing:.08em;margin-bottom:8px;">Tailscale</div>
      <div style="width:100%;height:3px;background:linear-gradient(90deg,${ACCENT},#6d28d9);border-radius:3px;position:relative;">
        <div style="position:absolute;right:-2px;top:-5px;width:0;height:0;border-top:7px solid transparent;border-bottom:7px solid transparent;border-left:11px solid ${ACCENT};"></div>
      </div>
      <div style="font-size:11px;color:#71717a;margin-top:8px;">${t.tunnelLabel}</div>
    </div>

    <div style="flex:0 0 280px;background:#18181b;border:1px solid ${ACCENT}55;border-radius:18px;padding:24px;text-align:center;box-shadow:0 0 0 1px ${ACCENT}22, 0 18px 40px -20px ${ACCENT}66;">
      <div style="width:52px;height:52px;margin:0 auto 14px;border-radius:13px;background:#27272a;display:flex;align-items:center;justify-content:center;font-size:26px;">🖥️</div>
      <div style="font-size:18px;font-weight:700;">${t.macTitle}</div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:16px;">
        <div style="background:#0f0f12;border:1px solid #27272a;border-radius:11px;padding:10px 14px;text-align:left;">
          <div style="font-size:14px;font-weight:700;">Ollama <span style="color:${ACCENT};">(Vision)</span></div>
          <div style="font-size:11px;color:#a1a1aa;">${t.ollamaDesc}</div>
        </div>
        <div style="background:#0f0f12;border:1px solid #27272a;border-radius:11px;padding:10px 14px;text-align:left;">
          <div style="font-size:14px;font-weight:700;">CLIP <span style="color:${ACCENT};">(Embeddings)</span></div>
          <div style="font-size:11px;color:#a1a1aa;">${t.clipDesc}</div>
        </div>
      </div>
    </div>
  </div>

  <div style="margin-top:36px;font-size:14px;color:#d4d4d8;background:#18181b;border:1px solid #27272a;border-radius:999px;padding:10px 22px;">
    ${t.kiFooter}
  </div>
</div>`;

// ── 2. Virtual Keyholder — MCP chat mock (900×600) ──
const kiKeyholder = (t: Strings) => `
<div style="width:900px;height:600px;background:${BG};font-family:${FONT};color:#fafafa;display:flex;flex-direction:column;box-sizing:border-box;padding:40px 48px;position:relative;">
  <div style="position:absolute;top:18px;right:22px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#71717a;border:1px solid #3f3f46;border-radius:999px;padding:5px 12px;">${t.illustration}</div>

  <div style="font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:${ACCENT};font-weight:700;margin-bottom:6px;">${t.khKicker}</div>
  <h1 style="font-size:28px;font-weight:800;margin:0 0 26px;letter-spacing:-.02em;">${t.khTitle}</h1>

  <div style="background:#18181b;border:1px solid #27272a;border-radius:14px;padding:16px 18px;margin-bottom:16px;">
    <div style="font-size:12px;color:${ACCENT};font-weight:700;margin-bottom:8px;">→ keyholder_dashboard()</div>
    <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;color:#a1a1aa;line-height:1.7;">
      ${t.khLockedLine}
    </div>
  </div>

  <div style="display:flex;gap:14px;align-items:flex-start;">
    <div style="flex:0 0 40px;width:40px;height:40px;border-radius:11px;background:${ACCENT};display:flex;align-items:center;justify-content:center;font-size:20px;">✦</div>
    <div style="background:linear-gradient(180deg,#1e1b2e,#18181b);border:1px solid ${ACCENT}44;border-radius:14px;padding:16px 20px;flex:1;">
      <div style="font-size:12px;color:${ACCENT};font-weight:700;margin-bottom:8px;">${t.khRole}</div>
      <div style="font-size:15.5px;line-height:1.6;color:#f4f4f5;">
        ${t.khMessage}
      </div>
      <div style="margin-top:14px;display:flex;gap:10px;">
        <span style="font-size:12px;font-weight:700;color:#fafafa;background:${ACCENT};border-radius:8px;padding:6px 12px;">→ set_lock_period(+48h)</span>
        <span style="font-size:12px;font-weight:700;color:#d4d4d8;background:#27272a;border-radius:8px;padding:6px 12px;">→ request_inspection()</span>
      </div>
    </div>
  </div>
</div>`;

// ── 3. App push — phone mock (375×812) ──
const appPush = (t: Strings) => `
<div style="width:375px;height:812px;background:linear-gradient(180deg,#1a1730,#09090b 55%);font-family:${FONT};color:#fafafa;box-sizing:border-box;position:relative;overflow:hidden;">
  <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 26px 0;font-size:14px;font-weight:600;">
    <span>9:41</span>
    <span style="font-size:12px;">📶 🔋</span>
  </div>
  <div style="text-align:center;margin-top:26px;">
    <div style="font-size:17px;color:#d4d4d8;font-weight:500;">${t.date}</div>
    <div style="font-size:78px;font-weight:300;letter-spacing:-.03em;line-height:1.05;margin-top:2px;">9:41</div>
  </div>

  <div style="margin:40px 14px 0;background:rgba(40,40,46,.72);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.08);border-radius:22px;padding:15px 16px;box-shadow:0 18px 40px -20px rgba(0,0,0,.8);">
    <div style="display:flex;align-items:center;gap:11px;margin-bottom:9px;">
      <div style="width:30px;height:30px;border-radius:8px;background:${ACCENT};display:flex;align-items:center;justify-content:center;font-size:16px;">🔒</div>
      <div style="font-size:13px;font-weight:700;flex:1;letter-spacing:.01em;">CHASTITY TRACKER</div>
      <div style="font-size:12px;color:#a1a1aa;">${t.now}</div>
    </div>
    <div style="font-size:15px;font-weight:700;margin-bottom:2px;">${t.pushTitle}</div>
    <div style="font-size:14px;color:#e4e4e7;line-height:1.45;">${t.pushBody}</div>
  </div>

  <div style="margin:10px 26px 0;background:rgba(40,40,46,.45);border-radius:18px;padding:12px 16px;">
    <div style="font-size:12px;color:#a1a1aa;">Chastity Tracker · ${t.pushAgo}</div>
    <div style="font-size:13px;color:#d4d4d8;margin-top:2px;">${t.push2Body}</div>
  </div>

  <div style="position:absolute;bottom:30px;left:0;right:0;text-align:center;">
    <div style="width:134px;height:5px;border-radius:3px;background:rgba(255,255,255,.5);margin:0 auto;"></div>
  </div>
</div>`;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(path.join(OUT, "en"), { recursive: true });

  const browser = await chromium.launch({ headless: true });

  const langs: { strings: Strings; dir: string; label: string }[] = [
    { strings: DE, dir: OUT, label: "de" },
    { strings: EN, dir: path.join(OUT, "en"), label: "en" },
  ];

  for (const lang of langs) {
    const t = lang.strings;
    const jobs: { name: string; html: string; w: number; h: number }[] = [
      { name: "feature-lokale-ki", html: lokaleKi(t), w: 900, h: 600 },
      { name: "feature-ki-keyholder", html: kiKeyholder(t), w: 900, h: 600 },
      { name: "feature-app-push", html: appPush(t), w: 375, h: 812 },
    ];

    for (const j of jobs) {
      const ctx = await browser.newContext({
        viewport: { width: j.w, height: j.h },
        deviceScaleFactor: 2,
      });
      const page = await ctx.newPage();
      await page.setContent(
        `<!doctype html><html><head><meta charset="utf-8"><style>
          *{margin:0;padding:0;box-sizing:border-box;color:inherit;font-family:${FONT};}
          html,body{background:${BG};color:#fafafa;width:${j.w}px;height:${j.h}px;overflow:hidden;}
          b,strong{font-weight:700;}
        </style></head><body>${j.html}</body></html>`,
        { waitUntil: "networkidle" },
      );
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(lang.dir, `${j.name}.png`) });
      console.log(`✓ ${lang.label}/${j.name}.png`);
      await ctx.close();
    }
  }

  await browser.close();
  console.log("✅ generated images done (de + en)");
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
