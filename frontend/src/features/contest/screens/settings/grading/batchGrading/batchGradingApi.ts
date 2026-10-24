export { getExamQuestions as readBatchQuestions } from "@/infrastructure/api/repositories/examQuestions.repository";
/**
 * Batch grading data access. Kept apart from the hook so copilot-aware code
 * never imports the chatbot repository directly (copilot dogfood boundary).
 */
import { getBatchGradeWrites, type BatchGradeWrite } from "@/infrastructure/api/repositories/examAnswers.repository";
import { serializeCsvRows } from "../gradeCsv";
import type { ChatMessage } from "@/core/types/chatbot.types";
import chatbotRepository, { getChatRun } from "@/infrastructure/api/repositories/chatbot.repository";
import {
  fetchArtifactContent,
  listArtifacts,
  uploadUserArtifact,
  type ArtifactRecord,
} from "@/infrastructure/api/repositories/artifact.repository";
import {
  BATCH_ARTIFACT_STEP,
  BATCH_JSON_FILENAME,
  parseWrittenCsv,
  writtenCsvFilename,
  PROGRESS_CSV_FILENAME,
  countScoredRows,
  gradeCsvFilename,
  type BatchActiveRun,
} from "./batchGradingModel";

const WRITTEN_PREFIX = "written_";

export interface BatchRemoteState {
  messages: ChatMessage[];
  activeRuns: BatchActiveRun[];
  progressCsv: string | null;
  /** Written-records CSV per question id. */
  writtenCsv: Record<string, string>;
  /** Rows the AI has scored so far per question id; read only while a run is active. */
  draftCounts: Record<string, number>;
}

function latestByFilename(artifacts: readonly ArtifactRecord[]): Map<string, ArtifactRecord> {
  const latest = new Map<string, ArtifactRecord>();
  for (const artifact of artifacts) {
    const current = latest.get(artifact.filename);
    if (!current || new Date(artifact.updated_at) > new Date(current.updated_at)) {
      latest.set(artifact.filename, artifact);
    }
  }
  return latest;
}

export async function readBatchFile(sessionId: string, filename: string): Promise<string | null> {
  const artifact = latestByFilename(
    await listArtifacts({ sessionId, step: BATCH_ARTIFACT_STEP }),
  ).get(filename);
  return artifact ? (await fetchArtifactContent(artifact.artifact_id)).content : null;
}

export interface BatchQuestionFiles {
  rubric: ArtifactRecord | null;
  grade: ArtifactRecord | null;
}

/** Legacy per-question rubrics and versioned whole-unit rubrics share this viewer. */
export async function listQuestionFiles(
  sessionId: string,
  questionId: string,
  groupId?: string,
): Promise<BatchQuestionFiles> {
  const latest = latestByFilename(await listArtifacts({ sessionId }));
  const prefix = `rubric_${groupId ? `group_${groupId}` : `question_${questionId}`}_`;
  const rubric = [...latest.values()]
    .filter((file) => file.step === BATCH_ARTIFACT_STEP && file.filename.startsWith(prefix))
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];
  return {
    rubric: rubric ?? latest.get(`rubric_${questionId}.md`) ?? null,
    grade: latest.get(gradeCsvFilename(questionId)) ?? null,
  };
}

export async function uploadBatchFile(
  sessionId: string,
  filename: string,
  content: string,
  type: string,
): Promise<void> {
  await uploadUserArtifact(sessionId, new File([content], filename, { type }), {
    step: BATCH_ARTIFACT_STEP,
  });
}

export async function listSessionActiveRuns(sessionId: string): Promise<BatchActiveRun[]> {
  return (await chatbotRepository.getActiveRuns())
    .filter((run) => run.sessionId === sessionId)
    .map((run) => ({ id: run.id, status: run.status }));
}

export async function startBatchRun(
  sessionId: string,
  prompt: string,
  modelId: string | undefined,
): Promise<void> {
  await chatbotRepository.startRun(sessionId, prompt, { modelOverride: modelId });
}

export async function cancelBatchRun(runId: string): Promise<void> {
  await chatbotRepository.cancelRun(runId);
}

const sameRunIds = (a: readonly BatchActiveRun[], b: readonly BatchActiveRun[]) =>
  a.length === b.length && a.every((run) => b.some((other) => other.id === run.id));

/**
 * `previous` is the last state read for this session. Its messages only map runs to
 * questions and record how finished runs ended, so they are re-read only when the
 * set of active runs changes.
 */
