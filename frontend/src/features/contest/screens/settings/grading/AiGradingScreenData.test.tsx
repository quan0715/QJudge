import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAiGradingScreenData } from "./useAiGradingScreenData";
import { getAllExamAnswersForGrading } from "@/infrastructure/api/repositories/examAnswers.repository";
import type { ExamAnswerGrading } from "@/infrastructure/api/repositories/examAnswers.repository";
import type { ExamQuestion } from "@/core/entities/contest.entity";
import { getExamQuestions } from "@/infrastructure/api/repositories/examQuestions.repository";

const scope = vi.hoisted(() => ({ contestId: "contest-a", user: { id: "teacher-a" } }));
vi.mock("react-router-dom", () => ({ useParams: () => ({ contestId: scope.contestId }) }));
vi.mock("@/features/auth/contexts/AuthContext", () => ({ useAuth: () => ({ user: scope.user }) }));
vi.mock("@/infrastructure/api/repositories/examAnswers.repository", () => ({ getAllExamAnswersForGrading: vi.fn() }));
vi.mock("@/infrastructure/api/repositories/examQuestions.repository", () => ({ getExamQuestions: vi.fn(async () => []) }));
vi.mock("@/infrastructure/api/repositories/exam.repository", () => ({ getExamDashboardSummary: async () => ({ questions: [] }) }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const answer = (id: string, questionId: string, score: number | null = null) => ({
  id, questionId, participantUserId: "student", answer: "response", score,
}) as ExamAnswerGrading;
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(({ question }) => useAiGradingScreenData(question), { initialProps: { question: "A" }, wrapper });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getExamQuestions).mockResolvedValue([]);
  scope.contestId = "contest-a"; scope.user = { id: "teacher-a" };
});

it.each([
  [false, ["2(b)", "3"]],
  [true, ["3", "4"]],
] as const)("labels subjective questions from the full paper (expanded: %s)", async (expanded, expectedLabels) => {
  const questions = [
    { id: "objective", order: 0, questionType: "single_choice" },
    { id: "group-objective", order: 1, groupId: "group", questionType: "single_choice" },
    { id: "A", order: 2, groupId: "group", questionType: "essay" },
    { id: "essay", order: 3, questionType: "short_answer" },
  ].map((question) => ({ ...question, expandQuestionNumbers: expanded })) as ExamQuestion[];
  vi.mocked(getExamQuestions).mockResolvedValue(questions);
  vi.mocked(getAllExamAnswersForGrading).mockResolvedValue({ data: [answer("a", "A")] } as Awaited<ReturnType<typeof getAllExamAnswersForGrading>>);

  const { result } = setup();

  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(getExamQuestions).toHaveBeenCalledWith("contest-a");
  expect(result.current.questionProgress.map((question) => question.questionId)).toEqual(["A", "essay"]);
  expect(result.current.questionProgress.map((question) => question.questionLabel)).toEqual(expectedLabels);
  expect(result.current.answersByQuestion.get("A")?.[0].questionLabel).toBe(expectedLabels[0]);
});

it("settles A → B → A while both requests are pending and refreshes after a grade write", async () => {
  const a = deferred<{ data: ExamAnswerGrading[] }>(), b = deferred<{ data: ExamAnswerGrading[] }>();
  vi.mocked(getAllExamAnswersForGrading).mockImplementation((_id, options) => (options?.questionId === "A" ? a.promise : b.promise) as ReturnType<typeof getAllExamAnswersForGrading>);
  const { result, rerender } = setup();
  rerender({ question: "B" }); rerender({ question: "A" });
  await act(async () => { b.resolve({ data: [answer("b", "B")] }); a.resolve({ data: [answer("a", "A")] }); });
  await waitFor(() => expect(result.current.isQuestionLoading).toBe(false));
  expect(result.current.answersByQuestion.get("A")?.[0].id).toBe("a");
  expect(result.current.answersByQuestion.has("B")).toBe(false);
  vi.mocked(getAllExamAnswersForGrading).mockResolvedValue({ data: [answer("a", "A", 8)] } as Awaited<ReturnType<typeof getAllExamAnswersForGrading>>);
  await act(() => result.current.refresh());
  await waitFor(() => expect(result.current.answersByQuestion.get("A")?.[0].score).toBe(8));
});

it.each(["contest", "owner"])("does not expose a late result from the previous %s", async (change) => {
  const old = deferred<{ data: ExamAnswerGrading[] }>();
  vi.mocked(getAllExamAnswersForGrading).mockReturnValueOnce(old.promise as ReturnType<typeof getAllExamAnswersForGrading>);
  const { result, rerender } = setup();
  vi.mocked(getAllExamAnswersForGrading).mockResolvedValue({ data: [answer("new", "A")] } as Awaited<ReturnType<typeof getAllExamAnswersForGrading>>);
  if (change === "contest") scope.contestId = "contest-b";
  else scope.user = { id: "teacher-b" };
  rerender({ question: "A" });
  await waitFor(() => expect(result.current.answersByQuestion.get("A")?.[0].id).toBe("new"));
  await act(async () => { old.resolve({ data: [answer("old", "A")] }); });
  expect(result.current.answersByQuestion.get("A")?.[0].id).toBe("new");
});
