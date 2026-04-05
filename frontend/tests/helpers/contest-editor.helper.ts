import { expect, type Locator, type Page } from "@playwright/test";
import { API_ENDPOINTS } from "./data.helper";
import { getContestClassroomId } from "./exam-precheck.helper";

async function authHeaders(page: Page): Promise<Record<string, string>> {
  const token = await page.evaluate(() => localStorage.getItem("token"));
  expect(token).toBeTruthy();
  return { Authorization: `Bearer ${token}` };
}

/** 同一 Playwright worker 內共用，避免每個測試都打 list API 觸發 429。 */
const contestIdByExactName = new Map<string, string>();

/**
 * Resolve contest UUID from list API by exact name (teacher/admin must have access).
 */
export async function findContestIdByName(page: Page, name: string): Promise<string> {
  const hit = contestIdByExactName.get(name);
  if (hit) return hit;

  const headers = await authHeaders(page);
  const listUrl = `${API_ENDPOINTS.contests.list}?scope=manage`;

  let lastStatus = 0;
  const maxAttempts = 12;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const resp = await page.request.get(listUrl, { headers });
    lastStatus = resp.status();
    if (lastStatus === 429) {
      await page.waitForTimeout(Math.min(20_000, 1500 * (attempt + 1)));
      continue;
    }
    expect(resp.ok(), `contest list failed: ${lastStatus}`).toBeTruthy();
    const body = await resp.json();
    const list = Array.isArray(body) ? body : body.results ?? body.data ?? [];
    const contest = list.find((c: { name?: string }) => c?.name === name);
    expect(contest, `contest not found: ${name}`).toBeTruthy();
    const id = String(contest.id);
    contestIdByExactName.set(name, id);
    return id;
  }

  throw new Error(`contest list rate-limited or failed after retries (last HTTP ${lastStatus})`);
}

/**
 * Open contest admin problem editor tab (requires contest bound to a classroom).
 */
export async function gotoContestProblemEditor(page: Page, contestName: string): Promise<void> {
  const contestId = await findContestIdByName(page, contestName);
  const classroomId = await getContestClassroomId(page, contestId);
  await page.goto(
    `/classrooms/${classroomId}/contest/${contestId}/admin?panel=problem_editor`,
    { waitUntil: "domcontentloaded" },
  );
  await expect(page).toHaveURL(/panel=problem_editor/);
}

/**
 * 紙本競賽題目編輯：等候 WorkTree 寫入 data-question-id（避免 domcontentloaded 後 API 尚未回傳）。
 */
export async function gotoPaperContestProblemEditor(
  page: Page,
  contestName: string,
  minQuestions = 2,
): Promise<void> {
  await gotoContestProblemEditor(page, contestName);
  await expect(page).toHaveURL(/panel=problem_editor/, { timeout: 60000 });
  await expect(async () => {
    expect(await page.locator("[data-question-id]").count()).toBeGreaterThanOrEqual(minQuestions);
  }).toPass({ timeout: 90000 });
}

/**
 * Ensure question source panel or modal is open (desktop 預設為展開，若直接 click 會變成關閉).
 * 以紙本／程式各自存在的 Tab testid 判斷，避免寬版 Tab 捲動時 `filter(visible)` 誤判為全隱藏。
 */
export async function openQuestionSourcePanel(page: Page): Promise<void> {
  const toggle = page.getByTestId("contest-editor-open-source");
  await expect(toggle).toBeVisible({ timeout: 30000 });

  const panelOpenMarker = page
    .getByTestId("question-source-tab-coding-add")
    .or(page.getByTestId("question-source-tab-paper-types"))
    .or(page.getByTestId("question-source-tab-paper-bank"));

  const alreadyOpen = await panelOpenMarker.first().isVisible().catch(() => false);
  if (!alreadyOpen) {
    await toggle.click();
  }

  // 紙本模式兩個 Tab 同時符合 or()，toBeVisible 需單一定位。
  await expect(panelOpenMarker.first()).toBeVisible({ timeout: 30000 });
}

