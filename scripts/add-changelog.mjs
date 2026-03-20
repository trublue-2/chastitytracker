#!/usr/bin/env node
// Verwendung: npm run changelog
// Bumpt die Version in package.json und fügt einen neuen Changelog-Eintrag in src/data/changelog.json ein.

import { createInterface } from "readline/promises";
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PKG_PATH = resolve(ROOT, "package.json");
const CHANGELOG_PATH = resolve(ROOT, "src/data/changelog.json");

const VALID_TYPES = ["feat", "fix", "security", "perf", "chore"];

function bumpVersion(version, type) {
  const [major, minor, patch] = version.split(".").map(Number);
  if (type === "major") return `${major + 1}.0.0`;
  if (type === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function today() {
  return new Date().toISOString().split("T")[0];
}

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });

async function ask(prompt) {
  return (await rl.question(prompt)).trim();
}

async function main() {
  const pkg = JSON.parse(readFileSync(PKG_PATH, "utf8"));
  const changelog = JSON.parse(readFileSync(CHANGELOG_PATH, "utf8"));
  const current = pkg.version;

  console.log(`\nAktuelle Version: v${current}`);
  console.log(`  [1] patch → v${bumpVersion(current, "patch")}`);
  console.log(`  [2] minor → v${bumpVersion(current, "minor")}`);
  console.log(`  [3] major → v${bumpVersion(current, "major")}`);

  const bump = await ask("Bump-Typ [patch/minor/major] oder eigene Version (x.y.z): ");

  let newVersion;
  if (bump === "1" || bump === "patch") newVersion = bumpVersion(current, "patch");
  else if (bump === "2" || bump === "minor") newVersion = bumpVersion(current, "minor");
  else if (bump === "3" || bump === "major") newVersion = bumpVersion(current, "major");
  else if (/^\d+\.\d+\.\d+$/.test(bump)) newVersion = bump;
  else newVersion = bumpVersion(current, "patch");

  console.log(`\nNeue Version: v${newVersion}  ·  Datum: ${today()}`);
  console.log('Einträge hinzufügen. Typ leer lassen zum Beenden.\n');

  const changes = [];

  while (true) {
    const type = await ask(`Typ [${VALID_TYPES.join("/")}]: `);
    if (!type) break;
    if (!VALID_TYPES.includes(type)) {
      console.log(`  Ungültig. Erlaubt: ${VALID_TYPES.join(", ")}`);
      continue;
    }
    const text = await ask("Beschreibung: ");
    if (!text) break;
    changes.push({ type, text });
    console.log("  ✓ Eintrag gespeichert\n");
  }

  rl.close();

  if (changes.length === 0) {
    console.log("\nKeine Einträge – abgebrochen. package.json unverändert.");
    return;
  }

  // Changelog aktualisieren
  changelog.unshift({ version: newVersion, date: today(), changes });
  writeFileSync(CHANGELOG_PATH, JSON.stringify(changelog, null, 2) + "\n");

  // package.json aktualisieren
  pkg.version = newVersion;
  writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + "\n");

  console.log(`\n✅  v${newVersion} mit ${changes.length} Eintrag/Einträgen eingetragen.`);
  console.log(`   package.json und src/data/changelog.json aktualisiert.`);
  console.log(`\nNächster Schritt: git add -A && git commit -m "chore: bump version to v${newVersion}"`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
