import { expect, test, type Page } from "@playwright/test";
import type { GradeAppealDetail } from "../../src/core/entities/gradeAppeal.entity";

const avatar = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><circle cx="14" cy="14" r="14" fill="#4589ff"/></svg>');
const makeTicket = (id: number): GradeAppealDetail => ({
  id, exam_answer: id, student_id: id + 10, student_username: `Student ${id}`, student_avatar_url: id === 1 ? avatar : null,
  question_id: `q${id}`, question_order: id - 1, question_label: `1(${id === 1 ? "a" : "b"})`, question_prompt: "Explain the original answer.",
  status: id === 3 ? "closed" : "open", waiting_for: id === 3 ? null : "staff", created_at: "2026-10-03T00:00:00Z", closed_at: null, closed_by: null,
  last_message_at: "2026-10-03T00:00:00Z", current_score: 6, current_max_score: 10, answer_format: "plain_text",
  answer: { question_prompt: "Shared rules\n\nExplain the original answer.", answer: { text: "My original answer\n    a * b * c" }, question_type: "essay", question_options: [], feedback: "Please explain your reasoning." },
  messages: [{ id: 1, author_id: id + 10, author_username: `Student ${id}`, author_avatar_url: id === 1 ? avatar : null, content: `Please review ${id}`, created_at: "2026-10-03T00:00:00Z" }],
});

function gate() {
  let release!: () => void;
  const promise = new Promise<void>(done => { release = done; });
  return { promise, release };
}

async function setup(page: Page) {
  let tickets = [makeTicket(1), makeTicket(2), makeTicket(3)];
  let sends = 0;
  let lists = 0;
  let details = 0;
  let readGate: ReturnType<typeof gate> | undefined;
  let writeGate: ReturnType<typeof gate> | undefined;
  await page.addInitScript(() => localStorage.setItem("i18nextLng", "zh-TW"));
  await page.route("**/api/v1/users/me", route => route.fulfill({json: {data: {id:1, username:"Teacher", role:"teacher", profile:{avatar_url: avatar}}, meta:{}}}));
  await page.route("**/api/v1/contests/exam/grade-appeals/**", async route => {
    const request = route.request();
    const match = new URL(request.url()).pathname.match(/grade-appeals\/(?:(\d+)\/(messages\/|close\/)?)?$/)!;
    if (!match[1]) {
      lists++;
      const snapshot = tickets;
      await readGate?.promise;
      return route.fulfill({json:{data:snapshot, meta:{}}});
    }
    const id = Number(match[1]);
    let ticket = tickets.find(ticket => ticket.id === id)!;
    if (request.method() === "POST") {
      await writeGate?.promise;
      if (match[2] === "messages/") {
        sends++;
        // Keep the response pending long enough to exercise repeated submit clicks.
        await new Promise(resolve => setTimeout(resolve, 100));
        ticket = {...ticket, waiting_for:"student", messages:[...ticket.messages, {
          id: 2, author_id: 1, author_username:"Teacher", author_avatar_url:avatar,
          content:request.postDataJSON().content, created_at:"2026-10-03T01:00:00Z",
        }]};
      } else ticket = {...ticket, status:"closed", waiting_for:null, closed_by:1};
      tickets = tickets.map(current => current.id === id ? ticket : current);
    } else {
      details++;
      await readGate?.promise;
    }
    return route.fulfill({json:{data:ticket, meta:{}}});
  });
  return {
    counts: () => ({sends, lists, details}),
    holdReads: () => { readGate = gate(); return readGate.release; },
    holdWrites: () => { writeGate = gate(); return writeGate.release; },
  };
}
const row = (page: Page, id = 1) => page.getByRole("button", {name: new RegExp(`^Student ${id}[^0-9]`)});

