import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const I18N_DIR = path.join(__dirname, "../src/i18n/locales");
const REFERENCE_LANG = "zh-TW";
const TARGET_LANGS = ["en", "ja", "ko"];
const ALL_LANGUAGES = [REFERENCE_LANG, ...TARGET_LANGS];
const NAMESPACES = ["admin", "chatbot", "classroom", "common", "contest", "docs", "landing", "problem"];

function flattenKeys(obj, prefix = "") {
  const keys = {};
  for (const k of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (
      typeof obj[k] === "object" &&
      obj[k] !== null &&
      !Array.isArray(obj[k])
    ) {
      Object.assign(keys, flattenKeys(obj[k], fullKey));
    } else {
      keys[fullKey] = obj[k];
    }
  }
  return keys;
}

function unflattenKeys(flatKeys) {
  const result = {};
  const sortedKeys = Object.keys(flatKeys).sort();
  
  for (const key of sortedKeys) {
    const parts = key.split(".");
    let current = result;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) current[part] = {};
      current = current[part];
    }
    current[parts[parts.length - 1]] = flatKeys[key];
  }
  return result;
}

function sync() {
  console.log("🔄 Starting i18n synchronization...");

  for (const ns of NAMESPACES) {
    console.log(`  Processing namespace: ${ns}`);
    
    const refPath = path.join(I18N_DIR, REFERENCE_LANG, `${ns}.json`);
    if (!fs.existsSync(refPath)) {
      console.warn(`    ⚠️ Reference file missing: ${refPath}`);
      continue;
    }

    let refFlat = {};
    try {
      refFlat = flattenKeys(JSON.parse(fs.readFileSync(refPath, "utf-8")));
    } catch (e) {
      console.error(`Error reading ${refPath}:`, e);
      continue;
    }

    const refKeys = Object.keys(refFlat);

    // Write back sorted zh-TW
    const sortedRef = unflattenKeys(refFlat);
    fs.writeFileSync(refPath, JSON.stringify(sortedRef, null, 2) + "\n", "utf-8");

    // Sync target languages
    for (const lang of TARGET_LANGS) {
      const filePath = path.join(I18N_DIR, lang, `${ns}.json`);
      let currentFlat = {};

      if (fs.existsSync(filePath)) {
        try {
          currentFlat = flattenKeys(JSON.parse(fs.readFileSync(filePath, "utf-8")));
        } catch (e) {
          console.error(`Error reading ${filePath}:`, e);
          currentFlat = {};
        }
      }

      const syncedFlat = {};
      for (const key of refKeys) {
        if (currentFlat[key] !== undefined) {
          syncedFlat[key] = currentFlat[key];
        } else {
          // Fallback to zh-TW
          syncedFlat[key] = refFlat[key];
          console.log(`    [${lang}] Adding missing key: ${key}`);
        }
      }

      const unflattened = unflattenKeys(syncedFlat);
      fs.writeFileSync(filePath, JSON.stringify(unflattened, null, 2) + "\n", "utf-8");
    }
  }

  console.log("✅ i18n synchronization complete!");
}

sync();
