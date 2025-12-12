#!/usr/bin/env node
/**
 * Documentation Translation Checker
 *
 * Checks if all documentation files have corresponding translations.
 * Outputs a report with missing files and i18n keys.
 *
 * Usage: node scripts/check-docs-translations.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const DOCS_DIR = path.join(__dirname, "../public/docs");
const I18N_DIR = path.join(__dirname, "../src/i18n/locales");
const LANGUAGES = ["en", "ja", "ko", "zh-TW"];
const REFERENCE_LANG = "en"; // Reference language for comparison

// ANSI colors for terminal output
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

// Load config.json to get all required doc items
function loadDocsConfig() {
  const configPath = path.join(DOCS_DIR, "config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  const items = [];
  for (const section of config.sections) {
    items.push(...section.items);
  }
  return { sections: config.sections, items };
}

// Check if a markdown file exists for a language
function checkMarkdownFiles(items) {
  const missing = {};

  for (const lang of LANGUAGES) {
    missing[lang] = [];
    const langDir = path.join(DOCS_DIR, lang);

    for (const item of items) {
      const filePath = path.join(langDir, `${item}.md`);
      if (!fs.existsSync(filePath)) {
        missing[lang].push(item);
      }
    }
  }

  return missing;
}

// Recursively get all keys from an object with dot notation
function getAllKeys(obj, prefix = "") {
  let keys = [];
  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === "object" && obj[key] !== null) {
      keys = keys.concat(getAllKeys(obj[key], fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

// Check if all i18n keys exist in all languages
function checkI18nKeys() {
  const missing = {};
  const referenceFile = path.join(I18N_DIR, REFERENCE_LANG, "docs.json");
  const referenceData = JSON.parse(fs.readFileSync(referenceFile, "utf-8"));
  const referenceKeys = getAllKeys(referenceData);

  for (const lang of LANGUAGES) {
    if (lang === REFERENCE_LANG) continue;

    missing[lang] = [];
    const langFile = path.join(I18N_DIR, lang, "docs.json");

    if (!fs.existsSync(langFile)) {
      missing[lang] = referenceKeys;
      continue;
    }

    const langData = JSON.parse(fs.readFileSync(langFile, "utf-8"));
    const langKeys = getAllKeys(langData);

    for (const key of referenceKeys) {
      if (!langKeys.includes(key)) {
        missing[lang].push(key);
      }
    }
  }

  return { missing, referenceKeys };
}

// Generate markdown table
function generateMarkdownTable(headers, rows) {
  if (rows.length === 0) return "";

  const headerRow = `| ${headers.join(" | ")} |`;
  const separatorRow = `| ${headers.map(() => "---").join(" | ")} |`;
  const dataRows = rows.map((row) => `| ${row.join(" | ")} |`);

  return [headerRow, separatorRow, ...dataRows].join("\n");
}

// Main function
function main() {
  console.log("");
  log(colors.bold + colors.cyan, "📚 Documentation Translation Checker");
  console.log("=".repeat(50));
  console.log("");

  const { sections, items } = loadDocsConfig();

  // Check markdown files
  log(colors.bold, "📄 Checking Markdown Files...");
  const missingMd = checkMarkdownFiles(items);
  let hasMissingMd = false;

  for (const lang of LANGUAGES) {
    if (missingMd[lang].length > 0) {
      hasMissingMd = true;
    }
  }

  if (!hasMissingMd) {
    log(colors.green, "✅ All markdown files are complete!\n");
  } else {
    log(colors.yellow, "⚠️  Missing markdown files found:\n");
  }

  // Check i18n keys
  log(colors.bold, "🌐 Checking i18n Keys (docs.json)...");
  const { missing: missingI18n, referenceKeys } = checkI18nKeys();
  let hasMissingI18n = false;

  for (const lang of LANGUAGES) {
    if (lang !== REFERENCE_LANG && missingI18n[lang]?.length > 0) {
      hasMissingI18n = true;
    }
  }

  if (!hasMissingI18n) {
    log(colors.green, "✅ All i18n keys are complete!\n");
  } else {
    log(colors.yellow, "⚠️  Missing i18n keys found:\n");
  }

  // Generate report
  if (hasMissingMd || hasMissingI18n) {
    console.log("");
    log(colors.bold + colors.blue, "📋 TRANSLATION REPORT");
    console.log("=".repeat(50));
    console.log("");
    console.log("Copy the content below to request AI translation:\n");
    console.log("---");
    console.log("");

    // Markdown files report
    if (hasMissingMd) {
      console.log("## Missing Markdown Files\n");
      console.log(
        "The following markdown documentation files are missing and need to be created:\n"
      );

      const mdRows = [];
      for (const lang of LANGUAGES) {
        if (missingMd[lang].length > 0) {
          for (const item of missingMd[lang]) {
            mdRows.push([lang, `${item}.md`, `public/docs/${lang}/${item}.md`]);
          }
        }
      }

      if (mdRows.length > 0) {
        console.log(
          generateMarkdownTable(["Language", "File", "Path"], mdRows)
        );
        console.log("");

        // Text description
        console.log("### Details\n");
        for (const lang of LANGUAGES) {
          if (missingMd[lang].length > 0) {
            console.log(
              `- **${lang}**: Missing ${
                missingMd[lang].length
              } file(s): ${missingMd[lang]
                .map((f) => `\`${f}.md\``)
                .join(", ")}`
            );
          }
        }
        console.log("");
      }
    }

    // i18n keys report
    if (hasMissingI18n) {
      console.log("## Missing i18n Keys (docs.json)\n");
      console.log(
        "The following translation keys are missing from docs.json files:\n"
      );

      const i18nRows = [];
      for (const lang of LANGUAGES) {
        if (lang !== REFERENCE_LANG && missingI18n[lang]?.length > 0) {
          for (const key of missingI18n[lang]) {
            i18nRows.push([lang, key, `src/i18n/locales/${lang}/docs.json`]);
          }
        }
      }

      if (i18nRows.length > 0) {
        console.log(
          generateMarkdownTable(["Language", "Missing Key", "File"], i18nRows)
        );
        console.log("");

        // Text description
        console.log("### Details\n");
        for (const lang of LANGUAGES) {
          if (lang !== REFERENCE_LANG && missingI18n[lang]?.length > 0) {
            console.log(
              `- **${lang}**: Missing ${missingI18n[lang].length} key(s) in \`docs.json\``
            );
            console.log(
              `  Keys: ${missingI18n[lang].map((k) => `\`${k}\``).join(", ")}`
            );
          }
        }
        console.log("");
      }
    }

    // AI prompt suggestion
    console.log("---\n");
    console.log("### Suggested AI Prompt\n");
    console.log("```");
    console.log(
      "Please help me create the missing translation files listed above."
    );
    console.log(
      `Use the English (en) version as reference and translate to the target languages.`
    );
    console.log(
      "Maintain the same structure and formatting as the original files."
    );
    console.log("```\n");

    console.log("---");
    console.log("");
    log(
      colors.yellow,
      "⚠️  Warning: Some translations are missing, but deployment will continue."
    );
  } else {
    log(colors.green + colors.bold, "🎉 All translations are complete!");
  }

  console.log("");

  // Exit with warning code if there are missing translations (but still allow deployment)
  // Exit code 0 = success, deployment continues
  process.exit(0);
}

main();