export async function fetchBatchRemoteState(
  contestId: string,
  sessionId: string,
  previous?: Pick<BatchRemoteState, "messages" | "activeRuns">,
): Promise<BatchRemoteState> {
  const [activeRuns, artifacts, writes] = await Promise.all([
    listSessionActiveRuns(sessionId),
    listArtifacts({ sessionId, step: BATCH_ARTIFACT_STEP }),
    getBatchGradeWrites(contestId, sessionId),
  ]);
  const messages =
    previous && sameRunIds(previous.activeRuns, activeRuns)
      ? previous.messages
      : (await chatbotRepository.getSession(sessionId)).messages;
  const latest = latestByFilename(artifacts);
  const read = async (artifact: ArtifactRecord | undefined) =>
    artifact ? (await fetchArtifactContent(artifact.artifact_id)).content : null;
  const writtenEntries = await Promise.all(
    [...latest.entries()]
      .filter(([filename]) => filename.startsWith(WRITTEN_PREFIX))
      .map(async ([filename, artifact]) => [
        filename.slice(WRITTEN_PREFIX.length, -".csv".length),
        (await read(artifact)) ?? "",
      ] as const),
  );
  const draftEntries = activeRuns.length
    ? await Promise.all(
        [...latest.entries()]
          .filter(([filename]) => /^grade_.+\.csv$/.test(filename))
          .map(async ([filename, artifact]) => [
            filename.slice("grade_".length, -".csv".length),
            countScoredRows(await read(artifact)),
          ] as const),
      )
    : [];
  return {
    messages,
    activeRuns,
    draftCounts: Object.fromEntries(draftEntries),
    progressCsv: await read(latest.get(PROGRESS_CSV_FILENAME)),
    writtenCsv: mergeBatchWrites(Object.fromEntries(writtenEntries), writes),
  };
}


/** Receipts recover missing CSVs and suppress writes that were later changed/revoked. */
export function mergeBatchWrites(csvByQuestion: Record<string, string>, writes: BatchGradeWrite[]): Record<string, string> {
  const merged = { ...csvByQuestion };
  for (const questionId of new Set(writes.map((write) => write.question_id))) {
    const records = new Map(parseWrittenCsv(merged[questionId] ?? null).map((row) => [row.examAnswerId, row]));
    for (const write of writes.filter((row) => row.question_id === questionId)) {
      if (write.current) {
        records.set(write.exam_answer_id, {
          examAnswerId: write.exam_answer_id, score: write.score, feedback: write.feedback,
        });
      } else {
        records.delete(write.exam_answer_id);
      }
    }
    merged[questionId] = serializeCsvRows([
      ["exam_answer_id", "score", "feedback"],
      ...[...records.values()].map((row) => [row.examAnswerId, String(row.score), row.feedback]),
    ]);
  }
  return merged;
}

export async function readBatchWritten(contestId: string, sessionId: string, questionId: string): Promise<string | null> {
  const [csv, writes] = await Promise.all([
    readBatchFile(sessionId, writtenCsvFilename(questionId)),
    getBatchGradeWrites(contestId, sessionId),
  ]);
  return mergeBatchWrites({ [questionId]: csv ?? "" }, writes)[questionId] ?? null;
}

export async function defaultBatchModelId(): Promise<string> {
  const models = await chatbotRepository.getModels();
  const model = models.find((item) => item.is_default) ?? models[0];
  if (!model) throw new Error("沒有可用的批改模型");
  return model.model_id;
}

export async function readBatchModelId(sessionId: string): Promise<string> {
  const config = JSON.parse((await readBatchFile(sessionId, BATCH_JSON_FILENAME)) ?? "{}");
  if (typeof config.model_id === "string" && config.model_id) return config.model_id;
  // Existing batches predate model persistence. Recover the actual model from
  // their first grading run, ignoring subsequent sidebar chats or model drift.
  const session = await chatbotRepository.getSession(sessionId);
  const runId = session.messages.find((message) =>
    message.role === "user" && message.runId && /^batch_question_id:/.test(message.content),
  )?.runId;
  const modelId = runId
    ? (await getChatRun(runId)).modelId
    : await defaultBatchModelId();
  if (!modelId) throw new Error("無法確認原批改模型，請稍後重試");
  await uploadBatchFile(sessionId, BATCH_JSON_FILENAME, JSON.stringify({ ...config, model_id: modelId }), "application/json");
  return modelId;
}
