import type { Submission, SubmissionDetail, TestResult } from '../submission.entity';
import { mapProblemDto } from './problemMapper';

export function mapTestResultDto(dto: any): TestResult {
  return {
    id: dto.id,
    testCaseId: dto.test_case,  // API returns test_case as just the ID number
    isHidden: !!dto.is_hidden,  // is_hidden is at top level, not inside test_case
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
  // Handle problem being either an ID or a full object
  const problemId = typeof dto.problem === 'object' 
    ? dto.problem?.id?.toString() 
    : dto.problem?.toString() || dto.problem_id?.toString() || '';
  
  const problemTitle = typeof dto.problem === 'object'
    ? dto.problem?.title
    : undefined;

  return {
    id: dto.id?.toString() || '',
    problemId,
    problemTitle,
    userId: dto.user?.id?.toString() || dto.user_id?.toString() || dto.user?.toString() || '',
    username: dto.user?.username || dto.username,
    language: dto.language || '',
    status: dto.status || 'pending',
    score: dto.score,
    execTime: dto.execution_time ?? dto.exec_time ?? dto.execTime ?? 0,
    memoryUsage: dto.memory_usage ?? dto.memoryUsage,
    createdAt: dto.created_at ?? dto.createdAt ?? '',
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
