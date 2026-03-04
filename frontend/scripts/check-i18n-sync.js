#!/usr/bin/env node
/**
 * i18n Synchronization Checker
 *
 * Uses zh-TW as the source of truth and verifies that en, ja, ko have
 * all the same keys. Reports missing keys and extra keys per namespace.
 *
 * Usage: npm run check:i18n
 *        node scripts/check-i18n-sync.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const I18N_DIR = path.join(__dirname, "../src/i18n/locales");
const REFERENCE_LANG = "zh-TW";
const TARGET_LANGS = ["en", "ja", "ko"];
const NAMESPACES = ["common", "problem", "contest", "admin", "docs", "landing"];

const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

function flattenKeys(obj, prefix = "") {
  const keys = [];
  for (const k of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (
      typeof obj[k] === "object" &&
      obj[k] !== null &&
      !Array.isArray(obj[k])
    ) {
      keys.push(...flattenKeys(obj[k], fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

function loadNamespace(lang, ns) {
  const filePath = path.join(I18N_DIR, lang, `${ns}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function checkNamespace(ns) {
  const refData = loadNamespace(REFERENCE_LANG, ns);
  if (!refData) return null;

  const refKeys = new Set(flattenKeys(refData));
  const result = {
    refKeyCount: refKeys.size,
    langs: {},
  };

  for (const lang of TARGET_LANGS) {
    const data = loadNamespace(lang, ns);
    if (!data) {
      result.langs[lang] = { missing: [...refKeys], extra: [] };
      continue;
    }

    const langKeys = new Set(flattenKeys(data));
    const missing = [...refKeys].filter((k) => !langKeys.has(k));
    const extra = [...langKeys].filter((k) => !refKeys.has(k));

    result.langs[lang] = { missing, extra };
  }

  return result;
}

function main() {
  console.log("");
  log(colors.bold + colors.cyan, "🌐 i18n Synchronization Check");
  log(colors.cyan, `   Reference: ${REFERENCE_LANG} | Targets: ${TARGET_LANGS.join(", ")}`);
  console.log("=".repeat(60));
  console.log("");

  let hasIssues = false;
  const summary = [];

  for (const ns of NAMESPACES) {
    const result = checkNamespace(ns);
    if (!result) {
      log(colors.yellow, `⚠️  ${ns}: zh-TW file not found, skip`);
      continue;
    }

    let nsOk = true;
    for (const lang of TARGET_LANGS) {
      const { missing, extra } = result.langs[lang];
      if (missing.length > 0 || extra.length > 0) {
        nsOk = false;
        hasIssues = true;
      }
    }

    if (nsOk) {
      log(colors.green, `✅ ${ns}: ${result.refKeyCount} keys, all synced`);
      summary.push({ ns, status: "ok", keys: result.refKeyCount });
    } else {
      log(colors.yellow, `⚠️  ${ns}: ${result.refKeyCount} keys`);
      summary.push({ ns, status: "issues", keys: result.refKeyCount });

      for (const lang of TARGET_LANGS) {
        const { missing, extra } = result.langs[lang];
        if (missing.length > 0) {
          console.log(`   ${lang}: missing ${missing.length} key(s)`);
          if (missing.length <= 5) {
            missing.forEach((k) => console.log(`      - ${k}`));
          } else {
            missing.slice(0, 3).forEach((k) => console.log(`      - ${k}`));
            console.log(`      ... and ${missing.length - 3} more`);
          }
        }
        if (extra.length > 0) {
          console.log(`   ${lang}: extra ${extra.length} key(s) (not in zh-TW)`);
          if (extra.length <= 5) {
            extra.forEach((k) => console.log(`      - ${k}`));
          } else {
            extra.slice(0, 3).forEach((k) => console.log(`      - ${k}`));
            console.log(`      ... and ${extra.length - 3} more`);
          }
        }
      }
      console.log("");
    }
  }

  console.log("");
  if (hasIssues) {
    log(colors.yellow + colors.bold, "⚠️  Some namespaces have sync issues.");
    log(colors.yellow, "   Add missing keys to en/ja/ko using zh-TW as reference.");
    process.exit(1);
  } else {
    log(colors.green + colors.bold, "🎉 All i18n namespaces are fully synchronized!");
    process.exit(0);
  }
}

main();
