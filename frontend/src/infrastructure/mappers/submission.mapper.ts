import type {
  Submission,
  SubmissionDetail,
  TestResult,
  SubmissionStatus,
} from "@/core/entities/submission.entity";
import type {
  SubmissionDto,
  SubmissionDetailDto,
  TestCaseResultDto,
} from "../api/dto/submission.dto";
import { mapProblemDto } from "./problem.mapper";

export function mapTestResultDto(dto: TestCaseResultDto): TestResult {
  return {
    id: dto.id,
    testCaseId: dto.test_case || "",
    isHidden: !!dto.is_hidden,
    status: dto.status as SubmissionStatus,
    execTime: dto.exec_time || 0,
    memoryUsage: dto.memory_usage || 0,
    errorMessage: dto.error_message,
    input: dto.input,
    output: dto.output,
    expectedOutput: dto.expected_output,
  };
}

export function mapSubmissionDto(dto: SubmissionDto | any): Submission {
  // Handle problem being either an ID or a full object from older APIs or different contexts
  const problemId =
    typeof dto.problem === "object"
      ? dto.problem?.id?.toString()
      : dto.problem?.toString() || dto.problem_id?.toString() || "";

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
    username: dto.user?.username || dto.user_username || dto.username,
    language: dto.language || "",
    status: (dto.status || "pending") as SubmissionStatus,
    score: dto.score,
    execTime: dto.exec_time || 0,
    memoryUsage: dto.memory_usage,
    createdAt: dto.created_at || "",
    contestId: dto.contest?.toString() || dto.contest_id?.toString(),
  };
}

export function mapSubmissionDetailDto(dto: SubmissionDetailDto): SubmissionDetail {
  const submission = mapSubmissionDto(dto);

  return {
    ...submission,
    code: dto.code || "",
    errorMessage: dto.error_message,
    totalTestCases: dto.total_test_cases,

    user:
      dto.user && typeof dto.user === "object"
        ? {
            id: dto.user.id,
            username: dto.user.username,
            email: dto.user.email || "",
            role: (dto.user as any).role, // Optional role
          }
        : undefined,

    problem:
      dto.problem && typeof dto.problem === "object"
        ? mapProblemDto(dto.problem as any)
        : undefined,

    results: Array.isArray(dto.results)
      ? dto.results.map(mapTestResultDto)
      : [],
  };
}
