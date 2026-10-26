import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { questionFixture } from "./workbenchEdit.fixture";
import type { WorkbenchEditActions } from "./WorkbenchEditScreen";
import { WorkbenchQuestionEditor } from "./WorkbenchQuestionEditor";
vi.mock("./WorkbenchMarkdownField", () => ({
  default: ({
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
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback: string, values?: Record<string, unknown>) =>
      fallback.replace(/\{\{(\w+)\}\}/g, (_, k) => String(values?.[k] ?? "")),
  }),
}));
const actions = (): WorkbenchEditActions => ({
  saveQuestion: vi.fn().mockResolvedValue(undefined),
  saveGroup: vi.fn().mockResolvedValue(undefined),
  duplicate: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
  move: vi.fn().mockResolvedValue(undefined),
  saveToBank: vi.fn(),
  addChild: vi.fn().mockResolvedValue(undefined),
  confirmDiscard: vi.fn().mockResolvedValue(true),
});
const base = () => ({
  question: questionFixture("q1"),
  label: "第 1 題",
  locked: false,
  onNavigate: vi.fn(),
  actions: actions(),
  saveStatus: "idle" as const,
});
beforeEach(() =>
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
  }),
);
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe("question editor", () => {
  it("switches type from the shared menu and saves the selected type", async () => {
    vi.useFakeTimers();
    const props = base();
    render(<WorkbenchQuestionEditor {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "單選題" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "多選題" }));
    expect(screen.getByRole("button", { name: "多選題" })).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(props.actions.saveQuestion).toHaveBeenCalledWith(
      "q1", expect.objectContaining({ question_type: "multiple_choice" }),
    );
  });
  it("saves the new single-choice answer index", async () => {
    vi.useFakeTimers();
    const props = base();
    render(<WorkbenchQuestionEditor {...props} />);
    fireEvent.click(screen.getByRole("radio", { name: "B" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(props.actions.saveQuestion).toHaveBeenCalledWith(
      "q1",
      expect.objectContaining({ correct_answer: 1 }),
    );
  });
  it("shows direct duplicate, bank and delete actions without a score policy control", async () => {
    const props = base();
    render(<WorkbenchQuestionEditor {...props} />);
    expect(screen.getByRole("button", { name: "複製這題" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收錄到題庫" })).toBeInTheDocument();
    expect(screen.queryByText("分數政策")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /刪除這題$/ }));
    expect(props.actions.remove).toHaveBeenCalledWith("q1");
    expect(screen.queryByLabelText("作答格式")).toBeNull();
  });
});

it("keeps locked content read-only and discards unsaved grading edits", async () => {
  vi.useFakeTimers();
  const props = base();
  render(
    <WorkbenchQuestionEditor
      {...props}
      locked
      question={questionFixture("q1", {
        questionType: "essay",
        options: [],
        correctAnswer: "Original",
      })}
    />,
  );
  expect(screen.queryByRole("textbox", { name: "題目敘述" })).toBeNull();
  expect(screen.getByRole("button", { name: "問答題" })).toBeDisabled();
  fireEvent.change(screen.getByRole("textbox", { name: "評分參考答案" }), {
    target: { value: "Changed" },
  });
  expect(screen.getByText("1 項未儲存")).toBeTruthy();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(props.actions.saveQuestion).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "捨棄變更" }));
  expect(screen.getByRole("textbox", { name: "評分參考答案" })).toHaveValue(
    "Original",
  );
  expect(props.actions.saveQuestion).not.toHaveBeenCalled();
});
it("does not implicitly save locked changes when navigating", () => {
  const props = base();
  render(<WorkbenchQuestionEditor {...props} locked nextLabel="2." />);
  fireEvent.click(screen.getByRole("radio", { name: "B" }));
  fireEvent.click(screen.getByRole("button", { name: "下一題 2." }));
  expect(props.actions.saveQuestion).not.toHaveBeenCalled();
  expect(props.onNavigate).toHaveBeenCalledWith("next");
});
