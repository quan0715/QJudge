#!/usr/bin/env node
// Screenshots the student exam shell in all eight cases: paper and coding exams,
// each before, during, after and with published results.
//
//   node scripts/exam-shell-states.mjs [--dark] [--mobile] [--no-seed]
//
// Seeds the cases with `manage.py seed_exam_shell_states` in the dev backend
// container (dev only), signs in as the seed student, and writes PNGs to
// test-results/exam-shell-states/. Environment overrides:
//   QJ_BASE_URL          http://localhost:5173
//   QJ_BACKEND           online_judge-backend-1 (container running Django)
//   QJ_PAPER_SOURCE      paper exam to copy (default: 計概小考)
//   QJ_CODING_SOURCE     coding contest to copy (default: 程設練習)
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const args = new Set(process.argv.slice(2));
const baseURL = process.env.QJ_BASE_URL ?? "http://localhost:5173";
const backend = process.env.QJ_BACKEND ?? "online_judge-backend-1";
const paperSource = process.env.QJ_PAPER_SOURCE ?? "4acb6817-4a68-491c-85b2-f22531100260";
const codingSource = process.env.QJ_CODING_SOURCE ?? "2ddf8431-a1fd-4d06-8d1c-798922733014";
const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../test-results/exam-shell-states");
const viewports = args.has("--mobile")
  ? [{ name: "desktop", width: 1440, height: 900 }, { name: "mobile", width: 390, height: 844 }]
  : [{ name: "desktop", width: 1440, height: 900 }];
const scheme = args.has("--dark") ? "dark" : "light";
// Screenshots must not depend on the seed student's saved language and theme.
const language = process.env.QJ_LANGUAGE ?? "zh-TW";
const TYPES = ["paper_exam", "coding"];
const STATES = ["before", "during", "after", "published"];

function seed() {
  const output = execFileSync("docker", [
    "exec", backend, "python", "manage.py", "seed_exam_shell_states",
    "--paper", paperSource, "--coding", codingSource,
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return JSON.parse(output.trim().split("\n").pop());
}

function lastSeed() {
  // --no-seed reuses the current fixtures; ask Django for their ids without changing anything.
  const output = execFileSync("docker", ["exec", backend, "python", "manage.py", "shell", "-c", `
import json
from apps.contests.models import Contest
from apps.classrooms.models import Classroom
labels = {"考卷": "paper_exam", "程式": "coding"}
states = {"考前": "before", "考中": "during", "考後": "after", "成績公布後": "published"}
contests = {}
for c in Contest.objects.filter(name__startswith="[狀態] "):
    kind, state = c.name.removeprefix("[狀態] ").split(" · ")
    contests[f"{labels[kind]}:{states[state]}"] = str(c.id)
print(json.dumps({"classroom": str(Classroom.objects.get(name="E2E Test Classroom").uuid), "contests": contests}))
`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return JSON.parse(output.trim().split("\n").pop());
}

function pinPreferences(value) {
  if (Array.isArray(value)) return value.map(pinPreferences);
  if (!value || typeof value !== "object") return value;
  const pinned = Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, pinPreferences(inner)]));
  if ("preferred_theme" in pinned) pinned.preferred_theme = scheme;
  if ("preferred_language" in pinned) pinned.preferred_language = language;
  return pinned;
}

async function signIn(context) {
  // Answer the preferences request with the run's language and theme; the account is left as is.
  await context.route("**/api/v1/users/me/preferences", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    await route.fulfill({ response, json: pinPreferences(await response.json()) });
  });
  const page = await context.newPage();
  const response = await page.request.post("/api/v1/auth/login/password", {
    data: { identifier: "student@example.com", password: "student123" },
  });
  if (!response.ok()) throw new Error(`Sign-in failed: ${response.status()}`);
  const { data } = await response.json();
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(({ token, user, theme, lang }) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
    localStorage.setItem("themePreference", theme);
    localStorage.setItem("i18nextLng", lang);
  }, { token: data.access_token, user: pinPreferences(data.user), theme: scheme, lang: language });
  return page;
}

