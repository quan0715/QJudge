import { act, renderHook, waitFor } from "@testing-library/react";
import { useContestLayoutState } from "./useContestLayoutState";
import { getContest } from "@/infrastructure/api/repositories";
import type { ContestDetail } from "@/core/entities/contest.entity";

const route = vi.hoisted(() => ({ contestId: "a", pathname: "/classrooms/c/contest/a", navigate: vi.fn() }));
vi.mock("react-router-dom", () => ({ useParams: () => ({ contestId: route.contestId, classroomId: "c" }), useNavigate: () => route.navigate, useLocation: () => ({ pathname: route.pathname, search: "" }) }));
vi.mock("@/infrastructure/api/repositories", () => ({ getContest: vi.fn(), getContestStandings: vi.fn() }));
const runtime = { state: null, confirmedStatus: null, refresh: vi.fn() };
vi.mock("./useExamRuntimeState", async (original) => ({ ...await original<typeof import("./useExamRuntimeState")>(), useExamRuntimeState: () => runtime }));
const contest = { id: "a", status: "published", startTime: "2020-01-01", endTime: "2099-01-01", problems: [], hasJoined: true } as unknown as ContestDetail;
beforeEach(() => { vi.clearAllMocks(); route.contestId = "a"; route.pathname = "/classrooms/c/contest/a"; });

it.each([403, 500, "network"])("keeps initial %s failure retryable instead of redirecting to 404", async (status) => {
  const error = Object.assign(new Error(`failure ${status}`), { status });
  vi.mocked(getContest).mockRejectedValueOnce(error).mockResolvedValue(contest);
  const { result } = renderHook(useContestLayoutState);
  await waitFor(() => expect(result.current.contestLoading).toBe(false));
  expect(result.current.contestError).toBe(error);
  expect(result.current.contestNotFound).toBe(false);
  expect(route.navigate).not.toHaveBeenCalled();
  await act(() => result.current.refreshContest());
  expect(result.current.contest?.id).toBe("a");
  expect(result.current.contestError).toBeNull();
});
it("redirects a genuine initial 404", async () => {
  vi.mocked(getContest).mockResolvedValue(undefined);
  renderHook(useContestLayoutState);
  await waitFor(() => expect(route.navigate).toHaveBeenCalledWith("/not-found", { replace: true }));
});
it("keeps loaded monitoring data when a refresh fails", async () => {
  vi.mocked(getContest).mockResolvedValueOnce(contest).mockRejectedValue(new Error("offline"));
  const { result, rerender } = renderHook(useContestLayoutState);
  await waitFor(() => expect(result.current.contest?.id).toBe("a"));
  route.pathname += "/overview"; rerender();
  await waitFor(() => expect(result.current.contestError?.message).toBe("offline"));
  expect(result.current.contest?.hasJoined).toBe(true);
  expect(result.current.contestNotFound).toBe(false);
  expect(route.navigate).not.toHaveBeenCalled();
});
it("ignores the previous route's late failure", async () => {
  let reject!: (error: Error) => void;
  vi.mocked(getContest).mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; })).mockResolvedValue({ ...contest, id: "b" });
  const { result, rerender } = renderHook(useContestLayoutState);
  route.contestId = "b"; route.pathname = "/classrooms/c/contest/b"; rerender();
  await waitFor(() => expect(result.current.contest?.id).toBe("b"));
  await act(async () => reject(new Error("old request")));
  expect(result.current.contestError).toBeNull();
  expect(route.navigate).not.toHaveBeenCalled();
});
