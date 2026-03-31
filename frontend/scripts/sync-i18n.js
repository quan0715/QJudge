import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const I18N_DIR = path.join(__dirname, "../src/i18n/locales");
const LANGUAGES = ["zh-TW", "en", "ja", "ko"];
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
    
    // 1. Collect all keys and their values across all languages
    const allKeys = new Set();
    const langData = {};

    for (const lang of LANGUAGES) {
      const filePath = path.join(I18N_DIR, lang, `${ns}.json`);
      if (fs.existsSync(filePath)) {
        try {
          const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
          langData[lang] = flattenKeys(content);
          Object.keys(langData[lang]).forEach(k => allKeys.add(k));
        } catch (e) {
          console.error(`Error reading ${filePath}:`, e);
          langData[lang] = {};
        }
      } else {
        langData[lang] = {};
      }
    }

    // 2. Ensure every language has every key
    for (const lang of LANGUAGES) {
      const currentFlat = langData[lang];
      
      for (const key of allKeys) {
        // FORCE SYNC for branding-related keys OR if key is missing
        const isBrandingKey = 
          key.includes("QJudge") || 
          key.includes("NYCU") || 
          key.includes("陽明") ||
          key.includes("loadingTitle") ||
          key.includes("platform") ||
          key.includes("prefix") ||
          key.includes("product") ||
          key.includes("copyright") ||
          key.includes("hero.title") ||
          key.includes("seo.title") ||
          key.includes("seo.description") ||
          key.includes("testimonials.badge") ||
          key.includes("university.value");

        if (currentFlat[key] === undefined || (lang !== "zh-TW" && isBrandingKey)) {
          // Find a fallback value (prefer zh-TW for these generalized strings)
          let fallbackValue = "";
          if (langData["zh-TW"] && langData["zh-TW"][key] !== undefined) {
            fallbackValue = langData["zh-TW"][key];
          } else if (langData["en"] && langData["en"][key] !== undefined) {
            fallbackValue = langData["en"][key];
          } else {
            // Take the first available value
            for (const l of LANGUAGES) {
              if (langData[l] && langData[l][key] !== undefined) {
                fallbackValue = langData[l][key];
                break;
              }
            }
          }
          
          // Only overwrite if it contains branding OR it was missing
          if (currentFlat[key] === undefined || 
              (typeof currentFlat[key] === 'string' && 
               (currentFlat[key].includes("QJudge") || currentFlat[key].includes("NYCU") || currentFlat[key].includes("陽明")))) {
            
            // Special case: Keep NYCU SSO provider name
            if (key === "auth.campusSso.providers.nycu.name") {
              continue;
            }

            currentFlat[key] = fallbackValue;
            console.log(`    [${lang}] Overwriting/Adding key to remove branding: ${key}`);
          }
        }
      }

      // 3. Save back (sorted and unflattened)
      const unflattened = unflattenKeys(currentFlat);
      const filePath = path.join(I18N_DIR, lang, `${ns}.json`);
      fs.writeFileSync(filePath, JSON.stringify(unflattened, null, 2) + "\n", "utf-8");
    }
  }

  console.log("✅ i18n synchronization complete!");
}

sync();
