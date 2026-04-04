#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Generates iOS splash screen PNGs from the app icon.
// Usage: node scripts/generate-splash.mjs
// Requires: sharp (already in devDependencies)
// ---------------------------------------------------------------------------

import sharp from "sharp";
import { mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "public", "splash");
const ICON_PATH = join(ROOT, "public", "icon-512.png");

// iOS splash screen sizes (device width x height @ scale)
// Format: [width, height, filename]
const SIZES = [
  // iPhone SE, iPod touch
  [640, 1136, "splash-640x1136.png"],
  // iPhone 6/7/8, SE 2/3
  [750, 1334, "splash-750x1334.png"],
  // iPhone 6+/7+/8+
  [1242, 2208, "splash-1242x2208.png"],
  // iPhone X/XS/11 Pro
  [1125, 2436, "splash-1125x2436.png"],
  // iPhone XR/11
  [828, 1792, "splash-828x1792.png"],
  // iPhone XS Max/11 Pro Max
  [1242, 2688, "splash-1242x2688.png"],
  // iPhone 12 mini/13 mini
  [1080, 2340, "splash-1080x2340.png"],
  // iPhone 12/12 Pro/13/13 Pro/14
  [1170, 2532, "splash-1170x2532.png"],
  // iPhone 12 Pro Max/13 Pro Max/14 Plus
  [1284, 2778, "splash-1284x2778.png"],
  // iPhone 14 Pro
  [1179, 2556, "splash-1179x2556.png"],
  // iPhone 14 Pro Max
  [1290, 2796, "splash-1290x2796.png"],
  // iPhone 15/15 Pro
  [1179, 2556, "splash-1179x2556.png"],
  // iPhone 15 Pro Max/16 Plus
  [1290, 2796, "splash-1290x2796.png"],
  // iPad (gen 9/10)
  [1620, 2160, "splash-1620x2160.png"],
  // iPad Air / iPad Pro 11"
  [1640, 2360, "splash-1640x2360.png"],
  // iPad Pro 12.9"
  [2048, 2732, "splash-2048x2732.png"],
];

// Deduplicate by filename (some sizes are the same)
const uniqueSizes = [...new Map(SIZES.map((s) => [s[2], s])).values()];

async function generate() {
  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
  }

  console.log(`Generating ${uniqueSizes.length} splash screens...`);

  for (const [width, height, filename] of uniqueSizes) {
    const iconSize = Math.min(width, height) * 0.25; // Icon at 25% of smallest dimension

    // Create centered icon on themed background
    const icon = await sharp(ICON_PATH)
      .resize(Math.round(iconSize), Math.round(iconSize), { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 248, g: 249, b: 251, alpha: 1 }, // #f8f9fb — matches manifest background_color
      },
    })
      .composite([
        {
          input: icon,
          gravity: "centre",
        },
      ])
      .png()
      .toFile(join(OUT_DIR, filename));

    console.log(`  ${filename} (${width}x${height})`);
  }

  console.log("Done!");
}

generate().catch((err) => {
  console.error("Error generating splash screens:", err);
  process.exit(1);
});
