import type { Submission, SubmissionDetail, TestResult } from '../submission.entity';
import { mapProblemDto } from './problemMapper';

export function mapTestResultDto(dto: any): TestResult {
  return {
    id: dto.id,
    testCase: {
      id: dto.test_case?.id,
      order: dto.test_case?.order || 0,
      isSample: !!dto.test_case?.is_sample
    },
    status: dto.status,
    execTime: dto.exec_time || 0,
    memoryUsage: dto.memory_usage || 0,
    errorMessage: dto.error_message,
    input: dto.input,
    output: dto.output,
    expectedOutput: dto.expected_output
  };
}

export function mapSubmissionDto(dto: any): Submission {
  return {
    id: dto.id?.toString() || '',
    problemId: dto.problem?.toString() || dto.problem_id?.toString() || '',
    userId: dto.user?.id?.toString() || dto.user_id?.toString() || dto.user?.toString() || '',
    username: dto.user?.username || dto.username,
    language: dto.language || '',
    status: dto.status || 'pending',
    score: dto.score,
    execTime: dto.execution_time || dto.exec_time,
    memoryUsage: dto.memory_usage,
    createdAt: dto.created_at || '',
    contestId: dto.contest?.toString(),
    isTest: !!dto.is_test
  };
}

export function mapSubmissionDetailDto(dto: any): SubmissionDetail {
  const submission = mapSubmissionDto(dto);
  
  return {
    ...submission,
    code: dto.code || '',
    errorMessage: dto.error_message,
    
    // Map nested objects if present
    user: dto.user && typeof dto.user === 'object' ? {
      id: dto.user.id,
      username: dto.user.username,
      email: dto.user.email,
      role: dto.user.role
    } : undefined,
    
    problem: dto.problem && typeof dto.problem === 'object' ? mapProblemDto(dto.problem) : undefined,
    
    results: Array.isArray(dto.results) ? dto.results.map(mapTestResultDto) : [],
    customTestCases: dto.custom_test_cases || []
  };
}
