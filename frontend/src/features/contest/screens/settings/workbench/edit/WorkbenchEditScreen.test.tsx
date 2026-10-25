import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { paperFixture, questionFixture } from "./workbenchEdit.fixture";
import type { WorkbenchEditRailProps } from "./WorkbenchEditRail";
import WorkbenchEditScreen from "./WorkbenchEditScreen";
const mocks = vi.hoisted(() => ({
  getExamPaper: vi.fn(),
  createExamPaperBlock: vi.fn(),
  updateExamPaperBlock: vi.fn(),
  deleteExamPaperBlock: vi.fn(),
  reorderExamPaperBlocks: vi.fn(),
  importExamQuestionsFromBank: vi.fn(),
  showToast: vi.fn(),
  contest: { id: "c1", status: "draft", questionEditLocked: false },
  rail: null as WorkbenchEditRailProps | null,
}));
vi.mock("@/infrastructure/api/repositories", () => mocks);
vi.mock("@/features/contest/contexts", () => ({
  useContest: () => ({ contest: mocks.contest }),
}));
vi.mock("@/shared/contexts/ToastContext", () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));
vi.mock("@/features/question-banks/components/SaveToBankModal", () => ({
  SaveToBankModal: () => null,
}));
vi.mock(
  "@/features/contest/components/admin/examEditor/QuestionBankImportModal",
  () => ({ default: () => null }),
);
vi.mock("./WorkbenchEditRail", async (original) => {
  const actual = await original<typeof import("./WorkbenchEditRail")>();
  return {
    ...actual,
    WorkbenchEditRail: (props: WorkbenchEditRailProps) => {
      mocks.rail = props;
      return <actual.WorkbenchEditRail {...props} />;
    },
  };
});
vi.mock("@/shared/ui/markdown/markdownEditor", () => ({
  MarkdownField: ({
    value,
    onChange,
    labelText,
  }: {
    value: string;
    onChange(v: string): void;
    labelText: string;
  }) => (
    <textarea
      aria-label={labelText}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));
vi.mock(
  "@/features/contest/components/admin/examEditor/hooks/useEditorImpactData",
  () => ({
    useEditorImpactData: () => ({
      status: "loaded",
      refresh: vi.fn(),
      impactContext: {
        questions: [],
        studentIds: [],
        answersByStudent: new Map(),
      },
    }),
  }),
);
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback: unknown, values?: Record<string, unknown>) =>
      typeof fallback === "string"
        ? fallback.replace(/\{\{(\w+)\}\}/g, (_, k) =>
            String(values?.[k] ?? ""),
          )
        : key,
  }),
}));
async function setup(query = "") {
  const view = render(
    <MemoryRouter initialEntries={["/?" + query]}>
      <WorkbenchEditScreen header={<h2>工作台</h2>} />
    </MemoryRouter>,
  );
  await waitFor(() => expect(mocks.rail).not.toBeNull());
  return view;
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    width: 240,
    height: 40,
    top: 0,
    bottom: 40,
    left: 0,
    right: 240,
    toJSON: () => ({}),
  });
  vi.clearAllMocks();
  mocks.rail = null;
  mocks.contest.questionEditLocked = false;
  mocks.getExamPaper.mockResolvedValue(paperFixture());
  mocks.reorderExamPaperBlocks.mockResolvedValue(paperFixture());
  mocks.createExamPaperBlock.mockResolvedValue({
    kind: "question",
    id: "new",
    question: questionFixture("new"),
  });
  mocks.updateExamPaperBlock.mockResolvedValue(paperFixture().blocks[1]);
});
describe("edit container", () => {
  it("empty paper shows empty state", async () => {
    mocks.getExamPaper.mockResolvedValue({
      questions: [],
      groups: [],
      sections: [],
      blocks: [],
    });
    await setup();
    expect(screen.getByText("考卷尚無題目")).toBeTruthy();
    expect(screen.getByRole("button", { name: "新增題目" })).toBeTruthy();
  });
  it("move sends full reorder payload", async () => {
    await setup();
    fireEvent.click(screen.getByRole("button", { name: "下移" }));
    await waitFor(() =>
      expect(mocks.reorderExamPaperBlocks).toHaveBeenCalledWith("c1", [
        { kind: "group", id: "g", children: ["c1", "c2"] },
        { kind: "question", id: "q1" },
        { kind: "question", id: "q2" },
      ]),
    );
  });
  it("reverts order and toasts when reorder fails", async () => {
    mocks.reorderExamPaperBlocks.mockRejectedValueOnce(new Error("offline"));
    await setup();
    fireEvent.click(screen.getByRole("button", { name: "下移" }));
    await waitFor(() =>
      expect(mocks.showToast).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "error" }),
      ),
    );
    expect(
      Array.from(document.querySelectorAll("[data-row-key]")).map((n) =>
        n.getAttribute("data-row-key"),
      ),
    ).toEqual(["q1", "g", "c1", "c2", "q2"]);
  });
  it("adds a question after the selected block", async () => {
    await setup();
    fireEvent.click(screen.getByRole("button", { name: "新增題目" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "單選題" }));
    await waitFor(() =>
      expect(mocks.createExamPaperBlock).toHaveBeenCalledWith("c1", {
        kind: "question",
        question: {
          question_type: "single_choice",
          prompt: "New question",
          score: 5,
          options: ["Option A", "Option B"],
          order: 1,
        },
      }),
    );
  });
  it("adds to the group when a group is selected", async () => {
    await setup("edit_item=g");
    fireEvent.click(screen.getByRole("button", { name: "新增題目" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "單選題" }));
    await waitFor(() =>
      expect(mocks.updateExamPaperBlock).toHaveBeenCalledWith("c1", "g", {
        kind: "group",
        children: [
          {
            question_type: "single_choice",
            prompt: "New question",
            score: 5,
            options: ["Option A", "Option B"],
          },
        ],
      }),
    );
  });
  it("keeps an invalid draft selected when another question is picked", async () => {
    await setup();
    fireEvent.change(screen.getByRole("textbox", { name: "題目敘述" }), {
      target: { value: "Keep my unsaved prompt" },
    });
    fireEvent.click(screen.getByRole("button", { name: "新增選項" }));
    await act(async () => {
      await mocks.rail!.onSelect("q2");
    });
    expect(screen.getByRole("textbox", { name: "題目敘述" })).toHaveValue(
      "Keep my unsaved prompt",
    );
    expect(screen.getByRole("textbox", { name: "選項 C" })).toHaveValue("");
    expect(mocks.updateExamPaperBlock).not.toHaveBeenCalled();
  });
  it("delete asks for confirmation", async () => {
    await setup();
    await act(async () => {
      void mocks.rail!.onSelect("q1");
    });
    fireEvent.click(screen.getByRole("button", { name: "更多操作" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /刪除這題$/ }));
    expect(mocks.deleteExamPaperBlock).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /刪除$/ }));
    await waitFor(() =>
      expect(mocks.deleteExamPaperBlock).toHaveBeenCalledWith("c1", "q1"),
    );
  });
  it("locked paper never calls structural APIs", async () => {
    mocks.contest.questionEditLocked = true;
    await setup();
    await act(async () => {
      mocks.rail!.onMove("q1", {
        zone: "top",
        refBlockId: "g",
        position: "after",
      });
      mocks.rail!.onAdd({ kind: "question", type: "essay" });
    });
    expect(mocks.createExamPaperBlock).not.toHaveBeenCalled();
    expect(mocks.updateExamPaperBlock).not.toHaveBeenCalled();
    expect(mocks.reorderExamPaperBlocks).not.toHaveBeenCalled();
    expect(mocks.deleteExamPaperBlock).not.toHaveBeenCalled();
  });
});

