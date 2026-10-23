import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CodingProblemDetail } from "@/core/entities/problem.entity";
import type { TestCaseItem } from "@/core/entities/testcase.entity";
import { ProblemFullPageSolve } from "./ProblemFullPageSolve";

const auth = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("@/features/auth/contexts/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("@/features/auth/hooks/useUserPreferences", () => ({
  useUserPreferences: () => ({ editorFontSize: 14, editorTabSize: 4, updateEditorSettings: vi.fn() }),
}));
vi.mock("@/features/problems/hooks/useSubmission", () => ({
  useSubmission: () => ({ executionState: { status: "idle" }, showing: 0, execute: vi.fn() }),
}));
vi.mock("@/features/problems/contexts/useJudgeQueue", () => ({ useWatchProblem: vi.fn() }));
vi.mock("@/shared/ui/modal", () => ({
  ConfirmModal: () => null,
  useConfirmModal: () => ({ confirm: vi.fn(), modalProps: { open: false } }),
}));
vi.mock("@/shared/layout/SolverLayout", () => ({
  SolverLayout: ({ editorPanel, resultPanel }: { editorPanel: ReactNode; resultPanel: ReactNode }) => <>{editorPanel}{resultPanel}</>,
}));
vi.mock("@/shared/ui/solver", () => ({
  StatementPanel: () => null,
  EditorContent: ({ code, onCodeChange }: { code: string; onCodeChange: (code: string) => void }) =>
    <textarea aria-label="Code" value={code} onChange={(event) => onCodeChange(event.target.value)} />,
  ResultPanel: ({ testCases, onAddTestCase }: { testCases: TestCaseItem[]; onAddTestCase: (input: string, output: string) => void }) => <>
    <button onClick={() => onAddTestCase("private input", "private output")}>Add case</button>
    <output data-testid="cases">{testCases.map((testCase) => testCase.input).join(",")}</output>
  </>,
}));

const props = {
  problem: {
    id: "problem-1", testCases: [],
    languageConfigs: [{ language: "cpp", templateCode: "// template", isEnabled: true }],
  } as CodingProblemDetail,
  contestId: "contest-1",
  renderSubmissions: () => null,
};

beforeEach(() => {
  // The shared test setup stubs storage without persistence; use browser-like
  // storage semantics here to exercise real draft reads and writes.
  const storage = new Map<string, string>();
  vi.mocked(localStorage.getItem).mockImplementation((key) => storage.get(key) ?? null);
  vi.mocked(localStorage.setItem).mockImplementation((key, value) => { storage.set(key, value); });
  auth.user = { id: "alice" };
});
afterEach(cleanup);

it("isolates drafts and custom cases when accounts change, including through logout", () => {
  const view = render(<ProblemFullPageSolve {...props} />);
  fireEvent.change(screen.getByLabelText("Code"), { target: { value: "Alice's code" } });
  fireEvent.click(screen.getByText("Add case"));

  auth.user = null;
  view.rerender(<ProblemFullPageSolve {...props} />);
  expect(screen.getByLabelText("Code")).toHaveValue("// template");
  expect(screen.getByTestId("cases")).toBeEmptyDOMElement();

  auth.user = { id: "bob" };
  view.rerender(<ProblemFullPageSolve {...props} />);
  expect(screen.getByLabelText("Code")).toHaveValue("// template");
  expect(screen.getByTestId("cases")).toBeEmptyDOMElement();
  fireEvent.change(screen.getByLabelText("Code"), { target: { value: "Bob's code" } });

  auth.user = { id: "alice" };
  view.rerender(<ProblemFullPageSolve {...props} />);
  expect(screen.getByLabelText("Code")).toHaveValue("Alice's code");
  expect(screen.getByTestId("cases")).toHaveTextContent("private input");
  auth.user = { id: "bob" };
  view.rerender(<ProblemFullPageSolve {...props} />);
  expect(screen.getByLabelText("Code")).toHaveValue("Bob's code");
  expect(screen.getByTestId("cases")).toBeEmptyDOMElement();
});

it("restores the same account's code and custom cases after remount", () => {
  const view = render(<ProblemFullPageSolve {...props} />);
  fireEvent.change(screen.getByLabelText("Code"), { target: { value: "Saved code" } });
  fireEvent.click(screen.getByText("Add case"));
  view.unmount();
  render(<ProblemFullPageSolve {...props} />);
  expect(screen.getByLabelText("Code")).toHaveValue("Saved code");
  expect(screen.getByTestId("cases")).toHaveTextContent("private input");
});

it("does not assign unowned legacy or anonymous drafts to a signed-in account", () => {
  localStorage.setItem("qjudge:contest:contest-1:problem:problem-1:code:cpp", "Unowned code");
  localStorage.setItem("qjudge:contest:contest-1:problem:problem-1:custom_test_cases", JSON.stringify([
    { id: "legacy", input: "Unowned input", output: "", source: "custom" },
  ]));
  auth.user = null;
  const view = render(<ProblemFullPageSolve {...props} />);
  fireEvent.change(screen.getByLabelText("Code"), { target: { value: "Anonymous code" } });
  fireEvent.click(screen.getByText("Add case"));
  auth.user = { id: "alice" };
  view.rerender(<ProblemFullPageSolve {...props} />);
  expect(screen.getByLabelText("Code")).toHaveValue("// template");
  expect(screen.getByTestId("cases")).toBeEmptyDOMElement();
});