test("row expansion, keyboard collapse, drafts, avatars, replies, closure and reset", async ({page}, testInfo) => {
  const api = await setup(page);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/tests/browser/fixtures/grade-appeals.html");
  await expect(row(page)).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", {name:/查看申訴|重新整理申訴/})).toHaveCount(0);
  await expect(row(page).getByRole("img")).toHaveJSProperty("naturalWidth", 28);
  await expect(row(page, 2).locator("img")).toHaveCount(0);
  await expect(row(page, 2).locator('svg[role="img"]')).toHaveCount(1);
  await expect(row(page)).not.toContainText("#1");
  await expect(row(page, 3)).toContainText("已結案");
  await row(page).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Please review 1", {exact:true})).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", {name:"重新整理留言"})).toHaveCount(0);
  const firstInput = page.getByRole("textbox", {name:"複核回覆"});
  await firstInput.fill("Unsent draft");
  await row(page).focus();
  await page.keyboard.press("Escape");
  await expect(row(page)).toHaveAttribute("aria-expanded", "false");
  await expect(firstInput).toBeHidden();
  for (let i = 0; i < 3; i++) {
    await row(page).click();
    await expect(firstInput).toHaveValue("Unsent draft");
    await row(page).click();
  }
  await row(page).click();
  await expect(page.getByRole("region", {name:"申訴對話"}).getByRole("img", {name:"Teacher"})).toHaveJSProperty("naturalWidth", 28);
  await row(page, 2).click();
  const inputs = page.getByRole("textbox", {name:"複核回覆"});
  await expect(inputs).toHaveCount(2);
  expect(new Set(await inputs.evaluateAll(elements => elements.map(element => element.id))).size).toBe(2);
  await inputs.nth(1).fill("Second draft");
  await inputs.nth(0).fill("Reviewed original answer");
  await page.getByRole("button", {name:"送出回覆"}).first().evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect(row(page)).toContainText("等待考生回覆");
  await expect(page.getByText("Reviewed original answer", {exact:true})).toBeVisible();
  await expect(inputs.nth(1)).toHaveValue("Second draft");
  expect(api.counts()).toEqual({sends:1, lists:1, details:2});
  await page.screenshot({path:testInfo.outputPath("appeals-expanded-replied.png"), fullPage:true});
  await page.getByRole("button", {name:"結案", exact:true}).first().click();
  await expect(row(page)).toContainText("已結案");
  await expect(page.getByText("此申訴已結案，可查閱對話。")).toBeVisible();
  await page.getByRole("button", {name:"Reset", exact:true}).click();
  await expect(row(page)).toContainText("已結案");
  await expect(row(page, 2)).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("textbox", {name:"複核回覆"})).toHaveValue("Second draft");
  expect(api.counts().lists).toBe(2);
  expect(errors).toEqual([]);
  await row(page, 2).click();
  await page.screenshot({path:testInfo.outputPath("appeals-desktop.png"), fullPage:true});
});

test("mobile dark theme wraps expanded content without horizontal overflow", async ({page}, testInfo) => {
  await setup(page);
  await page.setViewportSize({width:390, height:844});
  await page.goto("/tests/browser/fixtures/grade-appeals.html?theme=g100");
  await row(page).click();
  await expect(page.getByText("Please review 1", {exact:true})).toBeVisible();
  await expect(page.getByRole("textbox")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  await page.screenshot({path:testInfo.outputPath("appeals-mobile-dark.png"), fullPage:true});
});

for (const action of ["reply", "close"] as const) {
  test(`Reset cannot roll back a pending ${action} when old reads return last`, async ({page}) => {
    const api = await setup(page);
    await page.goto("/tests/browser/fixtures/grade-appeals.html");
    await row(page).click();
    await expect(page.getByText("Please review 1", {exact:true})).toBeVisible();
    const releaseWrites = api.holdWrites();
    const releaseReads = api.holdReads();
    if (action === "reply") await page.getByRole("textbox", {name:"複核回覆"}).fill("Reviewed original answer");
    await page.getByRole("button", {name:action === "reply" ? "送出回覆" : "結案", exact:true}).click();
    await page.getByRole("button", {name:"Reset", exact:true}).click();
    await expect.poll(() => api.counts().lists).toBe(2);
    releaseWrites();
    await expect(row(page)).toContainText(action === "reply" ? "等待考生回覆" : "已結案");
    releaseReads();
    // Wait for both Reset requests to settle before checking the final row and conversation.
    await expect(page.getByRole("region", {name:"成績申訴管理"})).toHaveAttribute("aria-busy", "false");
    await expect(page.getByRole("region", {name:"申訴對話"})).toBeVisible();
    await expect(row(page)).toContainText(action === "reply" ? "等待考生回覆" : "已結案");
    if (action === "reply") {
      await expect(page.getByText("Reviewed original answer", {exact:true})).toBeVisible();
      await expect(page.getByRole("textbox")).toHaveValue("");
    } else {
      await expect(page.getByText("此申訴已結案，可查閱對話。")).toBeVisible();
      await expect(page.getByRole("textbox")).toHaveCount(0);
    }
  });
}
