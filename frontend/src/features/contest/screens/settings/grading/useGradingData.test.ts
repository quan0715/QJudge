import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { useGradingData } from "./useGradingData";
import { getExamQuestions } from "@/infrastructure/api/repositories/examQuestions.repository";
import { getSubmissions } from "@/infrastructure/api/repositories/submission.repository";
import { getAllExamAnswersForGrading } from "@/infrastructure/api/repositories/examAnswers.repository";

const route = vi.hoisted(() => ({ contestId: "coding-1" }));
vi.mock("react-router-dom", () => ({ useParams: () => route }));
const context = vi.hoisted(() => ({ contest: { contestType: "coding", problems: [] }, scoreboardData: null }));
vi.mock("@/features/contest/contexts/ContestContext", () => ({ useContest: () => context }));
vi.mock("@/infrastructure/api/repositories/submission.repository", () => ({
  getSubmissions: vi.fn().mockResolvedValue({ results: [], count: 0 }),
}));
vi.mock("@/infrastructure/api/repositories/examAnswers.repository", () => ({
  getAllExamAnswersForGrading: vi.fn(), gradeExamAnswer: vi.fn(), ungradeExamAnswer: vi.fn(),
}));
vi.mock("@/infrastructure/api/repositories/examQuestions.repository", () => ({
  getExamQuestions: vi.fn().mockResolvedValue([]),
}));

beforeEach(() => {
  vi.clearAllMocks();
  route.contestId = "coding-1";
  context.contest.contestType = "coding";
});

describe("background reload", () => {
  it("reloads answers without switching the screen to loading", async () => {
    context.contest.contestType = "paper_exam";
    vi.mocked(getAllExamAnswersForGrading).mockResolvedValue({ data: [] } as never);
    const loadingHistory: boolean[] = [];
    const { result } = renderHook(() => {
      const data = useGradingData();
      loadingHistory.push(data.loading);
      return data;
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    loadingHistory.length = 0;

    const rows = await result.current.reloadAnswers();

    expect(rows).toEqual([]);
    expect(getAllExamAnswersForGrading).toHaveBeenCalledTimes(2);
    expect(loadingHistory).not.toContain(true);
  });
});

describe("paper grading data", () => {
  it("does not load submissions or invent essay answers for coding contests", async () => {
    const { result } = renderHook(() => useGradingData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.answers).toEqual([]);
    expect(getSubmissions).not.toHaveBeenCalled();
    expect(getAllExamAnswersForGrading).not.toHaveBeenCalled();
  });
});


it("ignores a previous contest's delayed answers", async () => {
  context.contest.contestType = "paper_exam";
  const pending: Record<string, (value: unknown) => void> = {};
  vi.mocked(getAllExamAnswersForGrading).mockImplementation((id) => new Promise(resolve => { pending[id] = resolve as (value: unknown) => void; }));
  const {result, rerender} = renderHook(() => useGradingData());
  route.contestId = "new-contest";
  rerender();
  await act(async () => pending["new-contest"]({data: [{id: "new-answer", questionId: "new-question", score: 7}]}));
  expect(result.current.answers[0].id).toBe("new-answer");
  await act(async () => pending["coding-1"]({data: [{id: "old-answer", questionId: "old-question", score: 1}]}));
  expect(result.current.answers[0].id).toBe("new-answer");
});


it("reuses question definitions while polling fresh scores", async () => {
  context.contest.contestType = "paper_exam";
  vi.mocked(getAllExamAnswersForGrading).mockResolvedValue({ data: [] } as never);
  const { result } = renderHook(() => useGradingData());
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { await result.current.reloadAnswers(); await result.current.reloadAnswers(); });
  expect(getAllExamAnswersForGrading).toHaveBeenCalledTimes(3);
  expect(getExamQuestions).toHaveBeenCalledTimes(1);
});

it("shares overlapping background score refreshes and releases them afterwards", async () => {
  context.contest.contestType = "paper_exam";
  vi.mocked(getAllExamAnswersForGrading).mockResolvedValue({ data: [] } as never);
  const { result } = renderHook(() => useGradingData());
  await waitFor(() => expect(result.current.loading).toBe(false));
  let resolve!: (value: never) => void;
  vi.mocked(getAllExamAnswersForGrading).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const one = result.current.reloadAnswers();
  const two = result.current.reloadAnswers();
  expect(getAllExamAnswersForGrading).toHaveBeenCalledTimes(2);
  await act(async () => { resolve({ data: [] } as never); await Promise.all([one, two]); });
  await act(async () => { await result.current.reloadAnswers(); });
  expect(getAllExamAnswersForGrading).toHaveBeenCalledTimes(3);
});


it("reloads question definitions on an explicit refresh", async () => {
  context.contest.contestType = "paper_exam";
  vi.mocked(getAllExamAnswersForGrading).mockResolvedValue({ data: [] } as never);
  const { result } = renderHook(() => useGradingData());
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { result.current.refreshData(); });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(getExamQuestions).toHaveBeenCalledTimes(2);
});

it("releases failed score requests so the next refresh can retry", async () => {
  context.contest.contestType = "paper_exam";
  vi.mocked(getAllExamAnswersForGrading).mockResolvedValue({ data: [] } as never);
  const { result } = renderHook(() => useGradingData());
  await waitFor(() => expect(result.current.loading).toBe(false));
  vi.mocked(getAllExamAnswersForGrading).mockRejectedValueOnce(new Error("temporary"));
  await act(async () => { await expect(result.current.reloadAnswers()).rejects.toThrow("temporary"); });
  await act(async () => { await result.current.reloadAnswers(); });
  expect(getAllExamAnswersForGrading).toHaveBeenCalledTimes(3);
  expect(getExamQuestions).toHaveBeenCalledTimes(1);
});


it("clears shared AI provenance immediately after human confirmation or ungrading", async () => {
  context.contest.contestType = "paper_exam";
  const aiAnswer = {
    id: "answer-1", questionId: "q1", participantUserId: "student-1",
    answer: { text: "answer" }, score: 8, feedback: "AI", isAiGraded: true,
    gradedByUsername: "other-teacher", gradedAt: "2026-10-26T00:00:00Z",
  };
  vi.mocked(getAllExamAnswersForGrading).mockResolvedValue({ data: [aiAnswer] } as never);
  const { result } = renderHook(() => useGradingData());
  await waitFor(() => expect(result.current.answers[0]?.isAiGraded).toBe(true));
  await act(async () => { await result.current.gradeAnswer("answer-1", 8, "AI"); });
  expect(result.current.answers[0].isAiGraded).toBe(false);
  expect(result.current.answers[0].score).toBe(8);
  await act(async () => { await result.current.reloadAnswers(); });
  expect(result.current.answers[0].isAiGraded).toBe(true);
  await act(async () => { await result.current.ungradeAnswer("answer-1"); });
  expect(result.current.answers[0].isAiGraded).toBe(false);
  expect(result.current.answers[0].score).toBeNull();
});

it("lists only participants who started the exam as students", async () => {
  context.contest.contestType = "paper_exam";
  vi.mocked(getAllExamAnswersForGrading).mockResolvedValue({ data: [] } as never);
  const participantsOverride = [
    { userId: "1", username: "submitted", examStatus: "submitted" },
    { userId: "2", username: "locked", examStatus: "locked" },
    { userId: "3", username: "ta_or_absent", examStatus: "not_started" },
  ] as never;
  const { result } = renderHook(() => useGradingData({ participantsOverride }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.students.map((student) => student.username)).toEqual(["submitted", "locked"]);
});
