import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const headerSpy = vi.fn();

vi.mock("@/features/problems/contexts/ProblemEditContext", () => ({
  useProblemEdit: () => ({
    autoSave: { globalStatus: "saved" },
  }),
}));

vi.mock("@/features/problems/screens/problemsIdEdit/components/ProblemEditHeader", () => ({
  default: (props: any) => {
    headerSpy(props);
    return <div data-testid="problem-edit-header">{props.title}</div>;
  },
}));

vi.mock("@/features/problems/screens/problemsIdEdit/components/ProblemEditSections", () => ({
  default: () => <div data-testid="problem-edit-sections" />,
}));

vi.mock("@/features/question-banks/contexts/BankCodingEditContext", () => ({
  BankCodingEditProvider: ({ children }: any) => <>{children}</>,
}));

vi.mock("@/features/problems/components/edit/common", () => ({
  GlobalSaveStatus: () => <div>save-status</div>,
}));

import EmbeddedBankCodingEditor from "./EmbeddedBankCodingEditor";

describe("EmbeddedBankCodingEditor", () => {
  it("hides back button and does not render preview action", () => {
    render(
      <EmbeddedBankCodingEditor
        bankId="bank-1"
        bankQuestion={{
          id: "q-1",
          bankId: "bank-1",
          questionType: "coding",
          title: "Q1",
          prompt: "",
          options: [],
          correctAnswer: null,
          score: 100,
          order: 0,
          difficulty: "easy",
          timeLimit: 1000,
          memoryLimit: 128,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        }}
      />
    );

    expect(screen.getByTestId("problem-edit-header")).toBeInTheDocument();
    const lastCall = headerSpy.mock.calls.at(-1)?.[0];
    expect(lastCall?.hideBackButton).toBe(true);
    expect(screen.queryByText("Preview")).not.toBeInTheDocument();
  });
});