// Ready once the shell is up and no Carbon loader is spinning; slow pages are reported, not hidden.
async function settle(page, file, problems) {
  await page.locator("[data-exam-shell]").first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  try {
    await page.waitForFunction(
      () => !document.querySelector(".cds--loading:not(.cds--loading--stop), .cds--inline-loading__animation"),
      undefined,
      { timeout: 20_000 },
    );
  } catch {
    problems.push(`${file}: still loading after 20s`);
  }
  // Park the pointer and drop focus so no tooltip from the last click is captured, then let it fade.
  const { width, height } = page.viewportSize();
  await page.mouse.move(width - 4, height - 4);
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
  await page.waitForTimeout(1_200);
}

async function capture(page, file, problems) {
  await page.screenshot({ path: path.join(outDir, file) });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  if (overflow) problems.push(`${file}: horizontal overflow`);
  return file;
}

const STATE_LABELS = { before: "考前", during: "考中", after: "考後", published: "成績公布後" };
const SHOT_LABELS = { overview: "概覽", answering: "作答頁", review: "作答檢查" };

// One sheet per viewport: a row per exam type, every case side by side, so a run is checked at a glance.
async function contactSheet(browser, viewportName) {
  const cells = (type) => STATES.flatMap((state) => ["overview", "answering", "review"].map((shot) => {
    const file = `${viewportName}-${scheme}-${type}-${state}-${shot}.png`;
    try {
      const src = `data:image/png;base64,${readFileSync(path.join(outDir, file)).toString("base64")}`;
      return `<figure><figcaption>${STATE_LABELS[state]} · ${SHOT_LABELS[shot]}</figcaption><img src="${src}"></figure>`;
    } catch {
      return "";
    }
  })).join("");
  const html = `<style>body{margin:16px;font:14px system-ui;background:#fff}h2{margin:16px 0 8px}
    .row{display:grid;grid-template-columns:repeat(7,1fr);gap:10px}figure{margin:0}
    figcaption{margin-bottom:4px;color:#444}img{width:100%;border:1px solid #ccc}</style>
    <h2>考卷考試</h2><div class="row">${cells("paper_exam")}</div>
    <h2>程式考試</h2><div class="row">${cells("coding")}</div>`;
  const page = await browser.newPage({ viewport: { width: 2800, height: 900 } });
  await page.setContent(html);
  const file = `${viewportName}-${scheme}-contact-sheet.png`;
  await page.screenshot({ path: path.join(outDir, file), fullPage: true });
  await page.close();
  return file;
}

const fixtures = args.has("--no-seed") ? lastSeed() : seed();
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ channel: process.env.CI ? undefined : "chrome", headless: true });
const files = [];
const problems = [];

for (const viewport of viewports) {
  const context = await browser.newContext({ baseURL, viewport, colorScheme: scheme });
  const page = await signIn(context);
  page.on("pageerror", (error) => problems.push(`${page.url()}: ${error.message}`));
  for (const type of TYPES) {
    for (const state of STATES) {
      const id = fixtures.contests[`${type}:${state}`];
      const root = `/classrooms/${fixtures.classroom}/contest/${id}`;
      const prefix = `${viewport.name}-${scheme}-${type}-${state}`;
      await page.goto(root);
      await settle(page, `${prefix}-overview.png`, problems);
      files.push(await capture(page, `${prefix}-overview.png`, problems));
      if (state === "during") {
        await page.goto(`${root}/solve`);
        await settle(page, `${prefix}-answering.png`, problems);
        files.push(await capture(page, `${prefix}-answering.png`, problems));
      }
      if (state === "after" || state === "published") {
        await page.locator('[data-exam-shell] nav button[data-page="review"]').click();
        await settle(page, `${prefix}-review.png`, problems);
        files.push(await capture(page, `${prefix}-review.png`, problems));
      }
    }
  }
  await context.close();
  files.push(await contactSheet(browser, viewport.name));
}
await browser.close();

console.log(`${files.length} screenshots in ${outDir}`);
for (const file of files) console.log(`  ${file}`);
if (problems.length) {
  console.log("\nProblems:");
  for (const problem of problems) console.log(`  ${problem}`);
  process.exitCode = 1;
}
