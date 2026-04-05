/**
 * Contest admin — paper exam & coding problem editor（seed_e2e_data + 教室綁定）。
 * 僅涵蓋基本點擊；拖曳／reorder／drop slot 另開案例時再加。
 * 選擇器：data-testid，不依賴 i18n 文案。
 */
import { test, expect } from "@playwright/test";
import { loginViaAPI } from "../helpers/auth.helper";
import { TEST_CONTESTS } from "../helpers/data.helper";
import {
  clickCodingTemplateTile,
  clickFirstVisibleBankPreview,
  clickPaperExamTypeTile,
  clickQuestionSourceTab,
  gotoContestProblemEditor,
  gotoPaperContestProblemEditor,
  openQuestionSourcePanel,
  submitConfirmModal,
  expectSaveToBankModalVisible,
  waitCodingEditorShell,
  waitCodingSidebarMinProblems,
} from "../helpers/contest-editor.helper";

test.describe("Contest problem editor E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await loginViaAPI(page, "teacher");
  });

  test.describe("Paper exam (E2E Exam Mode Contest)", () => {
    test.describe.configure({ mode: "serial" });

    test("add from bank via click", async ({ page }) => {
      await gotoPaperContestProblemEditor(page, TEST_CONTESTS.examMode.name);
      const before = await page.locator("[data-question-id]").count();

      await openQuestionSourcePanel(page);
      await clickQuestionSourceTab(page, "question-source-tab-paper-bank");
      await clickFirstVisibleBankPreview(page);

      await expect(async () => {
        expect(await page.locator("[data-question-id]").count()).toBeGreaterThan(before);
      }).toPass({ timeout: 25000 });
    });

    test("add question type via click (single choice tile)", async ({ page }) => {
      await gotoPaperContestProblemEditor(page, TEST_CONTESTS.examMode.name);
      const before = await page.locator("[data-question-id]").count();

      await openQuestionSourcePanel(page);
      await clickQuestionSourceTab(page, "question-source-tab-paper-types");
      await clickPaperExamTypeTile(page, "single_choice");

      await expect(async () => {
        expect(await page.locator("[data-question-id]").count()).toBe(before + 1);
      }).toPass({ timeout: 20000 });
    });

    test("duplicate and delete an exam card", async ({ page }) => {
      await gotoPaperContestProblemEditor(page, TEST_CONTESTS.examMode.name);
      const before = await page.locator("[data-question-id]").count();
      const idsBefore = await page.locator("[data-question-id]").evaluateAll((els) =>
        els.map((el) => el.getAttribute("data-question-id")!).filter(Boolean),
      );
      const firstId = idsBefore[0];
      expect(firstId).toBeTruthy();

      await page.locator("[data-question-id]").first().click();
      const dupExam = page.getByTestId(`exam-card-duplicate-${firstId}`);
      await dupExam.scrollIntoViewIfNeeded();
      await dupExam.evaluate((el) => (el as HTMLElement).click());

      await expect(async () => {
        expect(await page.locator("[data-question-id]").count()).toBe(before + 1);
      }).toPass({ timeout: 20000 });

      const idsAfter = await page.locator("[data-question-id]").evaluateAll((els) =>
        els.map((el) => el.getAttribute("data-question-id")!).filter(Boolean),
      );
      const dupId = idsAfter.find((id) => !idsBefore.includes(id));
      expect(dupId).toBeTruthy();
      await page.locator(`[data-question-id="${dupId}"]`).first().click();
      await page.getByTestId(`exam-card-delete-${dupId}`).click();
      await submitConfirmModal(page);

      await expect(async () => {
        expect(await page.locator("[data-question-id]").count()).toBe(before);
      }).toPass({ timeout: 20000 });
    });

    test("open save-to-bank modal from card", async ({ page }) => {
      await gotoPaperContestProblemEditor(page, TEST_CONTESTS.examMode.name);
      const firstId = await page.locator("[data-question-id]").first().getAttribute("data-question-id");
      expect(firstId).toBeTruthy();
      await page.locator("[data-question-id]").first().click();
      await page.getByTestId(`exam-card-save-to-bank-${firstId}`).click();
      await expectSaveToBankModalVisible(page);
      await page.keyboard.press("Escape");
    });
  });

  test.describe("Coding (draft + published)", () => {
    test.describe.configure({ mode: "serial" });

    test("draft: add problem via template click", async ({ page }) => {
      await gotoContestProblemEditor(page, TEST_CONTESTS.draftCodingEditor.name);
      await waitCodingEditorShell(page);
      const before = await page.locator("[data-problem-id]").count();

      await openQuestionSourcePanel(page);
      await clickCodingTemplateTile(page);

      await expect(async () => {
        expect(await page.locator("[data-problem-id]").count()).toBeGreaterThan(before);
      }).toPass({ timeout: 25000 });
    });

    test("draft: add from coding bank via click", async ({ page }) => {
      await gotoContestProblemEditor(page, TEST_CONTESTS.draftCodingEditor.name);
      await waitCodingEditorShell(page);
      const before = await page.locator("[data-problem-id]").count();

      await openQuestionSourcePanel(page);
      await clickQuestionSourceTab(page, "question-source-tab-coding-bank");
      await clickFirstVisibleBankPreview(page);

      await expect(async () => {
        expect(await page.locator("[data-problem-id]").count()).toBeGreaterThan(before);
      }).toPass({ timeout: 25000 });
    });

    // 已發布：題庫點擊新增再刪除（避免反覆跑 E2E 後 clone_problem slug 撞鍵導致複製 API 500）
    test("published: add from bank then delete added problem", async ({ page }) => {
      await gotoContestProblemEditor(page, TEST_CONTESTS.active.name);
      await waitCodingSidebarMinProblems(page, 1);

      const before = await page.locator("[data-problem-id]").count();
      const idsBefore = await page.locator("[data-problem-id]").evaluateAll((els) =>
        els.map((el) => el.getAttribute("data-problem-id")!).filter(Boolean),
      );

      await openQuestionSourcePanel(page);
      await clickQuestionSourceTab(page, "question-source-tab-coding-bank");
      await clickFirstVisibleBankPreview(page);

      await expect(async () => {
        expect(await page.locator("[data-problem-id]").count()).toBeGreaterThan(before);
      }).toPass({ timeout: 35000 });

      const idsAfter = await page.locator("[data-problem-id]").evaluateAll((els) =>
        els.map((el) => el.getAttribute("data-problem-id")!).filter(Boolean),
      );
      const addedId = idsAfter.find((id) => !idsBefore.includes(id));
      expect(addedId).toBeTruthy();

      await page.locator(`[data-problem-id="${addedId}"]`).first().click();
      await page.getByTestId(`coding-card-delete-${addedId}`).click({ force: true });
      await submitConfirmModal(page);

      await expect(async () => {
        expect(await page.locator("[data-problem-id]").count()).toBe(before);
      }).toPass({ timeout: 20000 });
    });

    test("published: open save-to-bank from preview", async ({ page }) => {
      await gotoContestProblemEditor(page, TEST_CONTESTS.active.name);
      await waitCodingSidebarMinProblems(page, 1);

      const firstId = await page.locator("[data-problem-id]").first().getAttribute("data-problem-id");
      expect(firstId).toBeTruthy();
      await page.locator("[data-problem-id]").first().click();
      await page.getByTestId(`coding-card-save-to-bank-${firstId}`).click();
      await expectSaveToBankModalVisible(page);
      await page.keyboard.press("Escape");
    });
  });
});