it("bar advances and closes as issues resolve", async () => {
  const first = paperFixture();
  first.questions[0].correctAnswer = null;
  first.questions[3].prompt = "New question";
  mocks.getExamPaper.mockResolvedValue(first);
  await setup();
  fireEvent.click(screen.getByRole("button", { name: /發布前檢查.*2/ }));
  fireEvent.click(
    await screen.findByRole("button", { name: /第 1 題.*Prompt q1/ }),
  );
  await screen.findByRole("navigation", { name: "發布前檢查導覽" });
  const second = paperFixture();
  second.questions[0].correctAnswer = 1;
  second.questions[3].prompt = "New question";
  mocks.getExamPaper.mockResolvedValue(second);
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole("radio", { name: "B" }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(
    screen.getByRole("navigation", { name: "發布前檢查導覽" }),
  ).toHaveTextContent("1/1");
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "New question",
  );
  const final = paperFixture();
  final.questions[0].correctAnswer = 1;
  final.questions[3].prompt = "Fixed prompt";
  mocks.getExamPaper.mockResolvedValue(final);
  fireEvent.change(screen.getByRole("textbox", { name: "題目敘述" }), {
    target: { value: "Fixed prompt" },
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(
    screen.queryByRole("navigation", { name: "發布前檢查導覽" }),
  ).toBeNull();
});

it("keeps the initial question selected after reordering the first block", async () => {
  const moved = paperFixture();
  moved.blocks = [moved.blocks[1], moved.blocks[0], moved.blocks[2]];
  mocks.reorderExamPaperBlocks.mockResolvedValue(moved);
  await setup();
  fireEvent.click(screen.getByRole("button", { name: "下移" }));
  await waitFor(() => expect(mocks.reorderExamPaperBlocks).toHaveBeenCalled());
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "Prompt q1",
  );
});

it("ends publish review when another item is selected from the rail", async () => {
  const paper = paperFixture();
  paper.questions[0].correctAnswer = null;
  mocks.getExamPaper.mockResolvedValue(paper);
  await setup();
  fireEvent.click(screen.getByRole("button", { name: /發布前檢查.*1/ }));
  fireEvent.click(
    await screen.findByRole("button", { name: /第 1 題.*Prompt q1/ }),
  );
  await screen.findByRole("navigation", { name: "發布前檢查導覽" });
  fireEvent.click(screen.getByRole("button", { name: /^第 2 題（題組）/ }));
  await waitFor(() =>
    expect(
      screen.queryByRole("navigation", { name: "發布前檢查導覽" }),
    ).toBeNull(),
  );
  await waitFor(() =>
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Shared task",
    ),
  );
});

