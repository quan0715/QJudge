import type { ExamStatusType } from "@/core/entities/contest.entity";

export interface ExamSessionResponse {
  status: string;
  exam_status?: ExamStatusType;
  submit_reason?: string;
  already_submitted?: boolean;
  error?: string;
}

export interface EndExamPayload {
  submit_reason?: string;
  upload_session_id?: string;
  source_module?: "screen_share" | "webcam";
}

export interface IExamSessionRepository {
  startExam(contestId: string): Promise<ExamSessionResponse>;
  endExam(
    contestId: string,
    payload?: EndExamPayload,
  ): Promise<ExamSessionResponse>;
}
