export interface TestCaseItem {
  id: string;
  input: string;
  output?: string; // Expected Output

  // For problem test cases (ProblemForm)
  isSample?: boolean; // Is this a sample test case (shown to students)
  isHidden?: boolean; // Is this test case hidden from students

  // For Solver custom test cases
  source?: "public" | "custom";

  // Result specific (SubmissionDetailModal)
  status?: string;
  execTime?: number; // ms
  memoryUsage?: number; // KB
  errorMessage?: string;
  actualOutput?: string;
  score?: number;
}

/**
 * TestCaseList Modes:
 * - 'solver': For ProblemCodingTab - shows public test cases (readonly) + custom test cases (editable/deletable)
 * - 'problem': For ProblemForm - all test cases editable, with public/hidden toggle
 * - 'result': For SubmissionDetailModal - readonly display with execution results
 */
export type TestCaseMode = "solver" | "problem" | "result";
