import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkbenchAiModal } from "./WorkbenchAiModal";

vi.mock("@copilot", () => ({
  useCopilotModels: () => ({
    models: [{ id: "m1", displayName: "DeepSeek V4.1 Flash" }],
    selectedModelId: "m1",
  }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown, options?: Record<string, unknown>) => {
      const text = typeof fallback === "string" ? fallback : key;
      const values = (typeof fallback === "object" ? fallback : options) as Record<string, unknown> | undefined;
      return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values?.[name] ?? ""));
    },
  }),
}));

const props = {
  open: true,
  title: "AI 批改第 3 題",
  ungradedCount: 2,
  regradeCount: 14,
  suggestAvailable: true,
  onClose: vi.fn(),
};

const radio = (name: string) => screen.queryByRole("radio", { name }) as HTMLInputElement | null;

describe("WorkbenchAiModal", () => {
  it("exam scope hides mode and range", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <WorkbenchAiModal {...props} scope="exam" examSummary={{ questions: 5, answers: 9 }} onConfirm={onConfirm} />,
    );
    expect(screen.getByText("批改 5 題、共 9 份未評分的作答，分數直接寫入成績。")).toBeTruthy();
    expect(radio("建議：審查採用後才寫入")).toBeNull();
    expect(radio("只批未評分的 2 份")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "開始" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ mode: "grade", range: "ungraded", modelId: "m1", newSession: false }));
  });

  it("question scope defaults to grade + ungraded", () => {
    render(<WorkbenchAiModal {...props} scope="question" onConfirm={vi.fn()} />);
    expect(radio("批改：直接寫入成績")?.checked).toBe(true);
    expect(radio("只批未評分的 2 份")?.checked).toBe(true);
    expect(radio("全部重改 14 份，人工調整的不動")?.checked).toBe(false);
  });

  it("zero ungraded disables ungraded and defaults to all", () => {
    render(<WorkbenchAiModal {...props} ungradedCount={0} scope="question" onConfirm={vi.fn()} />);
    expect(radio("只批未評分的 0 份")?.disabled).toBe(true);
    expect(radio("全部重改 14 份，人工調整的不動")?.checked).toBe(true);
  });

  it("suggest hidden for group", () => {
    render(<WorkbenchAiModal {...props} suggestAvailable={false} scope="question" onConfirm={vi.fn()} />);
    expect(radio("建議：審查採用後才寫入")).toBeNull();
    expect(radio("批改：直接寫入成績")).not.toBeNull();
  });

  it("confirm passes choice and model", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<WorkbenchAiModal {...props} scope="question" onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText("建議：審查採用後才寫入"));
    fireEvent.click(screen.getByText("全部重改 14 份，人工調整的不動"));
    fireEvent.click(screen.getByRole("button", { name: "開始" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ mode: "suggest", range: "all", modelId: "m1", newSession: false }));
  });

  it("with a batch session, grading asks whether to reuse it", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<WorkbenchAiModal {...props} scope="question" hasSession onConfirm={onConfirm} />);
    expect(radio("沿用目前的批改 session")?.checked).toBe(true);
    expect(screen.queryByText("批改模型")).toBeNull();

    fireEvent.click(screen.getByText("開新的 session"));
    expect(screen.getAllByText("批改模型").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "開始" }));

    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith({ mode: "grade", range: "ungraded", modelId: "m1", newSession: true }),
    );
  });

  it("a full regrade or suggestions do not offer a session choice", () => {
    render(<WorkbenchAiModal {...props} scope="question" hasSession onConfirm={vi.fn()} />);
    fireEvent.click(screen.getByText("全部重改 14 份，人工調整的不動"));
    expect(radio("沿用目前的批改 session")).toBeNull();
    fireEvent.click(screen.getByText("只批未評分的 2 份"));
    fireEvent.click(screen.getByText("建議：審查採用後才寫入"));
    expect(radio("沿用目前的批改 session")).toBeNull();
  });
});