/** Carbon TabList 在窄寬時非選中分頁可能仍在 DOM 但不可見，需捲入視區並 force 點擊。 */
export async function clickQuestionSourceTab(page: Page, testId: string): Promise<void> {
  const tab = page.getByTestId(testId).filter({ visible: true }).first();
  await tab.scrollIntoViewIfNeeded();
  await tab.click({ force: true });
}

function bankPreviewLocator(page: Page): Locator {
  return page
    .locator('[data-testid^="question-source-bank-preview-"]')
    .filter({ visible: true })
    .first();
}

/**
 * 點擊題庫預覽以觸發 onAddBankQuestion：優先點內層 ClickableTile；DOM click 避免 draggable wrapper 誤觸 HTML5 drag。
 */
export async function clickFirstVisibleBankPreview(page: Page): Promise<void> {
  const preview = bankPreviewLocator(page);
  await expect(preview).toBeVisible({ timeout: 20000 });
  const clickable = preview.locator(".cds--tile--clickable").first();
  if ((await clickable.count()) > 0) {
    await clickable.scrollIntoViewIfNeeded();
    // Playwright 對外層 draggable wrapper 的完整指標路徑容易誤觸 HTML5 drag；DOM click 僅觸發 click。
    await clickable.evaluate((el) => (el as HTMLElement).click());
    return;
  }
  await preview.scrollIntoViewIfNeeded();
  await preview.evaluate((el) => (el as HTMLElement).click());
}

/** 紙本題型來源：Carbon Tile 含 draggable，以 DOM click 觸發 onAddType。 */
export async function clickPaperExamTypeTile(page: Page, examType: string): Promise<void> {
  const root = page.getByTestId(`question-source-exam-type-${examType}`);
  const tile = root.locator(".cds--tile").first();
  await expect(tile).toBeVisible({ timeout: 15000 });
  await tile.scrollIntoViewIfNeeded();
  await tile.evaluate((el) => (el as HTMLElement).click());
}

/** 程式題「新增題目」分頁：點擊 Carbon Tile（與題庫預覽相同，用 DOM click 避免 Playwright 指標誤觸拖曳）。 */
export async function clickCodingTemplateTile(page: Page): Promise<void> {
  const root = page.getByTestId("question-source-coding-template-tile").filter({ visible: true });
  await expect(root).toBeVisible({ timeout: 20000 });
  const tile = root.locator(".cds--tile").first();
  await tile.scrollIntoViewIfNeeded();
  await tile.evaluate((el) => (el as HTMLElement).click());
}

/** 程式題編輯器：題目來源開關已出現（代表 shell 已掛載）。 */
export async function waitCodingEditorShell(page: Page): Promise<void> {
  await expect(page.getByTestId("contest-editor-open-source")).toBeVisible({ timeout: 60000 });
}

/** 等候側欄至少 N 筆題目（接在 draft 長流程後載入較慢時，先確認 URL 再等 toolbar）。 */
export async function waitCodingSidebarMinProblems(page: Page, min: number): Promise<void> {
  await expect(page).toHaveURL(/panel=problem_editor/, { timeout: 60000 });
  await waitCodingEditorShell(page);
  await expect(async () => {
    expect(await page.locator("[data-problem-id]").count()).toBeGreaterThanOrEqual(min);
  }).toPass({ timeout: 60000 });
}

/** SaveToBankModal 可能有多個掛在 DOM，只斷言可見實例。 */
export async function expectSaveToBankModalVisible(page: Page): Promise<void> {
  const modal = page.getByTestId("save-to-bank-modal").filter({ visible: true }).first();
  await expect(modal).toBeVisible({ timeout: 10000 });
}

/** Carbon Modal footer: primary action is typically the last button。DOM 上可能有多個 confirm-modal 殘留，只操作可見者。 */
export async function submitConfirmModal(page: Page): Promise<void> {
  const modal = page.getByTestId("confirm-modal").filter({ visible: true }).first();
  await expect(modal).toBeVisible({ timeout: 10000 });
  await modal.locator(".cds--modal-footer button").last().click();
}
