import { useEffect, type ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContestDetail } from "@/core/entities/contest.entity";
import ContestWorkbenchScreen from "./ContestWorkbenchScreen";
const mocks = vi.hoisted(() => ({ leave: vi.fn() }));
beforeEach(() => { mocks.leave.mockReset().mockResolvedValue(undefined); });
vi.mock("./ContestGradingWorkbenchScreen", () => ({
  default: ({ header }: { header: ReactNode }) => <div>{header}</div>,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_k: string, fallback: string) => fallback }),
}));
vi.mock("./workbench/edit/WorkbenchEditScreen", () => ({
  default: ({ header, registerBeforeLeave }: { header: ReactNode; registerBeforeLeave?: (flush: (() => Promise<void>) | null) => void }) => {
    useEffect(() => {
      registerBeforeLeave?.(mocks.leave);
      return () => registerBeforeLeave?.(null);
    }, [registerBeforeLeave]);
    return <div data-testid="paper-editor">{header}</div>;
  },
}));
vi.mock("@/features/contest/components/admin/examEditor/CodingTestEditorLayout", () => ({
  default: ({ header }: { header: ReactNode }) => <div>{header}<span>程式題與測資編輯器</span></div>,
}));
function Location() {
  return <output data-testid="query">{useLocation().search}</output>;
}
function setup(status: string, query = "") {
  return render(
    <MemoryRouter initialEntries={["/?" + query]}>
      <ContestWorkbenchScreen
        contestId="c"
        contest={{ id: "c", status } as ContestDetail}
      />
      <Location />
    </MemoryRouter>,
  );
}
describe("workbench shell", () => {
  it("draft grading is disabled with a reason", () => {
    setup("draft");
    expect(screen.getByRole("tab", { name: "批改" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "批改" })).toHaveAttribute(
      "title",
      "考試開始後才能批改",
    );
  });
  it("switches to edit and clears grading deep links", async () => {
    setup("published", "grading_question=q&grading_student=s");
    fireEvent.click(await screen.findByRole("tab", { name: "編輯" }));
    expect(screen.getByTestId("query")).toHaveTextContent(
      "workbench_mode=edit",
    );
    expect(screen.getByTestId("query")).not.toHaveTextContent(
      "grading_question",
    );
  });
  it("keeps question and answer exports accessible from the workbench", async () => {
    const onExport = vi.fn();
    render(<MemoryRouter initialEntries={["/?workbench_mode=edit"]}>
      <ContestWorkbenchScreen contestId="c" contest={{ id: "c", status: "draft", contestType: "paper_exam" } as ContestDetail} onExport={onExport} />
    </MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "匯出" }));
    expect(onExport).toHaveBeenCalledOnce();
  });
  it("keeps editing when pending changes cannot be saved before grading", async () => {
    mocks.leave.mockRejectedValue(new Error("save failed"));
    setup("published", "workbench_mode=edit");
    fireEvent.click(await screen.findByRole("tab", { name: "批改" }));
    await waitFor(() => expect(mocks.leave).toHaveBeenCalledOnce());
    expect(screen.getByTestId("paper-editor")).toBeInTheDocument();
    expect(screen.getByTestId("query")).toHaveTextContent("workbench_mode=edit");
    expect(screen.getByRole("tab", { name: "編輯" })).toHaveAttribute("aria-selected", "true");
  });
  it("keeps coding content and test cases in workbench edit without paper grading", async () => {
    render(<MemoryRouter initialEntries={["/?workbench_mode=grade&grading_question=old"]}>
      <ContestWorkbenchScreen contestId="coding" contest={{ id: "coding", status: "published", contestType: "coding" } as ContestDetail} />
    </MemoryRouter>);
    expect(await screen.findByText("程式題與測資編輯器")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "批改" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("paper-editor")).not.toBeInTheDocument();
  });
});
