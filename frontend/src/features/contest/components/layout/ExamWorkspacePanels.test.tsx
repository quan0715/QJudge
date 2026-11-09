import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ExamWorkspacePanels } from "./ExamWorkspacePanels";
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({}) }));
vi.mock("../../contexts/ContestContext", () => ({ useContest: () => ({ contest: { id: "exam", contestType: "coding" } }) }));
vi.mock("../../contexts/useContestRuntimeNavigator", () => ({ useContestRuntimeNavigator: () => ({ items: [{ kind: "problem", data: { id: "binding", problemId: "coding-id", title: "A+B" } }], answeredIds: new Set() }) }));
vi.mock("../solver/submissions/ContestProblemSubmissions", () => ({ default: ({ contestId, codingProblemId }: { contestId: string; codingProblemId: string }) => <div>紀錄 {contestId}/{codingProblemId}</div> }));
afterEach(cleanup);
it("loads the underlying coding problem history only when expanded and keeps navigation separate", () => {
  const onQuestion = vi.fn();
  render(<ExamWorkspacePanels page="review" onQuestion={onQuestion} />);
  const toggle = screen.getByRole("button", { name: /A\+B.*未提交/ });
  expect(screen.queryByText("紀錄 exam/coding-id")).not.toBeInTheDocument();
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText("紀錄 exam/coding-id")).toBeVisible();
  expect(onQuestion).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "繼續作答：A+B" }));
  expect(onQuestion).toHaveBeenCalledWith(0);
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText("紀錄 exam/coding-id")).not.toBeInTheDocument();
});

it("hands the review page to the overview's records when there is no active answer sheet", () => {
  let slot: HTMLElement | null = null;
  render(<ExamWorkspacePanels page="review" onQuestion={vi.fn()} hasRecords recordsRef={(element) => { slot = element; }} />);
  expect(slot).toBeInstanceOf(HTMLElement);
  expect(screen.queryByText("尚未進入作答")).not.toBeInTheDocument();
});

it("places the review download action inside the same header as its title", () => {
  let target: HTMLElement | null = null;
  render(<ExamWorkspacePanels page="review" onQuestion={vi.fn()} hasRecords reviewActionsRef={element => { target = element; }} />);
  const header = screen.getByRole("heading", {name:"作答內容"}).closest("header");
  expect(target).toBeInstanceOf(HTMLElement);
  expect(header).toContainElement(target);
});