it("keeps the paper total independent of rounded redistributed question scores", async () => {
  const paper = paperFixture();
  Object.assign(paper.questions[0], {
    score: 15,
    scorePolicy: "redistribute",
    effectiveMaxScore: 15,
  });
  Object.assign(paper.questions[1], { score: 5, effectiveMaxScore: 5.88 });
  Object.assign(paper.questions[2], { score: 10, effectiveMaxScore: 11.76 });
  Object.assign(paper.questions[3], { score: 70, effectiveMaxScore: 82.35 });
  mocks.getExamPaper.mockResolvedValue(paper);
  await setup();
  expect(screen.getByText(/4 題.*3 區塊.*總分 100/)).toBeTruthy();
});

it("keeps the mode header and legacy link while loading and after a load error", async () => {
  let reject: (err: Error) => void = () => {};
  mocks.getExamPaper.mockReturnValue(
    new Promise((_, fail) => {
      reject = fail;
    }),
  );
  render(
    <MemoryRouter initialEntries={["/?panel=grading-workbench"]}>
      <WorkbenchEditScreen header={<h2>工作台</h2>} />
    </MemoryRouter>,
  );
  expect(screen.getByRole("heading", { name: "工作台" })).toBeTruthy();
  await act(async () => reject(new Error("offline")));
  expect(await screen.findByRole("button", { name: "重新載入" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "工作台" })).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "改用舊版考卷管理" }),
  ).toHaveAttribute("href", expect.stringContaining("panel=problem_editor"));
});
