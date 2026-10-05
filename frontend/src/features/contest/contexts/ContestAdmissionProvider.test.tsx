import { useEffect } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { ContestProvider, useContest } from "./ContestContext";
import { useContestLayoutState } from "../hooks/useContestLayoutState";
import { clearExamPrecheckPassed, hasExamPrecheckPassed, markExamPrecheckPassed, syncExamPrecheckGateByStatus } from "../anticheat/examPrecheckGate";

const mocks = vi.hoisted(() => ({getContest: vi.fn(), getRuntimeState: vi.fn()}));
vi.mock("@/infrastructure/api/repositories", () => ({getContest: mocks.getContest, getContestStandings: vi.fn()}));
vi.mock("@/infrastructure/api/repositories/exam.repository", () => ({
  EXAM_STARTED_EVENT: "qjudge:exam-started", EXAM_SUBMITTED_EVENT: "qjudge:exam-submitted", getRuntimeState: mocks.getRuntimeState,
}));
vi.mock("./IntegrityUploadProvider", () => ({IntegrityUploadProvider: ({children}: {children: React.ReactNode}) => children}));
vi.mock("./LiveMonitoringProvider", () => ({LiveMonitoringProvider: ({children}: {children: React.ReactNode}) => children}));
const contest = {id: "contest-1", hasJoined: true, examStatus: "not_started", cheatDetectionEnabled: true,
  contestType: "paper_exam", boundClassroomId: "room-1", startTime: "2026-01-01T00:00:00Z", endTime: "2099-01-01T00:00:00Z", problems: []};
const runtime = {server_now: "2026-10-05T10:00:00Z", schedule_revision: 1, exam_status: "not_started"};
let completed: boolean;
function Consumer() {
  const {contest, refreshContest} = useContest();
  // Same lifecycle effect as the real precheck screen; neither hook is mocked.
  useEffect(() => { syncExamPrecheckGateByStatus("contest-1", contest?.examStatus); }, [contest]);
  return <><div data-testid="status">{contest?.examStatus}</div><button onClick={async () => {
    window.dispatchEvent(new CustomEvent("qjudge:exam-started", {detail: {contestId: "contest-1"}}));
    await refreshContest(); markExamPrecheckPassed("contest-1"); completed = true;
  }}>admit</button></>;
}
function Layout() {
  const {runtime, contest, refreshContest} = useContestLayoutState();
  if (!contest) return null;
  return <ContestProvider runtime={runtime} initialContest={contest} onRefresh={refreshContest}><Consumer/></ContestProvider>;
}
beforeEach(() => {
  completed = false; clearExamPrecheckPassed("contest-1");
  mocks.getContest.mockReset().mockResolvedValue(contest);
  mocks.getRuntimeState.mockReset();
});
it.each([[false, "delayed"], [true, "delayed"], [false, "offline"], [true, "offline"], [false, "invalid"], [true, "invalid"]] as const)(
  "preserves re-entry gate with optional runtime %s / %s", async (external, outcome) => {
  let release!: (value: unknown) => void;
  let reject!: (reason: Error) => void;
  const pending = new Promise((resolve, fail) => {release = resolve; reject = fail;});
  mocks.getRuntimeState.mockResolvedValueOnce(runtime).mockReturnValue(pending);
  render(<MemoryRouter initialEntries={["/classrooms/room-1/contest/contest-1/exam-precheck"]}><Routes><Route
    path="/classrooms/:classroomId/contest/:contestId/exam-precheck"
    element={external ? <Layout/> : <ContestProvider><Consumer/></ContestProvider>}/></Routes></MemoryRouter>);
  await waitFor(() => expect(mocks.getRuntimeState).toHaveBeenCalledTimes(1));
  await screen.findByText("not_started");
  mocks.getContest.mockResolvedValue({...contest, examStatus: "in_progress"});
  fireEvent.click(screen.getByRole("button", {name: "admit"}));
  await waitFor(() => expect(completed).toBe(true));
  expect(screen.getByTestId("status").textContent).toBe("in_progress");
  expect(hasExamPrecheckPassed("contest-1")).toBe(true);
  await act(async () => {
    if (outcome === "offline") reject(new Error("runtime offline"));
    else release({...runtime, server_now: outcome === "invalid" ? "invalid" : runtime.server_now, exam_status: "in_progress"});
  });
  expect(screen.getByTestId("status").textContent).toBe("in_progress");
  expect(hasExamPrecheckPassed("contest-1")).toBe(true);
});
