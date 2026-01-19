import type {
  Submission,
  SubmissionDetail,
  TestResult,
} from "@/core/entities/submission.entity";
import { mapProblemDto } from "./problem.mapper";

export function mapTestResultDto(dto: any): TestResult {
  return {
    id: dto.id,
    testCaseId: dto.test_case, // API returns test_case as just the ID number
    isHidden: !!dto.is_hidden, // is_hidden is at top level, not inside test_case
    status: dto.status,
    execTime: dto.exec_time || 0,
    memoryUsage: dto.memory_usage || 0,
    errorMessage: dto.error_message,
    input: dto.input,
    output: dto.output,
    expectedOutput: dto.expected_output,
  };
}

export function mapSubmissionDto(dto: any): Submission {
  // Handle problem being either an ID or a full object
  const problemId =
    typeof dto.problem === "object"
      ? dto.problem?.id?.toString()
      : dto.problem?.toString() || dto.problem_id?.toString() || "";

  // Handle problem_title: can be a direct field or nested inside problem object
  const problemTitle =
    dto.problem_title ||
    (typeof dto.problem === "object" ? dto.problem?.title : undefined);

  return {
    id: dto.id?.toString() || "",
    problemId,
    problemTitle,
    userId:
      dto.user?.id?.toString() ||
      dto.user_id?.toString() ||
      dto.user?.toString() ||
      "",
    username: dto.user?.username || dto.username,
    language: dto.language || "",
    status: dto.status || "pending",
    score: dto.score,
    execTime: dto.execution_time ?? dto.exec_time ?? dto.execTime ?? 0,
    memoryUsage: dto.memory_usage ?? dto.memoryUsage,
    createdAt: dto.created_at ?? dto.createdAt ?? "",
    contestId: dto.contest?.toString() || dto.contest_id?.toString(),
    // @deprecated - Backend no longer uses is_test. Test runs use /problems/{id}/test_run/ endpoint.
    // Kept for backwards compatibility but will always be false for new submissions.
    isTest: false,
  };
}

export function mapSubmissionDetailDto(dto: any): SubmissionDetail {
  const submission = mapSubmissionDto(dto);

  return {
    ...submission,
    code: dto.code || "",
    errorMessage: dto.error_message,
    totalTestCases: dto.total_test_cases ?? dto.totalTestCases,

    // Map nested objects if present
    user:
      dto.user && typeof dto.user === "object"
        ? {
            id: dto.user.id,
            username: dto.user.username,
            email: dto.user.email,
            role: dto.user.role,
          }
        : undefined,

    problem:
      dto.problem && typeof dto.problem === "object"
        ? mapProblemDto(dto.problem)
        : undefined,

    results: Array.isArray(dto.results)
      ? dto.results.map(mapTestResultDto)
      : [],
    // @deprecated - Custom test cases now use /problems/{id}/test_run/ endpoint.
    // Kept for backwards compatibility with legacy data.
    customTestCases: dto.custom_test_cases || [],
  };
}
