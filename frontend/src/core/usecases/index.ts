/**
 * Core Use Cases
 *
 * Business logic that orchestrates multiple repositories or contains complex rules.
 *
 * ## Usage Guidelines
 *
 * ### When to Call Use Cases Directly from Components
 *
 * Use Cases can be called directly when:
 * - One-time operations (join, leave, submit)
 * - No React state management needed
 * - No polling or subscriptions required
 *
 * ```tsx
 * import { joinContestUseCase } from "@/core/usecases/contest";
 *
 * const JoinButton = ({ contestId }) => {
 *   const handleClick = async () => {
 *     const result = await joinContestUseCase({ contestId });
 *     if (!result.success) {
 *       toast.error(result.error);
 *     }
 *   };
 *   return <Button onClick={handleClick}>Join</Button>;
 * };
 * ```
 *
 * ### When to Wrap in a Hook
 *
 * Create a custom hook when you need:
 * - Loading/error state management (`useState`)
 * - Polling or subscriptions (`useInterval`, `useEffect`)
 * - Data caching (`useQuery`)
 * - Multiple related operations with shared state
 *
 * ```tsx
 * // Hook for complex state management
 * function useSubmission() {
 *   const [isLoading, setIsLoading] = useState(false);
 *   const [error, setError] = useState<string | null>(null);
 *
 *   const submit = async (input: SubmitSolutionInput) => {
 *     setIsLoading(true);
 *     setError(null);
 *     const result = await submitSolutionUseCase(input);
 *     setIsLoading(false);
 *     if (!result.success) setError(result.error);
 *     return result;
 *   };
 *
 *   return { submit, isLoading, error };
 * }
 * ```
 *
 * ## Available Use Cases
 *
 * ### Exam
 * - `enterExamUseCase` - Start/resume exam with fullscreen
 * - `leaveExamUseCase` - End exam and exit fullscreen
 * - `recordViolationUseCase` - Record exam violation event
 *
 * ### Solver
 * - `testRunUseCase` - Execute test run (synchronous)
 * - `submitSolutionUseCase` - Submit solution for judging
 * - `pollSubmissionUseCase` - Poll for submission result
 *
 * ### Contest
 * - `joinContestUseCase` - Register for a contest
 * - `leaveContestUseCase` - Leave/unregister from a contest
 */

export * from "./exam";
export * from "./solver";
export * from "./contest";
